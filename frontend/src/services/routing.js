// Free OSRM public routing API — no key needed
const OSRM_BASE = 'https://router.project-osrm.org';

// Nominatim geocoding — free, no key needed
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

export async function geocodeAddress(query) {
  return geocode(query);
}

// Route from origin to destination. Returns { coords, distanceMeters, durationSeconds }
export async function fetchRoute(origin, destination) {
  const url = `${OSRM_BASE}/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM error ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('No route found');
  }
  const route = data.routes[0];
  return {
    coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

// Find known potholes that lie near the route polyline (within maxDistMeters)
export function potholesOnRoute(potholes, routeCoords, maxDistMeters = 30) {
  if (!routeCoords || routeCoords.length === 0) return [];

  const results = [];
  potholes.forEach((p) => {
    if (!p.lat || !p.lng) return;
    let minDist = Infinity;
    for (const [rlat, rlng] of routeCoords) {
      const dx = 111320 * (rlat - p.lat);
      const dy = 111320 * Math.cos((p.lat * Math.PI) / 180) * (rlng - p.lng);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        if (minDist <= maxDistMeters) break;
      }
    }
    if (minDist <= maxDistMeters) {
      results.push({ pothole: p, distanceFromRoute: Math.round(minDist) });
    }
  });

  return results;
}
