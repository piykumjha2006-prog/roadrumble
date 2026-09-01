# Road Rumble Backend (`road-rumble-backend`)

A Python FastAPI backend for the Road Rumble project using SQLModel over SQLite (`road_rumble.db`).

## Features

- **FastAPI** framework with Uvicorn ASGI server.
- **SQLModel** ORM using SQLite database (`road_rumble.db`).
- **Pothole Model** with fields for spatial coordinates, detection timestamp, confidence, road name, image path, hit counts, last seen timestamp, and complaint status.
- **CORS Middleware** allowing all origins (`*`).
- **Static Mounts**:
  - `/uploads` static directory for photos.
  - `/complaints` static directory for PDFs.
- **Auto-create database tables** automatically on application startup.
- **Health Check Endpoint**: `GET /api/health` returning `{"status": "ok"}`.

---

## File Tree

```
road-rumble-backend/
├── app/
│   ├── __init__.py      # Package initializer
│   ├── main.py          # FastAPI app initialization, CORS, static mounts, lifespan DB startup & health check
│   ├── database.py      # SQLite engine creation & session provider
│   └── models.py        # SQLModel schema definition (Pothole model)
├── uploads/             # Static file storage for photos (mounted at /uploads)
│   └── .gitkeep
├── complaints/          # Static file storage for PDFs (mounted at /complaints)
│   └── .gitkeep
├── road_rumble.db       # SQLite database file (automatically created on startup)
├── requirements.txt     # Python dependency definitions
└── README.md            # Project documentation and run commands
```

---

## Setup & Run Instructions

### 1. Prerequisites

Ensure you have Python 3.9+ installed.

### 2. Create and Activate a Virtual Environment

#### On Windows (PowerShell):
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

#### On macOS / Linux:
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the Development Server

Execute Uvicorn from the `road-rumble-backend` directory:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Alternatively, you can run `main.py` directly:

```bash
python -m app.main
```

Upon server startup, SQLModel will automatically create the `road_rumble.db` SQLite database file and the `pothole` table.

---

## API Endpoints

### Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok"
}
```

### Static File Access

- Uploaded images: `http://localhost:8000/uploads/<filename>`
- Complaint PDFs: `http://localhost:8000/complaints/<filename>`

---

## SQLModel Schema (`Pothole`)

| Field Name | Type | Description |
|---|---|---|
| `id` | `Optional[int]` | Primary Key (autoincrement) |
| `lat` | `float` | Latitude coordinate |
| `lng` | `float` | Longitude coordinate |
| `timestamp` | `datetime` | Detection timestamp (UTC default) |
| `confidence` | `float` | AI model detection confidence score |
| `road_name` | `Optional[str]` | Road or street name (nullable) |
| `image_path` | `str` | Relative or absolute path to photo |
| `hit_count` | `int` | Frequency count of detections (default: 1) |
| `last_seen` | `datetime` | Last seen timestamp (UTC default) |
| `complaint_status` | `str` | Status of complaint process (default: "none") |
