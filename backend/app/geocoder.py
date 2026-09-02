import time
import requests

GEOCODE_CACHE = {}

def reverse_geocode(lat: float, lng: float) -> str:
    """Converts lat/lng into human readable road/area name via Nominatim OSM."""
    cache_key = f"{round(lat, 4)},{round(lng, 4)}"
    if cache_key in GEOCODE_CACHE:
        return GEOCODE_CACHE[cache_key]

    url = "https://nominatim.openstreetmap.org/reverse"
    headers = {
        "User-Agent": "RoadRumbleHackathon/1.0 (contact@roadrumble.org)"
    }
    params = {
        "lat": lat,
        "lon": lng,
        "format": "json",
        "zoom": 17
    }

    try:
        time.sleep(1) # Respect Nominatim rate limit
        res = requests.get(url, headers=headers, params=params, timeout=5)
        if res.status_code == 200:
            data = res.json()
            address = data.get("address", {})
            road = address.get("road") or address.get("suburb") or address.get("neighbourhood") or address.get("city")
            if road:
                name = road
                if address.get("suburb") and address.get("suburb") != road:
                    name += f", {address.get('suburb')}"
                GEOCODE_CACHE[cache_key] = name
                return name
            elif data.get("display_name"):
                name = data.get("display_name").split(",")[0]
                GEOCODE_CACHE[cache_key] = name
                return name
    except Exception as e:
        print(f"[Geocoder Error] Reverse geocoding failed for {lat}, {lng}: {e}")

    return f"Road Segment near ({lat:.4f}, {lng:.4f})"
