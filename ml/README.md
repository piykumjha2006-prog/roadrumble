# Road Rumble — ML Model Training & ONNX Export Pipeline

This directory contains the machine learning pipeline for fine-tuning a lightweight **YOLOv8n** object detection model on pothole datasets and deploying it as an ONNX web binary (`pothole-yolov8n.onnx`) for real-time in-browser inference in the Road Rumble PWA.

---

## 📋 Prerequisites & Environment Setup

```bash
# Navigate to the ml directory
cd ml

# Create virtual environment (recommended)
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

## 🔑 Roboflow API Setup

To download datasets directly from Roboflow Universe:
1. Create a free account at [Roboflow Universe](https://universe.roboflow.com/).
2. Get your API Key from **Account Settings -> Private API Key**.
3. Set your environment variable:

```bash
# Windows PowerShell
$env:ROBOFLOW_API_KEY="your_api_key_here"

# Linux / macOS / Bash
export ROBOFLOW_API_KEY="your_api_key_here"
```

---

## 🚀 1. Train & Fine-Tune Model (`train.py`)

Fine-tunes `yolov8n.pt` for pothole detection, reports Precision / Recall / mAP metrics, exports to ONNX format, and automatically deploys the generated `pothole-yolov8n.onnx` to `../frontend/public/models/`.

```bash
# Train using Roboflow API key
python train.py --epochs 25 --batch 16 --imgsz 640

# Train using a local data.yaml dataset file
python train.py --data ./path/to/data.yaml --epochs 25
```

### Metrics Reported:
- **Precision (P)**: Percentage of correct pothole detections.
- **Recall (R)**: Percentage of true potholes detected.
- **mAP@50**: Mean Average Precision at IoU threshold 0.50.
- **mAP@50-95**: Mean Average Precision averaged across IoU thresholds 0.50 to 0.95.

---

## 📦 2. Export Existing Weights to ONNX Only

If you already have trained weights (`.pt`) and only want to re-export and deploy to the frontend:

```bash
python train.py --export-only --weights ./runs/detect/pothole_yolov8n/weights/best.pt
```

---

## 🔍 3. Sanity-Check Predictions (`predict.py`)

Test the trained model on a folder of test images to visually verify bounding boxes and confidence scores:

```bash
# Place sample road images in ml/test_images/
python predict.py --source ./test_images --conf 0.4
```

Annotated output images with bounding boxes will be saved to `./runs/predict_outputs/`.
