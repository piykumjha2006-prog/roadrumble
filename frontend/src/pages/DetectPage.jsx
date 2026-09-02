import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, AlertTriangle, Play, Square, RefreshCw, Navigation, CheckCircle2, Sparkles, Sliders, ShieldAlert } from 'lucide-react';
import { detectorInstance } from '../services/detector';
import { uploaderInstance } from '../services/uploader';
import InAppDebugPanel from '../components/InAppDebugPanel';

export default function DetectPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const watchIdRef = useRef(null);
  const inferenceIntervalRef = useRef(null);
  const lastUploadTimeRef = useRef(0);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsError, setGpsError] = useState(null);

  const [modelStatus, setModelStatus] = useState('loading'); // 'loading' | 'onnx' | 'demo'
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  
  const [currentDetections, setCurrentDetections] = useState([]);
  const [lastCapturedImage, setLastCapturedImage] = useState(null);

  // 1. Initialize ONNX Model
  useEffect(() => {
    async function initModel() {
      setModelStatus('loading');
      const loaded = await detectorInstance.loadModel('/models/pothole-yolov8n.onnx');
      if (loaded) {
        setModelStatus('onnx');
        setIsDemoMode(false);
      } else {
        setModelStatus('demo');
        setIsDemoMode(true);
      }
    }
    initModel();
  }, []);

  // 2. Camera Setup
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(console.error);
        };
      }
      setIsCameraActive(true);
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'Unable to access rear camera');
      setIsCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // 3. Geolocation Tracker
  const startGpsTracking = useCallback(() => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
        });
        setGpsError(null);
      },
      (err) => {
        setGpsError(err.message || 'Location access denied or unavailable');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, []);

  const stopGpsTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    startGpsTracking();
    return () => {
      stopCamera();
      stopGpsTracking();
    };
  }, [startCamera, startGpsTracking, stopCamera, stopGpsTracking]);

  // 4. JPEG Frame Capture
  const captureFrame = useCallback(() => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      
      const width = video?.videoWidth || 640;
      const height = video?.videoHeight || 480;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (video && isCameraActive && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, width, height);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText('POTHOLE CAPTURE FRAME', width / 4, height / 2);
      }

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const previewUrl = URL.createObjectURL(blob);
            setLastCapturedImage(previewUrl);
            resolve({
              blob,
              lat: gpsLocation?.lat || 12.9716,
              lng: gpsLocation?.lng || 77.5946,
              timestamp: new Date().toISOString(),
            });
          } else {
            reject(new Error('Failed to generate frame blob'));
          }
        },
        'image/jpeg',
        0.85
      );
    });
  }, [isCameraActive, gpsLocation]);

  // 5. Detection Trigger with 3-Second Debounce & Auto-Upload Queue
  const handleDetectionTrigger = useCallback(
    async (detection) => {
      const now = Date.now();
      // Debounce check: at least 3 seconds between uploads
      if (now - lastUploadTimeRef.current < 3000) {
        return;
      }
      lastUploadTimeRef.current = now;

      try {
        const frameData = await captureFrame();
        await uploaderInstance.uploadDetection({
          blob: frameData.blob,
          lat: frameData.lat,
          lng: frameData.lng,
          timestamp: frameData.timestamp,
          confidence: detection.confidence,
        });
      } catch (err) {
        console.error('Detection upload trigger error:', err);
      }
    },
    [captureFrame]
  );

  // 6. ~5 FPS Inference & Overlay Rendering Loop
  useEffect(() => {
    if (inferenceIntervalRef.current) {
      clearInterval(inferenceIntervalRef.current);
    }

    inferenceIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (!overlayCanvas) return;

      const ctx = overlayCanvas.getContext('2d');
      const width = video?.videoWidth || overlayCanvas.clientWidth || 640;
      const height = video?.videoHeight || overlayCanvas.clientHeight || 480;

      if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
        overlayCanvas.width = width;
        overlayCanvas.height = height;
      }

      let detections = [];

      if (!isDemoMode && detectorInstance.modelLoaded && video && video.readyState >= 2) {
        detections = await detectorInstance.detect(video, confidenceThreshold);
      } else if (isDemoMode) {
        detections = detectorInstance.generateSyntheticDetections(width, height)
          .filter((d) => d.confidence >= confidenceThreshold);
      }

      setCurrentDetections(detections);
      detectorInstance.drawBoundingBoxes(ctx, detections, width, height);

      // Trigger automatic capture & upload if detection >= threshold
      if (detections.length > 0) {
        const topDetection = detections[0];
        handleDetectionTrigger(topDetection);
      }
    }, 200);

    return () => {
      if (inferenceIntervalRef.current) {
        clearInterval(inferenceIntervalRef.current);
      }
    };
  }, [isDemoMode, confidenceThreshold, handleDetectionTrigger]);

  return (
    <div className="space-y-4 pb-4">
      {/* High Contrast Status Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Camera className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Passive Hazard Logging</h2>
              <p className="text-xs text-slate-400 font-medium">Silently maps potholes for community alerts</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 text-xs font-black uppercase tracking-wider rounded-full flex items-center gap-1.5 ${
                modelStatus === 'onnx'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {modelStatus === 'onnx' ? 'ONNX Active' : 'Demo Mode'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Video Viewport + Overlay Canvas */}
      <div className="relative aspect-[4/3] w-full bg-slate-950 rounded-2xl border-2 border-slate-800 overflow-hidden shadow-2xl group flex items-center justify-center">
        {/* Hidden Canvas for JPEG Capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Live Camera Video Feed */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isCameraActive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Bounding Box Drawing Overlay */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Camera Permission / Fallback View */}
        {(!isCameraActive || cameraError) && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-xl">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200">
                {cameraError ? 'Camera Access Issue' : 'Camera Paused'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                {cameraError || 'Camera feed paused. Tap below to resume live detection.'}
              </p>
            </div>
            <button
              onClick={startCamera}
              className="touch-target px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-amber-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              Start Camera
            </button>
          </div>
        )}

        {/* HUD Top-Left Overlay: GPS Coordinates */}
        <div className="absolute top-3 left-3 z-20 bg-slate-900/90 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-2 shadow-xl">
          <Navigation className={`w-3.5 h-3.5 ${gpsLocation ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
          {gpsLocation ? (
            <div className="flex flex-col text-[11px] leading-tight">
              <span className="text-emerald-400 font-bold">
                {gpsLocation.lat.toFixed(5)}, {gpsLocation.lng.toFixed(5)}
              </span>
              <span className="text-[9px] text-slate-400">
                Acc: ±{gpsLocation.accuracy.toFixed(1)}m
              </span>
            </div>
          ) : (
            <span className="text-amber-300 font-semibold text-[11px]">
              {gpsError ? 'GPS Error' : 'Fixing GPS...'}
            </span>
          )}
        </div>

        {/* HUD Top-Right Overlay: Inference Hazard Counter */}
        <div className="absolute top-3 right-3 z-20 bg-slate-900/90 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] font-mono flex items-center gap-1.5 shadow-xl">
          {currentDetections.length > 0 ? (
            <span className="text-rose-400 font-black animate-pulse flex flex-col items-end gap-0.5">
              <span className="flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                POTHOLE DETECTED!
              </span>
              {currentDetections[0].distanceM != null && (
                <span className="text-cyan-300 font-bold text-[10px]">
                  {currentDetections[0].sizeCategory?.toUpperCase() || 'UNKNOWN'} • ~{currentDetections[0].distanceM}m away
                  {currentDetections[0].sizeM ? ` • ${currentDetections[0].sizeM}m wide` : ''}
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-300 font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Scanning @ 5 FPS
            </span>
          )}
        </div>
      </div>

      {/* Confidence Threshold Slider */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-md">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-amber-400" />
            Detection Threshold
          </span>
          <span className="text-amber-400 font-mono font-bold text-sm">
            {Math.round(confidenceThreshold * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.2"
          max="0.9"
          step="0.05"
          value={confidenceThreshold}
          onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>20% (High Sensitivity)</span>
          <span>90% (Strict)</span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {isCameraActive ? (
          <button
            onClick={stopCamera}
            className="touch-target bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
          >
            <Square className="w-4 h-4 fill-current" />
            Pause Feed
          </button>
        ) : (
          <button
            onClick={startCamera}
            className="touch-target bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            Start Camera
          </button>
        )}

        <button
          onClick={() => setIsDemoMode(!isDemoMode)}
          className={`touch-target font-bold text-sm uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
            isDemoMode
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 shadow-md'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          {isDemoMode ? 'Demo Mode: ON' : 'Real ONNX'}
        </button>
      </div>

      {/* In-App Debug Console Panel */}
      <InAppDebugPanel />
    </div>
  );
}
