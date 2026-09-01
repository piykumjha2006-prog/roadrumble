import argparse
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
from PIL import Image, ImageDraw
from sqlmodel import Session, delete, select

from app.database import engine, init_db
from app.models import Pothole, get_utc_now

UPLOADS_DIR = Path("uploads")
COMPLAINTS_DIR = Path("complaints")

DEFAULT_CITY_LAT = float(os.getenv("CITY_LAT", "12.9716"))
DEFAULT_CITY_LNG = float(os.getenv("CITY_LNG", "77.5946"))


def reset_db_and_uploads(target_engine=None):
    """Clears all pothole DB records and wipes uploads/complaints directories."""
    db_engine = target_engine if target_engine is not None else engine
    init_db()

    # Clear DB table
    with Session(db_engine) as session:
        session.exec(delete(Pothole))
        session.commit()

    # Clear uploads directory (keep .gitkeep)
    if UPLOADS_DIR.exists():
        for item in UPLOADS_DIR.iterdir():
            if item.is_file() and item.name != ".gitkeep":
                try:
                    item.unlink()
                except Exception:
                    pass

    # Clear complaints directory (keep .gitkeep)
    if COMPLAINTS_DIR.exists():
        for item in COMPLAINTS_DIR.iterdir():
            if item.is_file() and item.name != ".gitkeep":
                try:
                    item.unlink()
                except Exception:
                    pass

    print("Reset completed: DB cleared, uploads and complaints directories wiped.")


def generate_placeholder_image(output_path: Path, pothole_id: int, road_name: str):
    """Generates a clean placeholder JPEG image for demo purposes."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    img = Image.new("RGB", (640, 480), color=(44, 62, 80))
    draw = ImageDraw.Draw(img)

    # Draw hazard marker graphic
    draw.rectangle([40, 40, 600, 440], outline=(231, 76, 60), width=4)

    text_lines = [
        "ROAD RUMBLE - SAMPLE DETECTION PHOTO",
        f"Pothole ID: #{pothole_id}",
        f"Location: {road_name}",
        "Status: Verified Road Hazard",
    ]

    y = 120
    for line in text_lines:
        draw.text((80, y), line, fill=(236, 240, 241))
        y += 50

    img.save(output_path, "JPEG")


def seed_potholes(
    center_lat: float = DEFAULT_CITY_LAT,
    center_lng: float = DEFAULT_CITY_LNG,
    target_engine=None,
):
    """Seeds 6 realistic sample potholes centered around specified city coordinates."""
    db_engine = target_engine if target_engine is not None else engine
    init_db()
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)

    now = get_utc_now()

    sample_data = [
        {
            "lat_offset": 0.0021,
            "lng_offset": 0.0034,
            "road_name": "100 Feet Rd, Indiranagar",
            "confidence": 0.92,
            "hit_count": 4,
            "ward_number": "Ward 112",
            "contractor_info": "Bruhat Bengaluru Infra Pvt Ltd",
            "hours_ago": 1,
            "complaint_status": "none",
        },
        {
            "lat_offset": -0.0042,
            "lng_offset": 0.0051,
            "road_name": "MG Road Metro Station Junction",
            "confidence": 0.88,
            "hit_count": 2,
            "ward_number": "Ward 111",
            "contractor_info": "L&T Urban Infrastructure",
            "hours_ago": 4,
            "complaint_status": "generated",
        },
        {
            "lat_offset": 0.0063,
            "lng_offset": -0.0031,
            "road_name": "Koramangala 80ft Road",
            "confidence": 0.85,
            "hit_count": 1,
            "ward_number": "Ward 148",
            "contractor_info": "BBMP South Zone Maintenance",
            "hours_ago": 12,
            "complaint_status": "none",
        },
        {
            "lat_offset": -0.0055,
            "lng_offset": -0.0062,
            "road_name": "Outer Ring Road, Marathahalli Flyover",
            "confidence": 0.94,
            "hit_count": 5,
            "ward_number": "Ward 85",
            "contractor_info": "Karnataka Road Infra Ltd",
            "hours_ago": 24,
            "complaint_status": "generated",
        },
        {
            "lat_offset": 0.0012,
            "lng_offset": -0.0015,
            "road_name": "Cubbon Park Main Road",
            "confidence": 0.79,
            "hit_count": 1,
            "ward_number": "Ward 110",
            "contractor_info": "Central Civil Works Corp",
            "hours_ago": 36,
            "complaint_status": "none",
        },
        {
            "lat_offset": 0.0081,
            "lng_offset": 0.0075,
            "road_name": "Commercial Street Crossing",
            "confidence": 0.90,
            "hit_count": 3,
            "ward_number": "Ward 113",
            "contractor_info": "Bangalore City Infrastructure",
            "hours_ago": 48,
            "complaint_status": "none",
        },
    ]

    seeded_records = []

    with Session(db_engine) as session:
        for idx, item in enumerate(sample_data, start=1):
            lat = round(center_lat + item["lat_offset"], 6)
            lng = round(center_lng + item["lng_offset"], 6)
            ts = now - timedelta(hours=item["hours_ago"])

            img_filename = f"{idx}.jpg"
            img_path = UPLOADS_DIR / img_filename
            generate_placeholder_image(img_path, idx, item["road_name"])

            pothole = Pothole(
                lat=lat,
                lng=lng,
                timestamp=ts,
                confidence=item["confidence"],
                road_name=item["road_name"],
                image_path=f"uploads/{img_filename}",
                hit_count=item["hit_count"],
                last_seen=ts,
                complaint_status=item["complaint_status"],
                ward_number=item["ward_number"],
                contractor_info=item["contractor_info"],
            )

            session.add(pothole)
            seeded_records.append(pothole)

        session.commit()

    print(f"Successfully seeded {len(seeded_records)} sample potholes centered at ({center_lat}, {center_lng}).")
    return len(seeded_records)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed or Reset Road Rumble demo database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Clear database and wipe uploaded images/complaints",
    )
    args = parser.parse_args()

    if args.reset:
        reset_db_and_uploads()
    else:
        seed_potholes()
