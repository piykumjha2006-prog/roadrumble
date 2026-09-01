import math
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from app.models import Pothole


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the great circle distance in meters between two points
    on the earth (specified in decimal degrees) using the Haversine formula.
    """
    R = 6371000.0  # Earth radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return R * c


def format_pothole_response(pothole: Pothole) -> Dict[str, Any]:
    """
    Formats a Pothole SQLModel instance into the exact contract JSON object dictionary.
    """
    timestamp_str = (
        pothole.timestamp.isoformat() + "Z"
        if isinstance(pothole.timestamp, datetime)
        and not pothole.timestamp.isoformat().endswith("Z")
        else str(pothole.timestamp)
    )
    last_seen_str = (
        pothole.last_seen.isoformat() + "Z"
        if isinstance(pothole.last_seen, datetime)
        and not pothole.last_seen.isoformat().endswith("Z")
        else str(pothole.last_seen)
    )

    image_url = pothole.image_path
    if image_url and not image_url.startswith("/"):
        image_url = f"/{image_url}"

    res = {
        "id": pothole.id,
        "lat": pothole.lat,
        "lng": pothole.lng,
        "timestamp": timestamp_str,
        "confidence": pothole.confidence,
        "road_name": pothole.road_name,
        "image_url": image_url,
        "hit_count": pothole.hit_count,
        "last_seen": last_seen_str,
        "complaint_status": pothole.complaint_status,
    }

    if pothole.ward_number is not None:
        res["ward_number"] = pothole.ward_number
    if pothole.contractor_info is not None:
        res["contractor_info"] = pothole.contractor_info

    return res


def generate_complaint_pdf(pothole: Pothole, pdf_path: Path) -> Path:
    """
    Generates a clean one-page PDF civic complaint document using ReportLab.
    """
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1A365D"),
        spaceAfter=12,
    )

    subtitle_style = ParagraphStyle(
        "SubTitleStyle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#2B6CB0"),
        spaceAfter=14,
    )

    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#2D3748"),
        spaceAfter=10,
    )

    story = []

    # Title Banner
    story.append(Paragraph("Pothole Complaint — Road Rumble", title_style))
    story.append(
        Paragraph("Official Civic Grievance & Repair Request", subtitle_style)
    )
    story.append(Spacer(1, 8))

    # Metadata Table
    gmaps_link = (
        f"https://www.google.com/maps/search/?api=1&query={pothole.lat},{pothole.lng}"
    )
    gmaps_paragraph = f'<a href="{gmaps_link}" color="blue"><u>{pothole.lat}, {pothole.lng}</u></a>'

    date_str = (
        pothole.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
        if isinstance(pothole.timestamp, datetime)
        else str(pothole.timestamp)
    )

    table_data = [
        ["Complaint ID:", f"RR-COMP-{pothole.id}"],
        ["Road / Location:", pothole.road_name or "Unspecified Road / Pending Geocode"],
        ["GPS Coordinates:", Paragraph(gmaps_paragraph, body_style)],
        ["Detection Date:", date_str],
        ["Detection Confidence:", f"{round(pothole.confidence * 100, 1)}%"],
        ["Times Detected (Hit Count):", str(pothole.hit_count)],
    ]

    if pothole.ward_number:
        table_data.append(["Ward Number:", pothole.ward_number])
    if pothole.contractor_info:
        table_data.append(["Contractor Info:", pothole.contractor_info])

    t = Table(table_data, colWidths=[160, 360])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EDF2F7")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#2D3748")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E0")),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 14))

    # Embedded Photo (if valid image exists)
    if pothole.image_path:
        img_path = Path(pothole.image_path)
        if not img_path.exists():
            img_path = Path("uploads") / f"{pothole.id}.jpg"

        if img_path.exists() and img_path.is_file():
            try:
                # Validate image before embedding
                with PILImage.open(img_path) as pil_img:
                    pil_img.verify()

                story.append(Paragraph("<b>Evidence Photograph:</b>", body_style))
                story.append(Spacer(1, 4))
                rl_img = RLImage(str(img_path), width=260, height=195)
                story.append(rl_img)
                story.append(Spacer(1, 12))
            except Exception:
                pass

    # Formal Complaint Statement
    story.append(Paragraph("<b>To the Municipal Corporation / Road Maintenance Division,</b>", body_style))
    story.append(Spacer(1, 4))

    letter_text = (
        f"This is an automated civic complaint issued via the Road Rumble platform regarding a dangerous road hazard. "
        f"The pothole at <b>{pothole.road_name or 'the above GPS location'}</b> has been flagged with high AI confidence "
        f"({round(pothole.confidence * 100, 1)}%) and logged multiple times (Hit Count: {pothole.hit_count}).<br/><br/>"
        f"Severe road hazards compromise motorist and pedestrian safety, increase traffic congestion, and damage vehicles. "
        f"We request your department to conduct an urgent site inspection and schedule asphalt patching/repair.<br/><br/>"
        f"Thank you for your prompt action in maintaining safe public infrastructure."
    )
    story.append(Paragraph(letter_text, body_style))

    doc.build(story)
    return pdf_path
