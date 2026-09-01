from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Optional, List
from urllib.parse import quote

from fastapi import (
    FastAPI,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Query,
    UploadFile,
    HTTPException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.database import init_db, get_session, engine
from app.models import Pothole, get_utc_now
from app.utils import (
    haversine_distance,
    format_pothole_response,
    generate_complaint_pdf,
)
from app.geocoder import get_geocoder
from seed import seed_potholes, reset_db_and_uploads

# Ensure static directories exist
UPLOADS_DIR = Path("uploads")
COMPLAINTS_DIR = Path("complaints")

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)


async def process_reverse_geocode(pothole_id: int, lat: float, lng: float):
    """Background task worker to perform reverse geocoding without blocking HTTP response."""
    try:
        geocoder = get_geocoder()
        road_name = await geocoder.reverse_geocode(lat, lng)
        if road_name:
            with Session(engine) as session:
                pothole = session.get(Pothole, pothole_id)
                if pothole:
                    pothole.road_name = road_name
                    session.add(pothole)
                    session.commit()
    except Exception:
        # If geocoding fails, leave road_name null and don't crash
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Road Rumble Backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/complaints", StaticFiles(directory=str(COMPLAINTS_DIR)), name="complaints")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/seed")
def seed_demo_data(
    center_lat: Optional[float] = Query(None),
    center_lng: Optional[float] = Query(None),
    session: Session = Depends(get_session),
):
    lat = center_lat if center_lat is not None else float(os.getenv("CITY_LAT", "12.9716"))
    lng = center_lng if center_lng is not None else float(os.getenv("CITY_LNG", "77.5946"))
    target_eng = session.bind if session.bind is not None else engine
    count = seed_potholes(lat, lng, target_engine=target_eng)
    return {
        "status": "ok",
        "message": f"Successfully seeded {count} demo potholes",
        "count": count,
    }


@app.post("/api/reset")
def reset_demo_data(
    session: Session = Depends(get_session),
):
    target_eng = session.bind if session.bind is not None else engine
    reset_db_and_uploads(target_engine=target_eng)
    return {"status": "ok", "message": "Database and upload files reset successfully"}


@app.get("/api/potholes")
def get_all_potholes(
    min_confidence: Optional[float] = Query(None),
    since: Optional[str] = Query(None),
    session: Session = Depends(get_session),
):
    statement = select(Pothole)

    if min_confidence is not None:
        statement = statement.where(Pothole.confidence >= min_confidence)

    if since:
        try:
            clean_since = since.replace("Z", "+00:00")
            since_dt = datetime.fromisoformat(clean_since)
            if since_dt.tzinfo is not None:
                since_dt = since_dt.astimezone(timezone.utc).replace(tzinfo=None)
            statement = statement.where(Pothole.last_seen >= since_dt)
        except ValueError:
            pass

    statement = statement.order_by(Pothole.last_seen.desc())
    potholes = session.exec(statement).all()

    return [format_pothole_response(p) for p in potholes]


@app.get("/api/potholes/{id}")
def get_pothole_by_id(
    id: int,
    session: Session = Depends(get_session),
):
    pothole = session.get(Pothole, id)
    if not pothole:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pothole not found",
        )
    return format_pothole_response(pothole)


