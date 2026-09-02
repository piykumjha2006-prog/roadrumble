import * as ort from 'onnxruntime-web';

// Configure ONNX WASM paths if needed
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';

// Pinhole camera approximation: distance to object from its bounding box height.
// Typical dashcam FOV ~ 60° vertical => focal length in pixels for a 720p frame.
const KNOWN_BOX_HEIGHT_AT_1M = 0.65; // normalized bbox height (fraction of frame) of a 30cm pothole at 1m
const POTHOLE_REF_WIDTH_M = 0.35; // typical large pothole ~35cm across, used for size scaling

// Estimate real-world distance (meters) to detected object from bbox geometry.
// Uses inverse-square falloff of apparent size in a pinhole camera model.
export function estimateDistance(bboxHeightNorm, frameHeight) {
  // bboxHeightNorm: height of bbox as fraction of frame height (0..1)
  if (!bboxHeightNorm || bboxHeightNorm <= 0) return null;
  const dist = (POTHOLE_REF_WIDTH_M * 1.0) / bboxHeightNorm; // meters, approx
  return Math.round(Math.min(Math.max(dist, 0.5), 60) * 10) / 10;
}

// Estimate physical size of pothole given apparent bbox size + estimated distance
export function estimateSizeMeters(bboxWidthNorm, bboxHeightNorm, distanceM) {
  if (!distanceM || !bboxWidthNorm || !bboxHeightNorm) return null;
  // Simple pinhole: realWidth ≈ apparentNormWidth * distance * FOVfactor
  const realW = bboxWidthNorm * distanceM * 1.2;
  const realH = bboxHeightNorm * distanceM * 1.2;
  const avg = (realW + realH) / 2;
  return Math.round(Math.min(Math.max(avg, 0.05), 3) * 100) / 100;
}

export function sizeCategory(sizeM) {
  if (sizeM == null) return 'unknown';
  if (sizeM < 0.3) return 'small';
  if (sizeM < 0.7) return 'medium';
  return 'large';
}

export class PotholeDetector {
  constructor() {
    this.session = null;
    this.modelLoaded = false;
    this.inputShape = [1, 3, 640, 640];
    this.isInitializing = false;
  }

  async loadModel(modelPath = '/models/pothole-yolov8n.onnx') {
    if (this.modelLoaded || this.isInitializing) return this.modelLoaded;
    this.isInitializing = true;

    try {
      // Check if file exists via HEAD request first
      const checkRes = await fetch(modelPath, { method: 'HEAD' });
      if (!checkRes.ok) {
        console.warn(`[PotholeDetector] Model file not found at ${modelPath}. Running in Stub/Demo mode.`);
        this.modelLoaded = false;
        this.isInitializing = false;
        return false;
      }

      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['webgl', 'wasm'],
        graphOptimizationLevel: 'all',
      });

