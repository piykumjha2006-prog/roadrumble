# Road Rumble — Backend API Service

Python FastAPI + SQLite service providing pothole ingestion, 5-meter Haversine GPS deduplication, reverse geocoding, ReportLab PDF complaint generation, and mailto links.

---

## 🛠️ Setup & Running

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Seed initial demo potholes (optional but recommended for hackathon demo)
python seed.py

# Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```

---

## 📄 API Endpoints Summary

- **`GET /api/health`** — Returns `{"status": "ok"}`
- **`POST /api/potholes`** — Log a detection (`multipart/form-data`: `lat`, `lng`, `timestamp`, `confidence`, `image`). Merges duplicates within 5m.
- **`GET /api/potholes`** — Array of logged potholes for the map & reports view.
- **`GET /api/potholes/{id}`** — Single pothole details.
- **`POST /api/potholes/{id}/complaint`** — Generates PDF complaint in `/complaints/{id}.pdf` and returns pre-filled `mailto:` link.
- **`POST /api/reset`** — Resets SQLite DB and clears `/uploads` and `/complaints`.

---

## 🧪 Testing

Run pytest suite to verify 5m deduplication, ingest, and complaint PDF generation:

```bash
pytest
```

---

## 🔒 HTTPS Tunnel Setup (Prompt I2)

Mobile browsers require HTTPS to access Camera & GPS APIs. Expose local FastAPI backend & Vite dev server using `cloudflared` or `ngrok`:

```bash
# Terminal 1: Expose Vite frontend (port 3000)
cloudflared tunnel --url http://localhost:3000

# Terminal 2: Expose FastAPI backend (port 8000)
cloudflared tunnel --url http://localhost:8000
```
Update `VITE_API_URL` in `frontend/.env` to the HTTPS backend URL.
