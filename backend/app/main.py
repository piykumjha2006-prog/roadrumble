import math
import os
import shutil
import socket
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.database import init_db, get_session
from app.models import Pothole, PotholeResponse, ComplaintResponse
from app.geocoder import reverse_geocode
from app.pdf_generator import generate_complaint_pdf

# Initialize FastAPI App
app = FastAPI(
    title="Road Rumble API",
    description="Dashcam-based pothole detection & automated civic complaint backend",
    version="1.0.0"
)

# CORS Configuration (allow all origins for hackathon)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import FileResponse

# Ensure upload & complaint directories exist
UPLOADS_DIR = Path("uploads")
COMPLAINTS_DIR = Path("complaints")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)

# Static File Mounts
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/complaints", StaticFiles(directory="complaints"), name="complaints")

# Mount Frontend Dist build if available for merged single-server deployment
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if not FRONTEND_DIST.exists():
    FRONTEND_DIST = Path("frontend/dist")

if FRONTEND_DIST.exists():
    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")
    if (FRONTEND_DIST / "models").exists():
        app.mount("/models", StaticFiles(directory=str(FRONTEND_DIST / "models")), name="models")



@app.on_event("startup")
def on_startup():
    init_db()


# --- Haversine Distance Formula (meters) ---
def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * Math_atan2_sqrt(a) if hasattr(math, 'atan2') else 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def Math_atan2_sqrt(a: float) -> float:
    return math.atan2(math.sqrt(a), math.sqrt(1 - a))


def format_pothole_response(pothole: Pothole) -> PotholeResponse:
    image_url = f"/uploads/{Path(pothole.image_path).name}" if pothole.image_path else "/uploads/placeholder.jpg"
    return PotholeResponse(
        id=pothole.id,
        lat=pothole.lat,
        lng=pothole.lng,
        timestamp=pothole.timestamp.isoformat() + "Z" if isinstance(pothole.timestamp, datetime) else str(pothole.timestamp),
        confidence=pothole.confidence,
        road_name=pothole.road_name,
        image_url=image_url,
        hit_count=pothole.hit_count,
        last_seen=pothole.last_seen.isoformat() + "Z" if isinstance(pothole.last_seen, datetime) else str(pothole.last_seen),
        complaint_status=pothole.complaint_status
    )


# --- 1. Health & Server Info ---
def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/info")
def server_info():
    ip = get_lan_ip()
    return {
        "status": "ok",
        "lan_ip": ip,
        "port": 8000,
        "url": f"http://{ip}:8000"
    }



# --- 2. Ingest Endpoint with 5m GPS Dedup ---
@app.post("/api/potholes")
async def create_or_dedup_pothole(
    background_tasks: BackgroundTasks,
    lat: float = Form(...),
    lng: float = Form(...),
    timestamp: str = Form(...),
    confidence: float = Form(...),
    image: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    try:
        req_timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        req_timestamp = datetime.utcnow()

    # Dedup Check: Compute Haversine distance to all existing potholes
    existing_potholes = session.exec(select(Pothole)).all()
    nearest_pothole: Optional[Pothole] = None
    min_dist = float("inf")

    for p in existing_potholes:
        dist = haversine(lat, lng, p.lat, p.lng)
        if dist < min_dist:
            min_dist = dist
            nearest_pothole = p

    # 5 Meters Radius Dedup Rule
    if nearest_pothole and min_dist <= 5.0:
        nearest_pothole.hit_count += 1
        nearest_pothole.last_seen = datetime.utcnow()
        if confidence > nearest_pothole.confidence:
            nearest_pothole.confidence = confidence
        
        session.add(nearest_pothole)
        session.commit()
        session.refresh(nearest_pothole)

        return {
            "id": nearest_pothole.id,
            "status": "duplicate",
            "record": format_pothole_response(nearest_pothole)
        }

    # Otherwise Create New Pothole Record
    new_pothole = Pothole(
        lat=lat,
        lng=lng,
        timestamp=req_timestamp,
        confidence=confidence,
        hit_count=1,
        last_seen=datetime.utcnow(),
        complaint_status="none"
    )
    session.add(new_pothole)
    session.commit()
    session.refresh(new_pothole)

    # Save Uploaded Photo
    image_ext = Path(image.filename).suffix or ".jpg"
    image_filename = f"{new_pothole.id}{image_ext}"
    image_filepath = UPLOADS_DIR / image_filename

    with open(image_filepath, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    new_pothole.image_path = str(image_filepath)
    session.add(new_pothole)
    session.commit()
    session.refresh(new_pothole)

    # Background Task: Reverse Geocoding
    def background_geocode(p_id: int, p_lat: float, p_lng: float):
        road_name = reverse_geocode(p_lat, p_lng)
        with Session(app.state.engine if hasattr(app.state, 'engine') else init_db_engine()) as bg_session:
            p_record = bg_session.get(Pothole, p_id)
            if p_record:
                p_record.road_name = road_name
                bg_session.add(p_record)
                bg_session.commit()

    background_tasks.add_task(geocode_in_background, new_pothole.id, lat, lng)

    return {
        "id": new_pothole.id,
        "status": "new",
        "record": format_pothole_response(new_pothole)
    }


def geocode_in_background(p_id: int, lat: float, lng: float):
    from app.database import engine
    road_name = reverse_geocode(lat, lng)
    with Session(engine) as session:
        p = session.get(Pothole, p_id)
        if p:
            p.road_name = road_name
            session.add(p)
            session.commit()


# --- 3. Read Endpoints ---
@app.get("/api/potholes", response_model=List[PotholeResponse])
def get_potholes(
    min_confidence: Optional[float] = None,
    session: Session = Depends(get_session)
):
    query = select(Pothole).order_by(Pothole.last_seen.desc())
    if min_confidence is not None:
        query = query.where(Pothole.confidence >= min_confidence)

    records = session.exec(query).all()
    return [format_pothole_response(p) for p in records]


@app.get("/api/potholes/{pothole_id}", response_model=PotholeResponse)
def get_single_pothole(pothole_id: int, session: Session = Depends(get_session)):
    pothole = session.get(Pothole, pothole_id)
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")
    return format_pothole_response(pothole)


# --- 4. Complaint Generator Endpoint ---
@app.post("/api/potholes/{pothole_id}/complaint", response_model=ComplaintResponse)
def generate_complaint_endpoint(pothole_id: int, session: Session = Depends(get_session)):
    pothole = session.get(Pothole, pothole_id)
    if not pothole:
        raise HTTPException(status_code=404, detail="Pothole not found")

    pdf_url, mailto_url, prefilled_data = generate_complaint_pdf(pothole)

    pothole.complaint_status = "generated"
    session.add(pothole)
    session.commit()
    session.refresh(pothole)

    return ComplaintResponse(
        pdf_url=pdf_url,
        mailto=mailto_url,
        prefilled=prefilled_data
    )


# --- 5. Reset Endpoint ---
@app.post("/api/reset")
def reset_database(session: Session = Depends(get_session)):
    session.exec(Pothole.__table__.delete())
    session.commit()
    for folder in [UPLOADS_DIR, COMPLAINTS_DIR]:
        for f in folder.glob("*"):
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass
    return {"status": "reset", "message": "Database and upload files cleared."}


# --- 6. Merged Frontend SPA Fallback Route ---
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("uploads/") or full_path.startswith("complaints/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
        raise HTTPException(status_code=404, detail="Not found")
    
    if FRONTEND_DIST.exists():
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file))
    raise HTTPException(status_code=404, detail="Frontend build not found")

