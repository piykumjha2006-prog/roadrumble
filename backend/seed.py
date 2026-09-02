import os
import base64
from datetime import datetime, timedelta
from pathlib import Path
from sqlmodel import Session, select
from app.database import engine, init_db
from app.models import Pothole
from app.pdf_generator import generate_complaint_pdf

UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Minimal 1x1 valid JPEG image binary
TINY_JPEG_B64 = "slash9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

def create_dummy_image(filename: str) -> str:
    filepath = UPLOADS_DIR / filename
    with open(filepath, "wb") as f:
        f.write(base64.b64decode(TINY_JPEG_B64))
    return str(filepath)

SEED_POTHOLES = [
    {
        "lat": 12.9716,
        "lng": 77.5946,
        "confidence": 0.92,
        "road_name": "MG Road, Central District",
        "hit_count": 5,
        "complaint_status": "none"
    },
    {
        "lat": 12.9784,
        "lng": 77.6408,
        "confidence": 0.87,
        "road_name": "100 Feet Rd, Indiranagar",
        "hit_count": 3,
        "complaint_status": "none"
    },
    {
        "lat": 12.9352,
        "lng": 77.6245,
        "confidence": 0.76,
        "road_name": "80 Feet Rd, Koramangala",
        "hit_count": 2,
        "complaint_status": "none"
    },
    {
        "lat": 12.9279,
        "lng": 77.5837,
        "confidence": 0.65,
        "road_name": "Jayanagar 4th Block Main Rd",
        "hit_count": 1,
        "complaint_status": "none"
    },
    {
        "lat": 12.9698,
        "lng": 77.7500,
        "confidence": 0.89,
        "road_name": "ITPL Main Rd, Whitefield",
        "hit_count": 4,
        "complaint_status": "none"
    }
]

def seed_database():
    init_db()
    with Session(engine) as session:
        existing = len(session.exec(select(Pothole)).all())
        if existing > 0:
            print(f"[Seed] Database already contains {existing} potholes. Skipping seed.")
            return

        print("[Seed] Seeding initial demo pothole records...")
        now = datetime.utcnow()

        for idx, item in enumerate(SEED_POTHOLES, 1):
            img_file = f"placeholder_{idx}.jpg"
            img_path = create_dummy_image(img_file)

            pothole = Pothole(
                lat=item["lat"],
                lng=item["lng"],
                timestamp=now - timedelta(hours=idx * 3),
                confidence=item["confidence"],
                road_name=item["road_name"],
                image_path=img_path,
                hit_count=item["hit_count"],
                last_seen=now - timedelta(minutes=idx * 15),
                complaint_status=item["complaint_status"]
            )
            session.add(pothole)
            session.commit()
            session.refresh(pothole)

            # Pre-generate complaint PDF for item #1
            if idx == 1:
                try:
                    generate_complaint_pdf(pothole)
                    pothole.complaint_status = "generated"
                    session.add(pothole)
                    session.commit()
                except Exception as e:
                    print(f"[Seed PDF Error]: {e}")

            print(f"  [Pothole #{pothole.id}] {pothole.road_name} ({pothole.lat}, {pothole.lng})")

        print("[Seed] Database seeding complete!")

if __name__ == "__main__":
    seed_database()
