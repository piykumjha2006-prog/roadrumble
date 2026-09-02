"""Temporary end-to-end integration check for the merged Road Rumble server."""
import io
import json
import sys

import requests

BASE = "http://127.0.0.1:8000"
OK = "PASS"
BAD = "FAIL"
results = []


def check(name, cond, detail=""):
    results.append((OK if cond else BAD, name, detail))
    print(f"[{OK if cond else BAD}] {name} {('- ' + detail) if detail else ''}")


# 1x1 JPEG
JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300ffffffffffffffffffffffffff"
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffc2000b080001000101011"
    "100ffc40014100100000000000000000000000000000000ffda0008010100013f10"
)

# ---------- 1. Backend API ----------
r = requests.get(f"{BASE}/api/health", timeout=10)
check("GET /api/health 200 + {status:ok}", r.status_code == 200 and r.json() == {"status": "ok"}, r.text.strip())

r = requests.get(f"{BASE}/api/info", timeout=10)
check("GET /api/info returns LAN url", r.status_code == 200 and "lan_ip" in r.json(), r.text.strip())

r = requests.get(f"{BASE}/openapi.json", timeout=10)
check("GET /openapi.json (Swagger schema)", r.status_code == 200)

r = requests.get(f"{BASE}/docs", timeout=10)
check("GET /docs (Swagger UI)", r.status_code == 200 and "text/html" in r.headers.get("content-type", ""))

# ---------- 2. Ingest + dedup ----------
LAT, LNG = 19.111111, 72.888888
payload = {"lat": str(LAT), "lng": str(LNG), "timestamp": "2026-09-01T10:00:00Z", "confidence": "0.71"}
r = requests.post(f"{BASE}/api/potholes", data=payload,
                  files={"image": ("probe.jpg", io.BytesIO(JPEG), "image/jpeg")}, timeout=30)
new_ok = r.status_code == 200 and r.json().get("status") == "new"
check("POST /api/potholes -> status 'new'", new_ok, r.text[:200])
rec = r.json().get("record", {}) if r.status_code == 200 else {}
pid = rec.get("id")

# API contract field names
contract = {"id", "lat", "lng", "timestamp", "confidence", "road_name",
            "image_url", "hit_count", "last_seen", "complaint_status"}
missing = contract - set(rec)
check("Response matches docs/api-contract.md fields", not missing, f"missing={sorted(missing)}" if missing else "all 10 fields present")

# Duplicate within 5 m (~1.5 m away)
payload2 = {"lat": str(LAT + 0.00001), "lng": str(LNG + 0.00001),
            "timestamp": "2026-09-01T10:05:00Z", "confidence": "0.93"}
r2 = requests.post(f"{BASE}/api/potholes", data=payload2,
                   files={"image": ("probe2.jpg", io.BytesIO(JPEG), "image/jpeg")}, timeout=30)
d = r2.json() if r2.status_code == 200 else {}
check("POST within ~1.5 m -> status 'duplicate'", d.get("status") == "duplicate", r2.text[:200])
check("duplicate bumps hit_count to 2", d.get("record", {}).get("hit_count") == 2, str(d.get("record", {}).get("hit_count")))
check("duplicate keeps max confidence (0.93)", d.get("record", {}).get("confidence") == 0.93, str(d.get("record", {}).get("confidence")))

# Outside 5 m (~100 m away) -> new
payload3 = {"lat": str(LAT + 0.001), "lng": str(LNG), "timestamp": "2026-09-01T10:06:00Z", "confidence": "0.60"}
r3 = requests.post(f"{BASE}/api/potholes", data=payload3,
                   files={"image": ("probe3.jpg", io.BytesIO(JPEG), "image/jpeg")}, timeout=30)
d3 = r3.json() if r3.status_code == 200 else {}
check("POST ~111 m away -> status 'new' (not over-merged)", d3.get("status") == "new", r3.text[:200])
pid3 = d3.get("record", {}).get("id")

# ---------- 3. Read endpoints ----------
r = requests.get(f"{BASE}/api/potholes", timeout=10)
lst = r.json() if r.status_code == 200 else []
check("GET /api/potholes returns array", isinstance(lst, list) and len(lst) >= 2, f"{len(lst)} records")

r = requests.get(f"{BASE}/api/potholes/{pid}", timeout=10)
check(f"GET /api/potholes/{pid} single record", r.status_code == 200 and r.json().get("id") == pid)

