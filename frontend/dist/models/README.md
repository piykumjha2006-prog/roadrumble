# ONNX Pothole Detection Model Directory

Place your fine-tuned YOLOv8n ONNX model file here:
`public/models/pothole-yolov8n.onnx`

When present, the frontend will automatically load this model into `onnxruntime-web` (WebGL/WASM) for real-time in-browser inference.
If the model file is not present, the app automatically runs in **Demo Mode** with synthetic pothole detections for full end-to-end testing.
