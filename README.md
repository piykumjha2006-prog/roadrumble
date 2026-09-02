# Road Rumble 🚗💥

> **AI-Powered Real-Time Pothole Detection, Geolocation & Automated Civic Complaint System**

Road Rumble combines real-time computer vision (YOLOv8 ONNX in-browser inference), GPS tracking, duplicate pothole detection within a 5-meter radius, interactive hazard radar mapping, and automated PDF complaint & mailto generation.

---

## 🏗️ Merged Architecture & Tech Stack

- **Frontend**: React + Vite + TailwindCSS + Leaflet Maps + `onnxruntime-web` (PWA enabled in `frontend/`)
- **Backend**: Python FastAPI + SQLModel + SQLite (`road_rumble.db`) + ReportLab PDF Generator (in `backend/`)
- **Integration**: The FastAPI server mounts and serves the production React PWA frontend (`frontend/dist`) on the root route `/`, creating a single unified web server running on port `8000`.

---

## 🚀 Quick Start Guide

### 1. Build the Frontend PWA
```bash
npm run build:frontend
```
*(Creates production assets in `frontend/dist`)*

### 2. Run the Merged Server (Frontend + Backend)
```bash
npm start
```
*Or directly via Python in `backend/`:*
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser at:
👉 **[http://localhost:8000](http://localhost:8000)**

- **Frontend PWA**: `http://localhost:8000/`
- **Swagger API Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/api/health`

---

## 🧪 Testing

Run backend pytest suite (ingest, 5m dedup, complaint generation, SPA static serving):
```bash
npm run test:backend
```

Seed initial sample potholes:
```bash
npm run seed
```

---

## 📱 Features Included

1. **Detect Tab**: Real-time camera feed with GPS tracking overlay & YOLOv8/Demo mode detection.
2. **Map Tab**: Live Leaflet radar map with hazard severity colors, hit counters, and instant complaint filing.
3. **Reports Tab**: Comprehensive list of detected hazards, image previews, and downloadable civic complaint PDFs.
4. **Proximity Alert Banner**: Audio beep & warning banner when approaching known pothole locations.