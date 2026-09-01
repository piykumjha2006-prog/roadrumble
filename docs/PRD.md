```markdown
# Product Requirements Document: Road Rumble

**Tagline:** Dashcam-based pothole detection, real-time driver alerts, and automated civic complaint filing.

**Version:** 1.0 (Hackathon MVP)
**Date:** August 30, 2026

---

## 1. Problem Statement

Potholes cause vehicle damage, accidents, and traffic slowdowns across Indian roads, especially affecting two-wheeler riders who are more exposed to injury. Two core failures exist today:

1. **No proactive warning** — drivers/riders encounter potholes with no advance notice, especially at night or in low visibility.
2. **No easy reporting mechanism** — even when people notice a pothole, filing a civic complaint is manual, effortful, and rarely done. As a result, municipal bodies lack consistent, geotagged data on road damage.

Road Rumble solves both: it detects potholes automatically from dashcam footage, warns the driver in advance, and auto-generates a complaint with photo + location + timestamp evidence — removing the friction that stops people from reporting.

---

## 2. Goals

- Detect potholes in real time from a phone-mounted dashcam feed.
- Alert the driver/rider with enough lead distance (~10m) to slow down or avoid the pothole.
- Auto-capture photo, GPS coordinates, and timestamp for every detected pothole.
- Auto-generate a civic complaint (ready to submit, or submitted where a portal/API exists).
- Build a lightweight backend/map view showing aggregated pothole locations.

### Non-Goals (for this version)
- Identifying the contractor, tender year, or political party responsible for a given road. This requires civic/tender data that isn't reliably available via API and is out of scope for the MVP. It may be demoed manually for 2-3 sample roads as a "vision" feature, not a working pipeline.
- Full autonomous submission to every municipal portal (each city has different systems). MVP will support one target city/corporation's format, or a user-reviewed submission step.

---

## 3. Target Users

- **Daily commuters** (car and two-wheeler riders) who want advance warning of road damage.
- **Civic-minded users** who want to report road damage but currently don't due to effort.
- **Municipal corporations / RWAs** (secondary/future user) who could consume aggregated pothole data for road maintenance prioritization.

---

## 4. Core User Flow

1. User mounts phone (dashboard or handlebar mount) and opens the Road Rumble app before starting a ride.
2. App runs a pothole detection model on the live camera feed in the background.
3. When a pothole is detected:
   - Phone captures a photo frame + GPS coordinate + timestamp.
   - If a second phone/device is running the map view, it receives the pothole's location and shows a "Pothole ~10m ahead" alert as the user approaches that coordinate on a future pass.
4. Detected potholes are logged to a local list / backend.
5. User reviews captured potholes (photo + location) in-app and taps "File Complaint" — this auto-fills a complaint template with photo, GPS, road name (via reverse geocoding), and date.
6. Complaint is submitted (directly via portal API if available, or exported/copied for manual submission).
7. All logged potholes also appear as pins on an aggregated map view.

---

## 5. System Architecture

### 5.1 High-Level Components

| Component | Responsibility |
|---|---|
| **Mobile App (Detection Phone)** | Camera feed capture, on-device pothole inference, GPS tagging, photo capture |
| **Mobile App (Map/Alert Phone)** *(optional, stretch goal)* | Displays map with pothole pins, computes proximity to known potholes, triggers "X m ahead" alerts |
| **Backend/API** | Stores pothole records (photo, GPS, timestamp), serves map data, handles complaint generation |
| **Complaint Generator** | Formats a pothole record into a civic-complaint-ready document/API payload |
| **Reverse Geocoding Service** | Converts GPS coordinates to a human-readable road/area name (e.g., Google Maps Geocoding API) |

### 5.2 Data Flow

```
Camera Feed → Pothole Detection Model → Detection Event
                                              ↓
                          {photo, GPS lat/long, timestamp}
                                              ↓
                    ┌─────────────────────────┴─────────────────────────┐
                    ↓                                                   ↓
           Backend (store + dedupe)                        Local complaint queue
                    ↓                                                   ↓
         Map view (pins, aggregation)                    Complaint Generator → Submit/Export
