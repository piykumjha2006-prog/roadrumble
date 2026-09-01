# Road Rumble — Build Plan & AI Prompts (2-Person Team)

Hackathon MVP · Web/PWA + Python stack · Version 1.0

This doc gives you: (1) the tech stack per layer, (2) how to split the work between 2 people, (3) the **shared API contract** both of you must agree on before coding so you never block each other, and (4) ready-to-paste prompts for an AI coding assistant.

---

## 0. TL;DR — Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | React + Vite + Tailwind, Leaflet (maps) | Fast to build, runs in phone browser, componentized. Vanilla JS is a fine fallback. |
| **Camera / GPS** | Browser `getUserMedia` + `Geolocation` API | No native app, no install. Works on any modern phone browser (needs HTTPS). |
| **On-device ML** | YOLOv8n → exported to ONNX, run via `onnxruntime-web` (WASM/WebGL) | Real-time-ish inference in the browser. Cloud fallback if too slow. |
| **Backend** | Python FastAPI + Uvicorn | Minimal boilerplate, auto Swagger docs, great for a 2-day build. |
| **Database** | SQLite via SQLModel (SQLAlchemy) | Zero setup, single file, perfect for hackathon. Swap to Postgres/PostGIS later. |
| **Complaint gen** | ReportLab (PDF) + `mailto:` deep link | Produces a submittable PDF + a pre-filled email with no portal dependency. |
| **Reverse geocoding** | OpenStreetMap Nominatim (free) | No API key needed. Google Maps Geocoding is the paid alternative. |
| **Photo storage** | Filesystem (`/uploads`) + URL in DB | Simplest; base64-in-DB is the lazy fallback. |
| **Hosting for demo** | `ngrok`/`cloudflared` tunnel over local backend + Vite dev server | Gives you HTTPS (required for camera/GPS on phones) instantly. |

> HTTPS is non-negotiable: phone browsers block camera and GPS on plain HTTP. Use a tunnel (ngrok/cloudflared) or `localhost` during dev.

---

## 1. Work Split (2 members)

The seam is the **HTTP API**. Agree on the contract in Section 2 first, then each person builds their side against it independently.

| | **Member A — Client & Detection** | **Member B — Backend, Data & Complaints** |
|---|---|---|
| **Owns** | Everything on the phone/browser + the ML model | Everything on the server + data + complaint output |
| **Tasks** | PWA shell, camera+GPS capture, YOLOv8 training & ONNX export, in-browser inference, detection→capture logic, map view (Leaflet), proximity "X m ahead" alert | FastAPI service, SQLite schema, POST/GET pothole endpoints, GPS-radius dedup, reverse geocoding, complaint PDF + mailto generator, map-data endpoint |
| **Repo folders** | `frontend/`, `ml/` | `backend/` |
| **Primary skills** | JS/React, TF/PyTorch, CV | Python, REST, SQL |
| **Demo responsibility** | The live ride + detection + alert | The map filling with pins + complaint PDF opening |

**Why this split:** detection is client-side, so the model and the app that runs it stay with one person (no cross-team handoff of tensors). The other person owns the entire server stack end-to-end. The only shared surface is the JSON contract.

---

## 2. Shared API Contract (agree on this FIRST)

Both members build against this. Freeze it before writing code. Base URL e.g. `http://localhost:8000`.

**`GET /api/health`** → `{ "status": "ok" }`

**`POST /api/potholes`** — log a detection (multipart/form-data)
```
fields:  lat (float), lng (float), timestamp (ISO8601 str),
         confidence (float 0-1), image (file, jpg/png)
returns: {
  "id": 12,
  "status": "new" | "duplicate",   // duplicate = merged into existing within 5 m
  "record": { ...full pothole object below }
}
```

**`GET /api/potholes`** → array of pothole objects (for the map)
```json
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
```

**`POST /api/potholes/{id}/complaint`** → generate the complaint
```json
returns: {
  "pdf_url": "/complaints/12.pdf",
  "mailto": "mailto:grievance@ghmc.gov.in?subject=...&body=...",
  "prefilled": { "road_name": "...", "coordinates": "...", "date": "..." }
}
```

**Dedup rule (server-side):** on `POST`, compute haversine distance to all existing potholes. If any is within **5 m**, increment its `hit_count`, bump `last_seen`, keep the max `confidence`, and return `status: "duplicate"` with that record. Otherwise create new.

**CORS:** backend must allow the frontend origin (`allow_origins=["*"]` is fine for the hackathon).

### Repo layout
```
road-rumble/
├── frontend/          # Member A — React + Vite PWA
├── ml/                # Member A — YOLOv8 training + ONNX export
├── backend/           # Member B — FastAPI + SQLite
│   ├── app/
│   ├── uploads/       # saved pothole photos
│   └── complaints/    # generated PDFs
├── docs/api-contract.md
└── README.md
```

---

## 3. Prompts — Member A (Client & Detection)

Paste these one at a time into your AI coding assistant, in order. Each builds on the last.