      this.modelLoaded = true;
      console.log('[PotholeDetector] YOLOv8n ONNX model loaded successfully!');
    } catch (err) {
      console.warn('[PotholeDetector] ONNX model load failed, using Demo mode:', err.message);
      this.modelLoaded = false;
    } finally {
      this.isInitializing = false;
    }

    return this.modelLoaded;
  }

  // Preprocess HTMLVideoElement frame into float32 Tensor [1, 3, 640, 640]
  preprocess(video) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 640, 640);
    const imgData = ctx.getImageData(0, 0, 640, 640);
    const { data } = imgData;

    const float32Data = new Float32Array(3 * 640 * 640);
    for (let i = 0; i < 640 * 640; i++) {
      float32Data[i] = data[i * 4] / 255.0; // R
      float32Data[640 * 640 + i] = data[i * 4 + 1] / 255.0; // G
      float32Data[2 * 640 * 640 + i] = data[i * 4 + 2] / 255.0; // B
    }

    return new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
  }

  // Real inference execution
  async detect(video, confidenceThreshold = 0.5) {
    if (!this.modelLoaded || !this.session) {
      return [];
    }

    try {
      const tensor = this.preprocess(video);
      const inputName = this.session.inputNames[0];
      const outputs = await this.session.run({ [inputName]: tensor });
      const outputTensor = outputs[this.session.outputNames[0]];

      return this.postprocess(outputTensor, video.videoWidth, video.videoHeight, confidenceThreshold);
    } catch (err) {
      console.error('[PotholeDetector] Inference error:', err);
      return [];
    }
  }

  // YOLOv8 Output parser [1, 5, 8400]
  postprocess(outputTensor, frameWidth, frameHeight, threshold) {
    const [_, numChannels, numAnchors] = outputTensor.dims; // e.g. [1, 5, 8400]
    const data = outputTensor.data;
    const detections = [];

    const scaleX = frameWidth / 640;
    const scaleY = frameHeight / 640;

    for (let i = 0; i < numAnchors; i++) {
      const confidence = data[4 * numAnchors + i];
      if (confidence >= threshold) {
        const cx = data[0 * numAnchors + i] * scaleX;
        const cy = data[1 * numAnchors + i] * scaleY;
        const w = data[2 * numAnchors + i] * scaleX;
        const h = data[3 * numAnchors + i] * scaleY;

        const x = Math.max(0, cx - w / 2);
        const y = Math.max(0, cy - h / 2);

        // Enrich with size + distance estimates
        const bboxHeightNorm = h / frameHeight;
        const bboxWidthNorm = w / frameWidth;
        const distanceM = estimateDistance(bboxHeightNorm, frameHeight);
        const sizeM = estimateSizeMeters(bboxWidthNorm, bboxHeightNorm, distanceM);

        detections.push({
          box: [x, y, w, h],
          confidence: parseFloat(confidence.toFixed(2)),
          class: 'pothole',
          distanceM,
          sizeM,
          sizeCategory: sizeCategory(sizeM),
        });
      }
    }

    return this.nms(detections, 0.45);
  }

  // Simple Non-Maximum Suppression (NMS)
  nms(detections, iouThreshold) {
    detections.sort((a, b) => b.confidence - a.confidence);
    const result = [];

    while (detections.length > 0) {
      const best = detections.shift();
      result.push(best);

      for (let i = detections.length - 1; i >= 0; i--) {
        if (this.calculateIoU(best.box, detections[i].box) > iouThreshold) {
          detections.splice(i, 1);
        }
      }
    }

    return result;
  }

  calculateIoU(boxA, boxB) {
    const [xA, yA, wA, hA] = boxA;
    const [xB, yB, wB, hB] = boxB;

    const x1 = Math.max(xA, xB);
    const y1 = Math.max(yA, yB);
    const x2 = Math.min(xA + wA, xB + wB);
    const y2 = Math.min(yA + hA, yB + hB);

    const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const boxAArea = wA * hA;
    const boxBArea = wB * hB;

    return interArea / (boxAArea + boxBArea - interArea);
  }

  // Generate synthetic detections for Demo Mode testing
  generateSyntheticDetections(frameWidth = 640, frameHeight = 480) {
    const now = Date.now();
    // Cycle a detection every 3 seconds for 1.5s duration
    const cycle = Math.floor(now / 3000) % 2;
    if (cycle === 0) return [];

    const x = frameWidth * 0.25;
    const y = frameHeight * 0.45;
    const w = frameWidth * 0.45;
    const h = frameHeight * 0.35;
    const confidence = 0.87 + (Math.sin(now / 200) * 0.05);

    // Synthesize plausible distance/size values for demo mode too
    const bboxHeightNorm = h / frameHeight;
    const distanceM = estimateDistance(bboxHeightNorm, frameHeight);
    const sizeM = estimateSizeMeters(w / frameWidth, bboxHeightNorm, distanceM);

    return [
      {
        box: [x, y, w, h],
        confidence: parseFloat(confidence.toFixed(2)),
        class: 'pothole (demo)',
        distanceM,
        sizeM,
        sizeCategory: sizeCategory(sizeM),
      },
    ];
  }

  // Render bounding boxes on overlay canvas
  drawBoundingBoxes(ctx, detections, frameWidth, frameHeight) {
    ctx.clearRect(0, 0, frameWidth, frameHeight);

    detections.forEach(({ box, confidence, class: label, distanceM, sizeM, sizeCategory: cat }) => {
      const [x, y, w, h] = box;

      // Glow effect background
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(x, y, w, h);

      // Bounding box border
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      // Corner target marks
      const cornerLen = Math.min(w, h) * 0.2;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;

      // Top-Left Corner
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();

      // Top-Right Corner
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + cornerLen);
      ctx.stroke();

      // Label Tag
      const tagText = `⚠️ POTHOLE ${Math.round(confidence * 100)}%`;
      ctx.font = 'bold 12px monospace';
      const textWidth = ctx.measureText(tagText).width;

      const tagHeight = 22;
      const tagY = Math.max(0, y - tagHeight);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, tagY, textWidth + 14, tagHeight);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, tagY, textWidth + 14, tagHeight);

      ctx.fillStyle = '#f59e0b';
      ctx.fillText(tagText, x + 7, tagY + 15);

      // Size + distance info tag (second line)
      if (distanceM != null) {
        const infoText = `${cat ? cat.toUpperCase() : ''} • ~${distanceM}m away${sizeM ? ` • ${sizeM}m` : ''}`;
        ctx.font = 'bold 11px monospace';
        const infoWidth = ctx.measureText(infoText).width;
        const infoY = tagY + tagHeight + 2;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.fillRect(x, infoY, infoWidth + 12, 18);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(infoText, x + 6, infoY + 13);
      }
    });
  }
}

export const detectorInstance = new PotholeDetector();