@app.post("/api/potholes", status_code=status.HTTP_201_CREATED)
async def ingest_pothole(
    background_tasks: BackgroundTasks,
    lat: float = Form(...),
    lng: float = Form(...),
    confidence: float = Form(...),
    timestamp: Optional[str] = Form(None),
    image: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    # Parse timestamp or default to current UTC time
    parsed_timestamp = get_utc_now()
    if timestamp:
        try:
            clean_ts = timestamp.replace("Z", "+00:00")
            parsed_ts = datetime.fromisoformat(clean_ts)
            if parsed_ts.tzinfo is not None:
                parsed_timestamp = parsed_ts.astimezone(timezone.utc).replace(tzinfo=None)
            else:
                parsed_timestamp = parsed_ts
        except ValueError:
            pass

    # Query all existing potholes for GPS radius deduplication
    existing_potholes = session.exec(select(Pothole)).all()

    nearest_pothole = None
    min_distance = float("inf")

    for pothole in existing_potholes:
        dist = haversine_distance(lat, lng, pothole.lat, pothole.lng)
        if dist < min_distance:
            min_distance = dist
            nearest_pothole = pothole

    # Deduplication check: 5 meters radius
    if nearest_pothole is not None and min_distance <= 5.0:
        nearest_pothole.hit_count += 1
        nearest_pothole.last_seen = get_utc_now()
        if confidence > nearest_pothole.confidence:
            nearest_pothole.confidence = confidence

        session.add(nearest_pothole)
        session.commit()
        session.refresh(nearest_pothole)

        # Do NOT save new photo file
        return {
            "status": "duplicate",
            "record": format_pothole_response(nearest_pothole),
        }

    # New pothole record creation
    new_pothole = Pothole(
        lat=lat,
        lng=lng,
        timestamp=parsed_timestamp,
        confidence=confidence,
        road_name=None,
        image_path="",
        hit_count=1,
        last_seen=get_utc_now(),
        complaint_status="none",
    )

    session.add(new_pothole)
    session.commit()
    session.refresh(new_pothole)

    # Save uploaded image file to /uploads/{id}.jpg
    image_filename = f"{new_pothole.id}.jpg"
    image_file_path = UPLOADS_DIR / image_filename

    contents = await image.read()
    with open(image_file_path, "wb") as f:
        f.write(contents)

    new_pothole.image_path = f"uploads/{image_filename}"
    session.add(new_pothole)
    session.commit()
    session.refresh(new_pothole)

    # Trigger reverse geocoding in background task
    background_tasks.add_task(process_reverse_geocode, new_pothole.id, lat, lng)

    return {
        "status": "new",
        "record": format_pothole_response(new_pothole),
    }


@app.post("/api/potholes/{id}/complaint")
def generate_complaint(
    id: int,
    session: Session = Depends(get_session),
):
    pothole = session.get(Pothole, id)
    if not pothole:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pothole not found",
        )

    # Generate ReportLab PDF file
    pdf_filename = f"{pothole.id}.pdf"
    pdf_file_path = COMPLAINTS_DIR / pdf_filename
    generate_complaint_pdf(pothole, pdf_file_path)

    # Update complaint_status to "generated"
    pothole.complaint_status = "generated"
    session.add(pothole)
    session.commit()
    session.refresh(pothole)

    # Build mailto URL
    target_email = os.getenv("GRIEVANCE_EMAIL", "grievance@example.gov.in")
    subject = f"Pothole Complaint - {pothole.road_name or 'Road Repair Request'}"

    gmaps_url = f"https://www.google.com/maps/search/?api=1&query={pothole.lat},{pothole.lng}"
    extra_ward = f"- Ward Number: {pothole.ward_number}\n" if pothole.ward_number else ""
    extra_contractor = (
        f"- Responsible Contractor: {pothole.contractor_info}\n"
        if pothole.contractor_info
        else ""
    )

    body = (
        f"To Municipal Corporation / Grievance Redressal Cell,\n\n"
        f"A severe road hazard (pothole) has been reported via Road Rumble:\n"
        f"- Location: {pothole.road_name or 'Unspecified Road'}\n"
        f"- GPS Coordinates: {pothole.lat}, {pothole.lng}\n"
        f"- Google Maps Link: {gmaps_url}\n"
        f"- Total Detections: {pothole.hit_count}\n"
        f"{extra_ward}{extra_contractor}\n"
        f"Please inspect and repair this road hazard promptly to maintain public safety.\n\n"
        f"Generated by Road Rumble"
    )

    mailto_url = f"mailto:{target_email}?subject={quote(subject)}&body={quote(body)}"

    date_str = (
        pothole.timestamp.strftime("%Y-%m-%d")
        if isinstance(pothole.timestamp, datetime)
        else str(pothole.timestamp)[:10]
    )

    prefilled_data = {
        "road_name": pothole.road_name or "Unspecified Road",
        "coordinates": f"{pothole.lat}, {pothole.lng}",
        "date": date_str,
    }
    if pothole.ward_number:
        prefilled_data["ward_number"] = pothole.ward_number
    if pothole.contractor_info:
        prefilled_data["contractor_info"] = pothole.contractor_info

    return {
        "pdf_url": f"/complaints/{pdf_filename}",
        "mailto": mailto_url,
        "prefilled": prefilled_data,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