### A1 — Scaffold the PWA
```
Create a React + Vite + Tailwind project called "road-rumble-frontend" configured as
an installable PWA (add vite-plugin-pwa with a manifest: name "Road Rumble", standalone
display, an icon). Set up 3 tabs/routes using react-router: "Detect" (default), "Map",
and "Reports". Add a top app bar with the app name and a small connection-status dot
that pings GET {VITE_API_URL}/api/health every 10s (green = ok, red = down). Read the
backend base URL from an env var VITE_API_URL (default http://localhost:8000). Keep the
UI dark, high-contrast, and large-tap-target since it's used while driving. Give me the
full file tree and all files.
```

### A2 — Camera + GPS capture
```
On the "Detect" screen, use navigator.mediaDevices.getUserMedia to show a live rear-camera
video feed (facingMode: "environment") filling the screen. Continuously read GPS via
navigator.geolocation.watchPosition (enableHighAccuracy) and show current lat/lng + accuracy
in a corner overlay. Handle permission denials gracefully with a retry button. Add a helper
captureFrame() that grabs the current video frame to a canvas and returns a JPEG Blob.
Remember camera/GPS require HTTPS or localhost — note that in a README.
```

### A3 — In-browser pothole inference
```
Add on-device pothole detection to the Detect screen using onnxruntime-web. Load a model
from /public/models/pothole-yolov8n.onnx (I'll provide it later; for now stub it so the app
still runs without the file). Run inference on the video feed at ~5 FPS (not every frame, to
save battery). Draw bounding boxes over detected potholes on a canvas overlay with the
confidence score. Expose an onDetection(box, confidence) callback. Include a "Demo mode"
toggle that, when the real model is absent, fires synthetic detections so I can test the full
pipeline. Keep all inference off the main thread with a web worker if feasible.
```

### A4 — Detection → capture → upload
```
When a detection fires above a confidence threshold (default 0.5, make it a slider), and no
detection has fired in the last 3 seconds (debounce), do: capture the current frame as JPEG,
read the latest GPS fix, and POST multipart/form-data to {VITE_API_URL}/api/potholes with
fields lat, lng, timestamp (ISO8601), confidence, image. Show a toast "Pothole logged" and
handle the "duplicate" status quietly (toast "Already reported"). Queue uploads and retry on
network failure so we never lose a detection. Log everything to an in-app debug panel.
```

### A5 — Map view
```
Build the "Map" tab with Leaflet + OpenStreetMap tiles. On load, GET {VITE_API_URL}/api/potholes
and drop a marker for each pothole; marker popup shows the photo (image_url), road_name,
confidence, hit_count, and a "File Complaint" button that calls
POST /api/potholes/{id}/complaint and then opens the returned pdf_url in a new tab and the
mailto link. Refresh markers every 15s. Center the map on the user's current GPS. Color
markers by confidence (red = high).
```

### A6 — Proximity "X m ahead" alert (stretch)
```
Add a proximity alert: while on any screen, continuously compare the user's live GPS against
the list of known pothole coordinates (fetched + cached from /api/potholes). Using the
haversine formula, if the user is within ~30 m and closing on a pothole, show a large red
banner "⚠ Pothole ~Xm ahead" and play a short beep (Web Audio API). Debounce so the same
pothole only alerts once per approach. This is the two-phone/second-pass warning feature.
```

### A7 — ML: train & export the model
```
Write a Python script in ml/ using Ultralytics YOLOv8 that: (1) downloads a pothole dataset
from Roboflow (leave the API key/dataset slug as a config var with a comment on where to get
one), (2) fine-tunes yolov8n for pothole detection (single class "pothole") for a modest
number of epochs suitable for a hackathon, (3) reports precision/recall/mAP on a held-out
split, and (4) exports the best weights to ONNX (imgsz 640) so it can run in onnxruntime-web.
Also add a quick predict.py to sanity-check the model on a folder of test images and save
annotated outputs. Include a requirements.txt and README with the exact commands.
```

---

## 4. Prompts — Member B (Backend, Data & Complaints)

Paste in order into your AI coding assistant.

### B1 — Scaffold FastAPI + SQLite
```
Create a Python FastAPI project called "road-rumble-backend" using SQLModel over SQLite
(file road_rumble.db). Set up uvicorn, CORS allowing all origins, a /uploads static mount
for photos and a /complaints static mount for PDFs. Define a Pothole model with fields:
id (pk), lat (float), lng (float), timestamp (datetime), confidence (float), road_name
(str, nullable), image_path (str), hit_count (int, default 1), last_seen (datetime),
complaint_status (str, default "none"). Add GET /api/health returning {"status":"ok"}.
Auto-create tables on startup. Give me the full file tree and a README with run commands.
```

### B2 — Ingest endpoint with GPS-radius dedup
```
Implement POST /api/potholes accepting multipart/form-data: lat, lng, timestamp,
confidence, image (UploadFile). On each request, compute the haversine distance from the
new point to every existing pothole. If the nearest existing pothole is within 5 meters,
treat it as a duplicate: increment its hit_count, set last_seen to now, keep the higher
confidence, do NOT save a new photo, and return {"status":"duplicate","record":...}.
Otherwise save the uploaded image to /uploads/{id}.jpg, create a new row, and return
{"status":"new","record":...}. Return the full pothole object matching this shape:
[paste the pothole JSON object from the API contract]. Write a haversine helper and a
couple of pytest tests proving the dedup radius works.
```

