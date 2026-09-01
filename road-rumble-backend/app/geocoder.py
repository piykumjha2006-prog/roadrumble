import abc
import asyncio
import os
import time
from typing import Dict, Optional, Tuple
import httpx


class BaseGeocoder(abc.ABC):
    @abc.abstractmethod
    async def reverse_geocode(self, lat: float, lng: float) -> Optional[str]:
        """Convert latitude and longitude coordinates into a human-readable road/area name."""
        pass


class NominatimGeocoder(BaseGeocoder):
    def __init__(self):
        self._cache: Dict[Tuple[float, float], Optional[str]] = {}
        self._last_request_time: float = 0.0
        self._lock = asyncio.Lock()
        self.user_agent = os.getenv(
            "NOMINATIM_USER_AGENT", "RoadRumbleBackend/1.0 (contact@roadrumble.org)"
        )

    def _get_cache_key(self, lat: float, lng: float) -> Tuple[float, float]:
        # Round coordinates to ~11 meters precision for caching
        return (round(lat, 4), round(lng, 4))

    async def reverse_geocode(self, lat: float, lng: float) -> Optional[str]:
        cache_key = self._get_cache_key(lat, lng)
        if cache_key in self._cache:
            return self._cache[cache_key]

        async with self._lock:
            # Re-check cache inside lock
            if cache_key in self._cache:
                return self._cache[cache_key]

            # Rate-limiting: ensure at least 1.0 second between requests
            elapsed = time.time() - self._last_request_time
            if elapsed < 1.0:
                await asyncio.sleep(1.0 - elapsed)

            try:
                url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=18&addressdetails=1"
                headers = {"User-Agent": self.user_agent}

                async with httpx.AsyncClient(timeout=5.0) as client:
                    response = await client.get(url, headers=headers)
                    self._last_request_time = time.time()

                    if response.status_code == 200:
                        data = response.json()
                        address = data.get("address", {})

                        road = (
                            address.get("road")
                            or address.get("pedestrian")
                            or address.get("footway")
                            or address.get("path")
                        )
                        suburb = (
                            address.get("suburb")
                            or address.get("neighbourhood")
                            or address.get("residential")
                            or address.get("city_district")
                        )
                        city = address.get("city") or address.get("town") or address.get("village")

                        components = [c for c in [road, suburb, city] if c]
                        road_name = ", ".join(components) if components else data.get("display_name")

                        self._cache[cache_key] = road_name
                        return road_name

            except Exception:
                # Failure mode: return None safely without crashing
                pass

            self._cache[cache_key] = None
            return None


class GoogleGeocoder(BaseGeocoder):
    def __init__(self):
        self._cache: Dict[Tuple[float, float], Optional[str]] = {}
        self.api_key = os.getenv("GOOGLE_API_KEY", "")

    def _get_cache_key(self, lat: float, lng: float) -> Tuple[float, float]:
        return (round(lat, 4), round(lng, 4))

    async def reverse_geocode(self, lat: float, lng: float) -> Optional[str]:
        if not self.api_key:
            return None

        cache_key = self._get_cache_key(lat, lng)
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={self.api_key}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])
                    if results:
                        formatted_address = results[0].get("formatted_address")
                        self._cache[cache_key] = formatted_address
                        return formatted_address
        except Exception:
            pass

        self._cache[cache_key] = None
        return None


# Global geocoder singleton instance
_nominatim_instance = NominatimGeocoder()
_google_instance = GoogleGeocoder()


def get_geocoder() -> BaseGeocoder:
    provider = os.getenv("GEOCODER", "nominatim").lower()
    if provider == "google":
        return _google_instance
    return _nominatim_instance
