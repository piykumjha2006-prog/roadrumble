import React, { useState, useEffect } from 'react';
import { AlertOctagon, Volume2, X } from 'lucide-react';
import { proximityAlertInstance } from '../services/proximityAlert';

export default function ProximityBanner() {
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    const unsubscribe = proximityAlertInstance.subscribe((currentAlert) => {
      setAlert(currentAlert);
    });
    return unsubscribe;
  }, []);

  if (!alert) return null;

  const { pothole, distance } = alert;

  return (
    <div className="fixed top-14 left-0 right-0 z-50 px-3 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 text-white p-4 rounded-2xl shadow-2xl border-2 border-amber-400 animate-bounce duration-300">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-black/30 rounded-xl border border-white/20 text-white animate-pulse">
              <AlertOctagon className="w-8 h-8 fill-current text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white uppercase flex items-center gap-1">
                  ⚠️ ~{distance}m AHEAD
                </h3>
                <Volume2 className="w-4 h-4 text-amber-300 animate-pulse" />
              </div>
              <p className="text-xs font-semibold text-rose-100 line-clamp-1">
                {pothole.road_name
                  ? `Severe road depression • ${pothole.road_name}`
                  : `Severe road depression • GPS: ${pothole.lat.toFixed(4)}, ${pothole.lng.toFixed(4)}`}
              </p>
              <p className="text-[10px] font-mono text-amber-200/80">
                Reported by Road Rumble community
              </p>
            </div>
          </div>

          <button
            onClick={() => proximityAlertInstance.dismissAlert()}
            className="p-1.5 bg-black/20 hover:bg-black/40 rounded-full text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