### B3 — Read endpoints
```
Add GET /api/potholes returning all potholes as a JSON array in the exact contract shape
(include image_url as "/uploads/{id}.jpg"). Add GET /api/potholes/{id} for a single record
(404 if missing). Support optional query params: min_confidence and since (ISO date) to
filter. Order by last_seen desc.
```

### B4 — Reverse geocoding
```
Add reverse geocoding using OpenStreetMap Nominatim (respect their usage policy: set a
User-Agent, cache results, throttle to <=1 req/sec). When a NEW pothole is created, look up
its road/area name from lat/lng and store it in road_name. Do this in a background task so
the POST response isn't blocked. Make the geocoder pluggable so we can swap in Google Maps
Geocoding (read GEOCODER + GOOGLE_API_KEY from env). If geocoding fails, leave road_name null
and don't crash.
```

### B5 — Complaint generator (PDF + mailto)
```
Add POST /api/potholes/{id}/complaint that generates a civic complaint for that pothole.
Use ReportLab to build a clean one-page PDF containing: a title "Pothole Complaint — Road
Rumble", the embedded pothole photo, road_name, GPS coordinates (with a Google Maps link),
date/time of detection, hit_count, and a placeholder complaint body addressed to the
municipal corporation requesting repair. Save it to /complaints/{id}.pdf. Also build a
mailto: link with a pre-filled subject and URL-encoded body containing the same details
(target email configurable via env, default a placeholder like grievance@example.gov.in).
Set the pothole's complaint_status to "generated". Return {"pdf_url","mailto","prefilled"}
per the contract. Add ward_number and contractor_info as optional fields that get included
if present (for the manually-researched demo roads).
```

### B6 — Seed + demo data
```
Add a seed script that inserts 5-6 sample potholes around a chosen city center (make the
center configurable) with placeholder photos, so the map and complaint features can be demoed
even without a live ride. Add a "reset" endpoint or CLI flag to clear the DB and uploads
between demo runs.
```

---

## 5. Integration & Demo Prompts (do together)

### I1 — Wire frontend to backend
```
Point the frontend VITE_API_URL at the running backend. Verify: (1) health dot turns green,
(2) a detection (use Demo mode) POSTs and appears on the Map tab, (3) a repeat detection at
the same spot returns "duplicate" and increments hit_count, (4) "File Complaint" opens a real
PDF. Fix any CORS or field-name mismatches against the API contract.
```

### I2 — HTTPS tunnel for phone testing
```
Give me the exact commands to expose the local backend and the Vite dev server over HTTPS
using cloudflared (or ngrok) so I can open the app on my phone and use the camera + GPS.
Update VITE_API_URL to the tunneled backend URL.
```

### I3 — Demo dry-run checklist
```
Write a 1-page demo runbook: what to open, in what order, the exact narration for a 3-minute
pitch, and a fallback plan if the live camera fails (use recorded footage / Demo mode / seed
data). Include the success metrics we'll quote: detection precision/recall on a test clip and
end-to-end latency from detection to complaint-ready.
```

---

## 6. Suggested build order (parallel)

| Time | Member A | Member B |
|---|---|---|
| **Hour 0** | Agree API contract (Section 2), create repo | Agree API contract, create repo |
| **Block 1** | A1 scaffold → A2 camera/GPS | B1 scaffold → B2 ingest + dedup |
| **Block 2** | A3 inference (Demo mode) → A4 upload | B3 read endpoints → B6 seed data |
| **Integrate** | I1 wire together (Demo mode end-to-end) | I1 wire together |
| **Block 3** | A5 map view | B4 geocoding → B5 complaint PDF |
| **Block 4** | A7 train real model → swap into A3 | polish complaint template, ward/contractor fields |
| **Stretch** | A6 proximity alert | portal-specific submission / email tuning |
| **Final** | I2 tunnel + I3 runbook | I2 tunnel + I3 runbook |

Key idea: get to **I1 (end-to-end in Demo mode)** as fast as possible — a working pipeline with a fake detector beats a great detector with nothing around it. Swap the real YOLO model in only once everything else works.

---

## 7. What to have running for the judges

1. Phone opens the PWA over HTTPS → live camera + GPS overlay.
2. Detection fires (real model on a test clip, or Demo mode) → toast "Pothole logged".
3. Map tab fills with a pin at the correct GPS location, photo in the popup.
4. Second pass over the same spot → no duplicate pin, hit_count goes up.
5. Tap "File Complaint" → a real PDF opens with photo + road name + coordinates + date, plus a pre-filled email.
6. (Stretch) Approaching a known pothole → "⚠ Pothole ~10m ahead" banner + beep.

Sources: derived from your Road Rumble PRD v1.0 (Aug 30, 2026).