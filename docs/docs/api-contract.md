Both members build against this. Freeze it before writing code. Base URL e.g. http://localhost:8000.

GET /api/health → { "status": "ok" }

POST /api/potholes — log a detection (multipart/form-data)

fields:  lat (float), lng (float), timestamp (ISO8601 str),
         confidence (float 0-1), image (file, jpg/png)
returns: {
  "id": 12,
  "status": "new" | "duplicate",   // duplicate = merged into existing within 5 m
  "record": { ...full pothole object below }
}

GET /api/potholes → array of pothole objects (for the map)

json
[{
  "id": 12,
  "lat": 12.9716, "lng": 77.5946,
  "timestamp": "2026-08-31T10:22:05Z",
  "confidence": 0.87,
  "road_name": "100 Feet Rd, Indiranagar",   // null until geocoded
  "image_url": "/uploads/12.jpg",
  "hit_count": 3,                              // times seen (dedup counter)
  "last_seen": "2026-08-31T18:40:00Z",
  "complaint_status": "none" | "generated" | "submitted"
}]

POST /api/potholes/{id}/complaint → generate the complaint

json
returns: {
  "pdf_url": "/complaints/12.pdf",
  "mailto": "mailto:grievance@ghmc.gov.in?subject=...&body=...",
  "prefilled": { "road_name": "...", "coordinates": "...", "date": "..." }
}

Dedup rule (server-side): on POST, compute haversine distance to all existing potholes. If any is within 5 m, increment its hit_count, bump last_seen, keep the max confidence, and return status: "duplicate" with that record. Otherwise create new.

CORS: backend must allow the frontend origin (allow_origins=["*"] is fine for the hackathon).

Repo layout
road-rumble/
├── frontend/          # Member A — React + Vite PWA
├── ml/                # Member A — YOLOv8 training + ONNX export
├── backend/           # Member B — FastAPI + SQLite
│   ├── app/
│   ├── uploads/       # saved pothole photos
│   └── complaints/    # generated PDFs
├── docs/api-contract.md
└── README.md