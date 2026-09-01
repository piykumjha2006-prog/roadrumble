import os
import sys
import shutil
import argparse
from pathlib import Path

# --- Configuration defaults ---
# Get your free API key at https://app.roboflow.com/
ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "")
ROBOFLOW_WORKSPACE = os.getenv("ROBOFLOW_WORKSPACE", "pothole-detection")
ROBOFLOW_PROJECT = os.getenv("ROBOFLOW_PROJECT", "pothole-detection-v2")
ROBOFLOW_VERSION = int(os.getenv("ROBOFLOW_VERSION", "1"))

DEFAULT_EPOCHS = 25
DEFAULT_BATCH_SIZE = 16
DEFAULT_IMGSZ = 640


def download_roboflow_dataset(api_key, workspace, project, version):
    """Downloads dataset from Roboflow Universe."""
    try:
        from roboflow import Roboflow
        print(f"[ML] Downloading dataset from Roboflow ({workspace}/{project}/v{version})...")
        rf = Roboflow(api_key=api_key)
        proj = rf.workspace(workspace).project(project)
        dataset = proj.version(version).download("yolov8")
        print(f"[ML] Dataset downloaded to: {dataset.location}")
        return os.path.join(dataset.location, "data.yaml")
    except Exception as e:
        print(f"[ML Error] Roboflow dataset download failed: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Road Rumble — YOLOv8 Pothole Model Training & ONNX Export")
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=DEFAULT_BATCH_SIZE, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=DEFAULT_IMGSZ, help="Image size (e.g. 640)")
    parser.add_argument("--data", type=str, default="", help="Path to data.yaml file if already downloaded")
    parser.add_argument("--export-only", action="store_true", help="Export existing weights to ONNX without retraining")
    parser.add_argument("--weights", type=str, default="", help="Path to existing weights (.pt) for export-only")
    args = parser.parse_args()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ML Error] Ultralytics is not installed. Please run: pip install -r requirements.txt")
        sys.exit(1)

    data_yaml_path = args.data

    # Step 1: Download dataset if data.yaml not provided directly
    if not data_yaml_path and not args.export_only:
        if ROBOFLOW_API_KEY:
            data_yaml_path = download_roboflow_dataset(
                ROBOFLOW_API_KEY, ROBOFLOW_WORKSPACE, ROBOFLOW_PROJECT, ROBOFLOW_VERSION
            )
        else:
            print("\n[ML Notice] ROBOFLOW_API_KEY environment variable is not set.")
            print("To download directly from Roboflow, run:")
            print("  export ROBOFLOW_API_KEY='your_api_key_here'")
            print("Or pass a local dataset yaml file via: python train.py --data ./dataset/data.yaml\n")

    # Step 2: Fine-tune YOLOv8n
    if not args.export_only:
        if not data_yaml_path or not os.path.exists(data_yaml_path):
            print("[ML Error] No valid data.yaml found. Cannot proceed with training.")
            sys.exit(1)

        print(f"\n[ML] Starting YOLOv8n fine-tuning for {args.epochs} epochs (imgsz={args.imgsz})...")
        model = YOLO("yolov8n.pt")  # Load pre-trained COCO weights

        results = model.train(
            data=data_yaml_path,
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            name="pothole_yolov8n",
            exist_ok=True,
            plots=True
        )

        # Step 3: Evaluation Metrics Report
        print("\n" + "=" * 60)
        print("📊 MODEL EVALUATION & METRICS REPORT")
        print("=" * 60)
        metrics = model.val()
        precision = metrics.box.mp
        recall = metrics.box.mr
        map50 = metrics.box.map50
        map50_95 = metrics.box.map

        print(f"Precision  (P)    : {precision * 100:.2f}%")
        print(f"Recall     (R)    : {recall * 100:.2f}%")
        print(f"mAP @ 50          : {map50 * 100:.2f}%")
        print(f"mAP @ 50-95       : {map50_95 * 100:.2f}%")
        print("=" * 60 + "\n")

        weights_path = Path(results.save_dir) / "weights" / "best.pt"
    else:
        weights_path = Path(args.weights) if args.weights else Path("runs/detect/pothole_yolov8n/weights/best.pt")
        if not weights_path.exists():
            print(f"[ML Error] Weights file not found at {weights_path}")
            sys.exit(1)
        model = YOLO(str(weights_path))

    # Step 4: Export to ONNX format for onnxruntime-web
    print(f"\n[ML] Exporting model weights ({weights_path}) to ONNX format (imgsz={args.imgsz})...")
    exported_onnx_path = model.export(
        format="onnx",
        imgsz=args.imgsz,
        dynamic=False,
        opset=12,
        simplify=True
    )
    print(f"[ML] ONNX export complete: {exported_onnx_path}")

    # Step 5: Copy ONNX model to frontend public directory
    frontend_models_dir = Path("../frontend/public/models")
    frontend_models_dir.mkdir(parents=True, exist_ok=True)
    target_onnx_file = frontend_models_dir / "pothole-yolov8n.onnx"

    shutil.copy(exported_onnx_path, target_onnx_file)
    print(f"✅ Successfully deployed ONNX model to frontend: {target_onnx_file.resolve()}")


if __name__ == "__main__":
    main()