```

### 5.3 Single-Phone vs Two-Phone Mode

- **Single-phone mode (primary, recommended for hackathon):** one app handles detection, complaint generation, and a map tab, all on one device. Lower complexity, no sync issues.
- **Two-phone mode (stretch/demo bonus):** detection phone pushes new pothole coordinates to the backend in real time; map phone polls/subscribes and computes distance-to-nearest-pothole against its own live GPS to trigger alerts. Adds real-time sync complexity (network dependency, latency) — build only if core pipeline is solid with time to spare.

---

## 6. ML / Detection Component

- **Approach:** Object detection model (YOLO-family, e.g., YOLOv8n for lightweight on-device inference) fine-tuned on pothole imagery.
- **Data:** Start with existing public pothole datasets (Kaggle/Roboflow have several), fine-tune further with self-collected footage from local roads for domain accuracy (lighting, road texture, Indian road conditions).
- **Inference location:** On-device (phone) for real-time detection to avoid network dependency; if on-device performance is insufficient, fall back to sending frames to a lightweight cloud inference endpoint at reduced frame rate.
- **Deduplication:** Same pothole shouldn't be logged repeatedly on every pass — use GPS-radius matching (e.g., if a new detection is within ~5m of an already-logged pothole, treat as the same one and just update "last seen" / confidence rather than creating a duplicate).

---

## 7. Complaint Generation

- **Auto-filled fields:** Photo, GPS coordinates, reverse-geocoded road/area name, date/time of detection.
- **Manually added (if available for demo):** Ward number, contractor/tender info for a small set of pre-researched sample roads (manual RTI/e-tender lookup, not automated).
- **Submission path:**
  - If target city's grievance portal has a public API/form structure → auto-submit or pre-fill their form.
  - Otherwise → generate a shareable PDF/report the user can submit manually, or a mailto/pre-filled email to the local corporation.

---

## 8. MVP Scope (Hackathon Build)

**Must-have:**
- Real-time pothole detection running on a phone camera feed
- Auto-capture of photo + GPS + timestamp on detection
- Deduplication of repeated detections at the same location
- Auto-generated complaint report (photo + location + date) per pothole
- A basic map view showing all logged potholes as pins

**Nice-to-have (if time permits):**
- Two-phone live "X m ahead" warning mode
- Reverse geocoding to show road names instead of raw coordinates
- Direct submission integration with one real municipal portal
- Manually researched contractor data overlay for 2-3 demo roads

**Explicitly out of scope:**
- Automated contractor/tender/party attribution at scale
- Support for multiple cities' grievance portal formats
- Production-grade user accounts, auth, or multi-user backend

---

## 9. Hardware Requirements

- **Phone(s)** — acts as camera, GPS, and processing unit; no custom hardware needed.
- **Phone mount** — dashboard (car) or handlebar (scooty) mount, vibration-resistant.
- **Power bank / car charger** — to sustain continuous recording without battery drain cutting the demo short.
- *(No Raspberry Pi, external camera, or GPS module needed for MVP — phone-only setup minimizes hardware integration risk within the hackathon timeframe.)*

---

## 10. Success Metrics (for demo/judging)

- Pothole detection accuracy on test ride footage (precision/recall on a held-out clip)
- End-to-end latency: time from pothole entering frame to alert/complaint being ready
- Number of real potholes successfully detected + complaints generated during a live test ride near campus
- Map view correctly plotting all detected potholes with accurate GPS placement

---

## 11. Roadmap (Beyond Hackathon)

| Phase | Focus |
|---|---|
| **Phase 1 (Hackathon)** | Single-phone detection + complaint generation + basic map |
| **Phase 2** | Two-phone real-time alert mode; reverse geocoding; one city's portal integration |
| **Phase 3** | Aggregated public dashboard for municipal bodies; crowdsourced contractor/tender data layer |
| **Phase 4** | Multi-city support; partnerships with municipal corporations for direct data feed |

---

## 12. Open Risks

- **On-device model performance:** real-time inference on a phone may be too slow/battery-heavy; may need to reduce frame rate or offload to cloud.
- **GPS accuracy in motion:** urban GPS drift could misplace potholes on the map; map-matching to road segments would improve this in later phases.
- **Portal integration:** most municipal grievance systems don't have public APIs — plan for a manual-submission fallback from day one rather than assuming automation.
- **Two-phone sync latency:** if attempted, real-time position sharing between devices depends on network conditions and may not be demo-reliable.

```