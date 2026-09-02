import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Navigation2, Search, X, TriangleAlert, Clock, Route as RouteIcon, LocateFixed, Flag, Volume2 } from 'lucide-react';
import { fetchPotholes } from '../services/api';
import { geocodeAddress, fetchRoute, potholesOnRoute } from '../services/routing';
import { createCustomMarkerIcon } from './MapPage';

// Car arrow marker that rotates with heading
function createCarIcon(headingDeg = 0) {
  return L.divIcon({
    html: `<div style="transform: rotate(${headingDeg}deg); filter: drop-shadow(0 0 6px rgba(56,189,248,0.9));">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="#38bdf8" stroke="#0c4a6e" stroke-width="1">
        <path d="M12 2 L19 20 L12 16 L5 20 Z"/>
      </svg>
    </div>`,
    className: 'car-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

// Follow the car: keep it centered as it moves
function FollowCar({ pos, following }) {
  const map = useMap();
  useEffect(() => {
    if (following && pos) {
      map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [pos, following, map]);
  return null;
}

function FitRoute({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 1) {
      map.fitBounds(coords, { padding: [40, 40] });
    }
  }, [coords, map]);
  return null;
}

// Haversine meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest point index on the route polyline to a given latlng
function nearestRouteIndex(routeCoords, lat, lng) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < routeCoords.length; i++) {
    const d = haversine(lat, lng, routeCoords[i][0], routeCoords[i][1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, distance: bestD };
}

// Sum route length from index to the end
function remainingDistanceMeters(routeCoords, fromIndex) {
  let dist = 0;
  for (let i = fromIndex; i < routeCoords.length - 1; i++) {
    dist += haversine(routeCoords[i][0], routeCoords[i][1], routeCoords[i + 1][0], routeCoords[i + 1][1]);
  }
  return dist;
}

export default function NavigatePage() {
  const [destText, setDestText] = useState('');
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [route, setRoute] = useState(null);
  const [routePotholes, setRoutePotholes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [carPos, setCarPos] = useState(null);
  const [heading, setHeading] = useState(0);
  const [following, setFollowing] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [remainingMeters, setRemainingMeters] = useState(null);
  const [arrived, setArrived] = useState(false);

  const prevPosRef = useRef(null);
  const potholesCacheRef = useRef([]);
  const warnedRef = useRef(new Set());
  const lastRerouteRef = useRef(0);
  const audioRef = useRef(null);

  // 1. Live GPS tracking of the car
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCarPos(p);
        if (!origin) setOrigin(p);

        // Compute heading from movement
        if (prevPosRef.current) {
          const dx = p.lng - prevPosRef.current.lng;
          const dy = p.lat - prevPosRef.current.lat;
          if (Math.abs(dx) > 0.00002 || Math.abs(dy) > 0.00002) {
            const h = (Math.atan2(dx, dy) * 180) / Math.PI;
            setHeading((h + 360) % 360);
          }
        }
        prevPosRef.current = p;
      },
      (err) => console.warn('GPS watch error:', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [origin]);

  // 2. Load pothole cache in background
  useEffect(() => {
    fetchPotholes().then((p) => {
      potholesCacheRef.current = Array.isArray(p) ? p : [];
    });
    const t = setInterval(async () => {
      const p = await fetchPotholes();
      if (Array.isArray(p)) potholesCacheRef.current = p;
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // Voice + chime
  const speak = useCallback((text) => {
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
      if (!audioRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioRef.current = new AC();
      }
      if (audioRef.current && audioRef.current.state === 'suspended') audioRef.current.resume();
      if (audioRef.current) {
        const osc = audioRef.current.createOscillator();
        const gain = audioRef.current.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, audioRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioRef.current.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(audioRef.current.destination);
        osc.start();
        osc.stop(audioRef.current.currentTime + 0.25);
      }
    } catch (e) {
      console.warn('Audio error:', e);
    }
  }, []);

  // 3. Start navigation
  const startNavigation = useCallback(async (dest) => {
    const org = origin || carPos;
    if (!org) {
      setError('Waiting for GPS fix...');
      return;
    }
    if (!dest) {
      setError('Set a destination first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetchRoute(org, dest);
      const onRoute = potholesOnRoute(potholesCacheRef.current, r.coords, 30);
      setRoute(r);
      setRoutePotholes(onRoute);
      setNavigating(true);
      setArrived(false);
      warnedRef.current = new Set();
      speak(`Route ready. ${(r.distanceMeters / 1000).toFixed(1)} kilometers. ${onRoute.length} hazards reported on route.`);
    } catch (e) {
      setError(e.message || 'Routing failed');
    } finally {
      setLoading(false);
    }
  }, [origin, carPos, speak]);

  const handleSearch = async () => {
    if (!destText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const geo = await geocodeAddress(destText.trim());
      if (!geo) {
        setError('Destination not found');
        return;
      }
      setDestination(geo);
      await startNavigation(geo);
    } catch (e) {
      setError(e.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const stopNavigation = () => {
    setNavigating(false);
    setRoute(null);
    setRoutePotholes([]);
    setRemainingMeters(null);
    setDestination(null);
    setDestText('');
    try { window.speechSynthesis.cancel(); } catch (e) {}
  };

  // 4. LIVE NAVIGATION LOOP: update remaining distance, reroute on deviation, hazard warnings
  useEffect(() => {
    if (!navigating || !route || !carPos || !destination) return;

    const { index, distance: distFromRoute } = nearestRouteIndex(route.coords, carPos.lat, carPos.lng);

    // Arrived check
    if (haversine(carPos.lat, carPos.lng, destination.lat, destination.lng) < 40) {
      if (!arrived) {
        setArrived(true);
        speak('You have arrived at your destination.');
      }
      return;
    }

    // Remaining distance & ETA
    const remM = remainingDistanceMeters(route.coords, index);
    setRemainingMeters(remM);

    // Reroute if far off route (60m+) — throttled to every 15s
    if (distFromRoute > 60 && Date.now() - lastRerouteRef.current > 15000) {
      lastRerouteRef.current = Date.now();
      speak('Recalculating route.');
      (async () => {
        try {
          const r = await fetchRoute(carPos, destination);
          setRoute(r);
        } catch (e) {
          console.warn('Reroute failed:', e);
        }
      })();
    }

    // Hazard warning: pothole within 100m ahead on route
    potholesCacheRef.current.forEach((p) => {
      if (!p.lat || !p.lng || warnedRef.current.has(p.id)) return;
      const d = haversine(carPos.lat, carPos.lng, p.lat, p.lng);
      if (d <= 100) {
        warnedRef.current.add(p.id);
        speak(`Caution. Severe road depression. ${Math.round(d)} meters ahead.`);
      }
    });
  }, [carPos, navigating, route, destination, arrived, speak]);

  const formatDuration = (s) => {
    const m = Math.max(1, Math.round(s / 60));
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const formatDistance = (m) => {
    if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m)} m`;
  };

  // Remaining ETA proportional to remaining distance
  const remainingEta = route && remainingMeters != null && route.distanceMeters > 0
    ? (remainingMeters / route.distanceMeters) * route.durationSeconds
    : null;

  return (
    <div className="space-y-4 pb-4">
      {/* Trip Planner / Navigation HUD */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
            <Navigation2 className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white tracking-tight">Live Navigation</h2>
            <p className="text-xs text-slate-400 font-medium">
              {navigating ? 'Turn-by-turn active • following your car' : 'Google-Maps-style trip planning'}
            </p>
          </div>
          {navigating && (
            <button
              onClick={stopNavigation}
              className="touch-target px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase rounded-lg flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Stop
            </button>
          )}
        </div>

        {!navigating ? (
          <div className="flex items-center gap-2 bg-slate-800/70 border border-slate-700 rounded-xl px-3 py-2.5">
            <Flag className="w-4 h-4 text-rose-400 shrink-0" />
            <input
              type="text"
              placeholder="Where to? e.g. Chennai Central"
              value={destText}
              onChange={(e) => setDestText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder-slate-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !destText.trim()}
              className="touch-target px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-xs uppercase rounded-lg flex items-center gap-1.5 transition-all"
            >
              <Search className="w-4 h-4" />
              Go
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Remaining</p>
              <p className="text-base font-black text-sky-300">
                {arrived ? '—' : remainingMeters != null ? formatDistance(remainingMeters) : '...'}
              </p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase">ETA</p>
              <p className="text-base font-black text-emerald-300">
                {arrived ? '—' : remainingEta != null ? formatDuration(remainingEta) : '...'}
              </p>
            </div>
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Hazards</p>
              <p className="text-base font-black text-rose-300">{routePotholes.length}</p>
            </div>
          </div>
        )}

        {arrived && (
          <p className="text-xs text-emerald-400 font-black flex items-center gap-1.5">
            <Flag className="w-4 h-4" /> You have arrived at your destination!
          </p>
        )}
        {error && (
          <p className="text-xs text-rose-400 font-semibold flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        {navigating && destination && (
          <p className="text-[11px] text-slate-400 font-semibold line-clamp-1 flex items-center gap-1.5">
            <RouteIcon className="w-3.5 h-3.5 text-sky-400" /> To: {destination.label}
          </p>
        )}
      </div>

      {/* Map */}
      <div className="relative aspect-[4/3] w-full rounded-2xl border-2 border-slate-800 overflow-hidden shadow-2xl z-0">
        <MapContainer
          center={carPos ? [carPos.lat, carPos.lng] : [12.9716, 77.5946]}
          zoom={16}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {route && (
            <>
              <Polyline positions={route.coords} pathOptions={{ color: '#38bdf8', weight: 6, opacity: 0.85 }} />
              {!navigating && <FitRoute coords={route.coords} />}
            </>
          )}

          {navigating && carPos && <FollowCar pos={carPos} following={following} />}

          {/* Live car marker with heading arrow */}
          {carPos && (
            <Marker position={[carPos.lat, carPos.lng]} icon={createCarIcon(heading)} zIndexOffset={1000}>
              <Popup>Your car — live GPS</Popup>
            </Marker>
          )}

          {destination && (
            <Marker position={[destination.lat, destination.lng]} icon={L.divIcon({
              html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f43f5e;border:3px solid #fff;box-shadow:0 0 10px #f43f5e;"></div>`,
              iconSize: [16, 16], iconAnchor: [8, 8],
            })}>
              <Popup>Destination: {destination?.label}</Popup>
            </Marker>
          )}

          {routePotholes.map(({ pothole }) => {
            const icon = createCustomMarkerIcon(pothole.confidence);
            return (
              <Marker key={pothole.id} position={[pothole.lat, pothole.lng]} icon={icon}>
                <Popup>
                  <div className="w-56 p-2 space-y-1">
                    <h4 className="font-bold text-sm text-white">
                      {pothole.road_name || 'Hazard on Route'}
                    </h4>
                    <p className="text-[11px] font-mono text-slate-400">
                      {Math.round(pothole.confidence * 100)}% • {pothole.hit_count || 1} reports
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Follow-car toggle button */}
        {navigating && (
          <button
            onClick={() => setFollowing(!following)}
            className={`absolute bottom-3 right-3 z-[500] touch-target p-2.5 rounded-full shadow-xl border-2 ${
              following
                ? 'bg-sky-600 border-sky-400 text-white'
                : 'bg-slate-900 border-slate-600 text-slate-300'
            }`}
          >
            <LocateFixed className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Hazard list on route */}
      {navigating && routePotholes.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TriangleAlert className="w-4 h-4 text-amber-400" /> Hazards on your route
          </h3>
          {routePotholes.slice(0, 6).map(({ pothole }) => (
            <div key={pothole.id} className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-700">
              <span className="text-xs text-slate-300 font-semibold line-clamp-1">
                {pothole.road_name || `GPS: ${pothole.lat.toFixed(4)}, ${pothole.lng.toFixed(4)}`}
              </span>
              <span className="text-[11px] font-black text-rose-400 shrink-0 ml-2">
                {Math.round(pothole.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {navigating && (
        <p className="text-[10px] text-slate-500 text-center font-mono flex items-center justify-center gap-1">
          <Volume2 className="w-3 h-3" /> Voice alerts: hazards 100m ahead • rerouting • arrival
        </p>
      )}
    </div>
  );
}
