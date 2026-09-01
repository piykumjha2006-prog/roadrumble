import os
import sys
import argparse
from pathlib import Path
import cv2

def run_prediction(source_dir, weights_path, output_dir, confidence):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[Error] Ultralytics not installed. Run: pip install -r requirements.txt")
        sys.exit(1)

    source_path = Path(source_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    if not source_path.exists():
        print(f"[Notice] Source path '{source_dir}' does not exist. Creating directory for test images...")
        source_path.mkdir(parents=True, exist_ok=True)
        print(f"Place test images (.jpg, .png) in '{source_path.resolve()}' and run again.")
        return

    image_files = list(source_path.glob("*.jpg")) + list(source_path.glob("*.png")) + list(source_path.glob("*.jpeg"))
    
    if len(image_files) == 0:
        print(f"[Notice] No image files found in '{source_dir}'. Supported formats: .jpg, .jpeg, .png")
        return

    print(f"\n[ML Predict] Loading model weights from: {weights_path}")
    model = YOLO(weights_path)

    print(f"[ML Predict] Running inference on {len(image_files)} test images (conf={confidence})...\n")

    for img_file in image_files:
        results = model.predict(
            source=str(img_file),
            conf=confidence,
            imgsz=640,
            save=False
        )

        for result in results:
            annotated_img = result.plot()
            out_file = output_path / f"predict_{img_file.name}"
            cv2.imwrite(str(out_file), annotated_img)
            
            num_detections = len(result.boxes)
            print(f"  📸 {img_file.name} -> {num_detections} pothole(s) detected. Saved: {out_file}")

    print(f"\n✅ All annotated prediction outputs saved to: {output_path.resolve()}")

def main():
    parser = argparse.ArgumentParser(description="Road Rumble — Sanity-Check Model Inference on Test Images")
    parser.add_argument("--source", type=str, default="./test_images", help="Folder containing test images")
    parser.add_argument("--weights", type=str, default="runs/detect/pothole_yolov8n/weights/best.pt", help="Path to weights file (.pt or .onnx)")
    parser.add_argument("--out", type=str, default="./runs/predict_outputs", help="Output directory for annotated images")
    parser.add_argument("--conf", type=float, default=0.4, help="Confidence threshold (0.0 to 1.0)")
    args = parser.parse_args()

    # Fallback to frontend ONNX model if PyTorch weights not built yet
    weights = args.weights
    if not os.path.exists(weights):
        frontend_onnx = "../frontend/public/models/pothole-yolov8n.onnx"
        if os.path.exists(frontend_onnx):
            weights = frontend_onnx

    run_prediction(args.source, weights, args.out, args.conf)

if __name__ == "__main__":
    main()
