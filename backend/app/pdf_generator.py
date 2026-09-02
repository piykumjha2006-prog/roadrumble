import os
import urllib.parse
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

COMPLAINTS_DIR = Path("complaints")
COMPLAINTS_DIR.mkdir(parents=True, exist_ok=True)

def generate_complaint_pdf(pothole) -> tuple[str, str, dict]:
    """Generates PDF complaint file and pre-filled mailto link."""
    pdf_filename = f"{pothole.id}.pdf"
    pdf_filepath = COMPLAINTS_DIR / pdf_filename

    doc = SimpleDocTemplate(
        str(pdf_filepath),
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#0f172a'),
        alignment=0,
        spaceAfter=12
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#64748b'),
        spaceAfter=18
    )

    heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#1e293b'),
        spaceBefore=10,
        spaceAfter=6
    )

    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontSize=10,
        leading=15,
        textColor=colors.HexColor('#334155'),
        spaceAfter=12
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("<b>CIVIC GRIEVANCE REPORT — ROAD DAMAGE</b>", title_style))
    story.append(Paragraph("<b>Generated via Road Rumble Automated Pothole Detection System</b>", subtitle_style))
    story.append(Spacer(1, 8))

    # 2. Metadata Table
    road_name = pothole.road_name or "Unnamed Road Location"
    maps_link = f"https://maps.google.com/?q={pothole.lat},{pothole.lng}"

    last_seen_str = pothole.last_seen.strftime("%Y-%m-%d %H:%M:%S UTC") if hasattr(pothole.last_seen, 'strftime') else str(pothole.last_seen)

    meta_data = [
        [Paragraph("<b>Report ID:</b>", body_style), Paragraph(f"RR-POT-{pothole.id:04d}", body_style)],
        [Paragraph("<b>Location / Road:</b>", body_style), Paragraph(f"<b>{road_name}</b>", body_style)],
        [Paragraph("<b>GPS Coordinates:</b>", body_style), Paragraph(f"{pothole.lat:.6f}, {pothole.lng:.6f} (<a href='{maps_link}'>Google Maps</a>)", body_style)],
        [Paragraph("<b>Detection Timestamp:</b>", body_style), Paragraph(last_seen_str, body_style)],
        [Paragraph("<b>AI Confidence:</b>", body_style), Paragraph(f"{int(pothole.confidence * 100)}%", body_style)],
        [Paragraph("<b>Recurrence Hits:</b>", body_style), Paragraph(f"Seen {pothole.hit_count} time(s)", body_style)],
    ]

    t = Table(meta_data, colWidths=[140, 380])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))

    # 3. Photo Frame (if photo exists and is valid JPEG/PNG image)
    if pothole.image_path and os.path.exists(pothole.image_path):
        try:
            img = Image(pothole.image_path, width=320, height=240)
            story.append(Paragraph("<b>Photographic Evidence:</b>", heading_style))
            story.append(img)
            story.append(Spacer(1, 14))
        except Exception:
            pass

    # 4. Formal Grievance Letter Body
    story.append(Paragraph("<b>Formal Complaint Text:</b>", heading_style))
    letter_text = (
        f"To,<br/>"
        f"The Executive Engineer / Grievance Officer,<br/>"
        f"Municipal Corporation & Public Works Department.<br/><br/>"
        f"<b>Subject: Urgent Road Repair Required — Dangerous Pothole at {road_name}</b><br/><br/>"
        f"Respected Sir/Madam,<br/><br/>"
        f"This is an automated civic alert reporting severe road surface damage detected at <b>{road_name}</b> "
        f"(GPS: {pothole.lat:.6f}, {pothole.lng:.6f}).<br/><br/>"
        f"The pothole poses an immediate safety risk to two-wheeler riders and vehicular traffic. "
        f"Our dashcam sensor system registered <b>{pothole.hit_count} detection pass(es)</b> with an AI confidence rating of <b>{int(pothole.confidence * 100)}%</b>.<br/><br/>"
        f"We request your department to inspect this location urgently and initiate patch repairs to prevent traffic accidents and vehicle damage.<br/><br/>"
        f"Yours faithfully,<br/>"
        f"<b>Road Rumble Citizen Alert Community</b>"
    )
    story.append(Paragraph(letter_text, body_style))

    doc.build(story)

    # 5. Mailto Link Generation
    target_email = os.getenv("GRIEVANCE_EMAIL", "grievance@ghmc.gov.in")
    subject = f"Pothole Repair Alert — {road_name}"
    body = (
        f"To The Grievance Officer,\n\n"
        f"Please refer to Pothole Complaint Report RR-POT-{pothole.id:04d}.\n"
        f"Location: {road_name}\n"
        f"GPS: {pothole.lat}, {pothole.lng}\n"
        f"Google Maps Link: {maps_link}\n"
        f"Timestamp: {last_seen_str}\n\n"
        f"Please schedule repair at the earliest.\n\n"
        f"Regards,\nRoad Rumble App User"
    )
    mailto_url = f"mailto:{target_email}?subject={urllib.parse.quote(subject)}&body={urllib.parse.quote(body)}"

    pdf_url = f"/complaints/{pdf_filename}"
    prefilled_data = {
        "road_name": road_name,
        "coordinates": f"{pothole.lat:.6f}, {pothole.lng:.6f}",
        "date": last_seen_str
    }

    return pdf_url, mailto_url, prefilled_data
