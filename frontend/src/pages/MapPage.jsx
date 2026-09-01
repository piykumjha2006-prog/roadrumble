import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, RefreshCw, Navigation, FileText, AlertTriangle, ExternalLink, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { fetchPotholes, generateComplaint, API_URL } from '../services/api';
import { uploaderInstance } from '../services/uploader';

// Helper component to recenter map view when user position changes
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, map.getZoom(), { animate: true });
    }
  }, [center, map]);
  return null;
}

// Generate custom SVG marker icons colored by confidence rating
function createCustomMarkerIcon(confidence) {
  let color = '#ef4444'; // Red high hazard (default)
  let shadowColor = 'rgba(239, 68, 68, 0.4)';

  if (confidence < 0.65) {
    color = '#eab308'; // Yellow low hazard
    shadowColor = 'rgba(234, 179, 8, 0.4)';
  } else if (confidence < 0.85) {
    color = '#f59e0b'; // Amber medium hazard
    shadowColor = 'rgba(245, 158, 11, 0.4)';
  }

  const svgHtml = `
    <div style="
      position: relative;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0d1322;
      border: 3px solid ${color};
      border-radius: 50%;
      box-shadow: 0 0 15px ${shadowColor}, 0 4px 6px -1px rgba(0, 0, 0, 0.5);
      cursor: pointer;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-pothole-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// User location blue pulse marker
const userLocationIcon = L.divIcon({
  html: `
    <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
      <span style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: #38bdf8; opacity: 0.6; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
      <span style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: #0284c7; border: 2px solid #ffffff; box-shadow: 0 0 10px #38bdf8;"></span>
    </div>
  `,
  className: 'user-location-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Seed fallback potholes if backend is offline or empty
const SEED_POTHOLES = [
  {
    id: 101,
    lat: 12.9716,
    lng: 77.5946,
    timestamp: new Date().toISOString(),
    confidence: 0.92,
    road_name: 'MG Road, Central District',
    image_url: null,
    hit_count: 5,
    complaint_status: 'none',
  },
  {
    id: 102,
    lat: 12.9784,
    lng: 77.6408,
    timestamp: new Date().toISOString(),
    confidence: 0.78,
    road_name: '100 Feet Rd, Indiranagar',
    image_url: null,
    hit_count: 2,
    complaint_status: 'none',
  },
  {
    id: 103,
    lat: 12.9352,
    lng: 77.6245,
    timestamp: new Date().toISOString(),
    confidence: 0.62,
    road_name: '80 Feet Rd, Koramangala',
    image_url: null,
    hit_count: 1,
    complaint_status: 'none',
  },
];

export default function MapPage() {
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userCenter, setUserCenter] = useState([12.9716, 77.5946]); // Bangalore default
  const [generatingId, setGeneratingId] = useState(null);

  // 1. Fetch Potholes from API
  const loadMapData = useCallback(async () => {
    setLoading(true);
    const data = await fetchPotholes();
    if (data && data.length > 0) {
      setPotholes(data);
    } else {
      // Fallback to seed data if server returns empty list
      setPotholes(SEED_POTHOLES);
    }
    setLoading(false);
  }, []);

  // 2. Refresh every 15 seconds & on mount
  useEffect(() => {
    loadMapData();
    const interval = setInterval(loadMapData, 15000);
    return () => clearInterval(interval);
  }, [loadMapData]);

  // 3. User Geolocation centering
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => console.warn('User location lookup error:', err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // 4. File Complaint Action Handler
  const handleFileComplaint = async (pothole) => {
    setGeneratingId(pothole.id);
    uploaderInstance.log(`Filing complaint for pothole #${pothole.id}...`, 'info');

    try {
      const result = await generateComplaint(pothole.id);

      // Open PDF in new tab
      if (result.pdf_url) {
        const fullPdfUrl = result.pdf_url.startsWith('http')
          ? result.pdf_url
          : `${API_URL}${result.pdf_url}`;
        window.open(fullPdfUrl, '_blank');
      }

      // Open Mailto deep link
      if (result.mailto) {
        window.location.href = result.mailto;
      }

      uploaderInstance.emitToast('Complaint generated & PDF opened!', 'success');
      uploaderInstance.log(`Complaint PDF generated: ${result.pdf_url}`, 'success');

      // Update local status
      setPotholes((prev) =>
        prev.map((p) => (p.id === pothole.id ? { ...p, complaint_status: 'generated' } : p))
      );
    } catch (err) {
      uploaderInstance.emitToast('Complaint generated (demo fallback)', 'success');
      uploaderInstance.log(`Demo complaint created for #${pothole.id}`, 'info');

      // Fallback demo mailto if backend endpoint missing during early test
      const subject = encodeURIComponent(`Pothole Complaint — ${pothole.road_name || 'Road Hazard'}`);
      const body = encodeURIComponent(
        `Respected Authority,\n\nA severe pothole hazard was detected at ${pothole.road_name || 'Location'} (${pothole.lat}, ${pothole.lng}) with ${Math.round(pothole.confidence * 100)}% confidence.\n\nPlease inspect and initiate road repairs.\n\nReported via Road Rumble.`
      );
      window.location.href = `mailto:grievance@example.gov.in?subject=${subject}&body=${body}`;
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header Bar Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
            <MapPin className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Pothole Radar Map</h2>
            <p className="text-xs text-slate-400 font-medium">
              {potholes.length} hazards mapped • Auto-refreshes 15s
            </p>
          </div>
        </div>

        <button
          onClick={loadMapData}
          disabled={loading}
          className="touch-target px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Interactive Leaflet Map Container */}
      <div className="relative aspect-[4/3] w-full rounded-2xl border-2 border-slate-800 overflow-hidden shadow-2xl z-0">
        <MapContainer
          center={userCenter}
          zoom={14}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <RecenterMap center={userCenter} />

          {/* OpenStreetMap Tile Layer */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Current User Position Marker */}
          {userCenter && (
            <Marker position={userCenter} icon={userLocationIcon}>
              <Popup>
                <div className="p-2 text-center text-xs">
                  <span className="font-bold text-sky-400">Your Current Position</span>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Pothole Pins */}
          {potholes.map((pothole) => {
            const icon = createCustomMarkerIcon(pothole.confidence);
            const fullImageUrl = pothole.image_url
              ? pothole.image_url.startsWith('http')
                ? pothole.image_url
                : `${API_URL}${pothole.image_url}`
              : null;

            return (
              <Marker key={pothole.id} position={[pothole.lat, pothole.lng]} icon={icon}>
                <Popup>
                  <div className="w-64 overflow-hidden rounded-xl bg-slate-900 text-slate-100 p-3 space-y-2.5">
                    {/* Photo Header */}
                    {fullImageUrl ? (
                      <img
                        src={fullImageUrl}
                        alt="Pothole capture"
                        className="w-full h-32 object-cover rounded-lg border border-slate-700 shadow"
                      />
                    ) : (
                      <div className="w-full h-24 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 text-xs font-mono border border-slate-700">
                        <AlertTriangle className="w-6 h-6 text-amber-400 mb-1" />
                        <span>No Photo Available</span>
                      </div>
                    )}

                    {/* Information Metadata */}
                    <div>
                      <h4 className="font-bold text-sm text-white line-clamp-1">
                        {pothole.road_name || 'Unnamed Road Segment'}
                      </h4>
                      <p className="text-[11px] font-mono text-slate-400">
                        GPS: {pothole.lat.toFixed(4)}, {pothole.lng.toFixed(4)}
                      </p>
                    </div>

                    {/* Stats & Hit Count Badges */}
                    <div className="flex items-center justify-between text-[11px] font-mono border-t border-slate-800 pt-2">
                      <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md font-bold">
                        {Math.round(pothole.confidence * 100)}% Conf
                      </span>
                      <span className="text-slate-300 font-semibold">
                        Hits: <strong className="text-amber-400">{pothole.hit_count || 1}</strong>
                      </span>
                    </div>

                    {/* File Complaint Action Button */}
                    <button
                      onClick={() => handleFileComplaint(pothole)}
                      disabled={generatingId === pothole.id}
                      className="w-full touch-target py-2 px-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all disabled:opacity-50"
                    >
                      {generatingId === pothole.id ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Generating PDF...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4" />
                          File Civic Complaint
                          <ExternalLink className="w-3.5 h-3.5 ml-1" />
                        </>
                      )}
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Legend Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-around text-[11px] font-mono shadow-md">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-500 border border-rose-400 shadow shadow-rose-500/50"></span>
          <span className="text-slate-300">High (&ge;85%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-amber-400 shadow shadow-amber-500/50"></span>
          <span className="text-slate-300">Med (65-84%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-400 shadow shadow-yellow-500/50"></span>
          <span className="text-slate-300">Low (&lt;65%)</span>
        </div>
      </div>
    </div>
  );
}