r = requests.get(f"{BASE}/api/potholes/999999", timeout=10)
check("GET unknown pothole -> 404", r.status_code == 404)

# ---------- 4. Uploaded image is actually served ----------
img_url = rec.get("image_url", "")
r = requests.get(f"{BASE}{img_url}", timeout=10)
check(f"GET {img_url} serves the uploaded photo",
      r.status_code == 200 and r.content == JPEG, f"{r.status_code}, {len(r.content)} bytes")

# ---------- 5. Complaint generation ----------
r = requests.post(f"{BASE}/api/potholes/{pid}/complaint", timeout=60)
comp = r.json() if r.status_code == 200 else {}
check("POST /api/potholes/{id}/complaint 200", r.status_code == 200, r.text[:200])
check("complaint returns pdf_url + mailto + prefilled",
      {"pdf_url", "mailto", "prefilled"} <= set(comp), str(list(comp))[:120])
check("mailto is a mailto: deep link", str(comp.get("mailto", "")).startswith("mailto:"),
      str(comp.get("mailto", ""))[:80])

pdf_url = comp.get("pdf_url", "")
r = requests.get(f"{BASE}{pdf_url}", timeout=20)
check(f"GET {pdf_url} serves a real PDF",
      r.status_code == 200 and r.content[:4] == b"%PDF", f"{r.status_code}, {len(r.content)} bytes")

r = requests.get(f"{BASE}/api/potholes/{pid}", timeout=10)
check("complaint_status flipped to 'generated'", r.json().get("complaint_status") == "generated",
      r.json().get("complaint_status"))

# ---------- 6. Merged frontend (SPA) serving ----------
r = requests.get(f"{BASE}/", timeout=10)
html = r.text
check("GET / serves built React PWA index.html",
      r.status_code == 200 and 'id="root"' in html and "Road Rumble" in html)

import re
assets = re.findall(r'/assets/[A-Za-z0-9_\-.]+', html)
check("index.html references built JS/CSS assets", len(assets) >= 2, str(assets))
for a in assets:
    rr = requests.get(f"{BASE}{a}", timeout=30)
    check(f"GET {a}", rr.status_code == 200, f"{rr.status_code}, {len(rr.content)} bytes")

for path in ["/manifest.webmanifest", "/registerSW.js", "/sw.js", "/icon.svg"]:
    rr = requests.get(f"{BASE}{path}", timeout=15)
    check(f"GET {path} (PWA asset)", rr.status_code == 200, str(rr.status_code))

# Deep-link SPA fallback (React Router client routes)
for route in ["/map", "/reports"]:
    rr = requests.get(f"{BASE}{route}", timeout=10)
    check(f"GET {route} falls back to index.html (deep link works)",
          rr.status_code == 200 and 'id="root"' in rr.text, str(rr.status_code))

# API 404s must not be swallowed by the SPA catch-all
rr = requests.get(f"{BASE}/api/nope", timeout=10)
check("GET /api/nope -> 404 (not SPA html)", rr.status_code == 404, str(rr.status_code))

# ---------- 7. CORS (separate-origin dev mode: vite :3000 -> api :8000) ----------
rr = requests.get(f"{BASE}/api/potholes", headers={"Origin": "http://localhost:3000"}, timeout=10)
acao = rr.headers.get("access-control-allow-origin")
check("CORS allows vite dev origin :3000", acao in ("*", "http://localhost:3000"), f"ACAO={acao}")

rr = requests.options(f"{BASE}/api/potholes", headers={
    "Origin": "http://localhost:3000",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
}, timeout=10)
check("CORS preflight OPTIONS on POST /api/potholes", rr.status_code in (200, 204), str(rr.status_code))

# ---------- cleanup test rows ----------
print("\n--- cleanup ---")
import sqlite3
conn = sqlite3.connect("road_rumble.db")
conn.execute("delete from pothole where id in (?,?)", (pid, pid3))
conn.commit()
conn.close()
from pathlib import Path
for p in [Path("uploads") / f"{pid}.jpg", Path("uploads") / f"{pid3}.jpg", Path("complaints") / f"{pid}.pdf"]:
    if p.exists():
        p.unlink()
        print("removed", p)

fails = [r for r in results if r[0] == BAD]
print(f"\n===== {len(results) - len(fails)}/{len(results)} checks passed =====")
for f in fails:
    print("  FAILED:", f[1], f[2])
sys.exit(1 if fails else 0)
