import React, { useState, useEffect } from 'react';
import { ShieldAlert, Activity, Wifi, WifiOff } from 'lucide-react';
import { checkHealth, API_URL } from '../services/api';

export default function AppBar() {
  const [isOnline, setIsOnline] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function pingBackend() {
      setIsChecking(true);
      const healthy = await checkHealth();
      if (isMounted) {
        setIsOnline(healthy);
        setIsChecking(false);
      }
    }

    pingBackend();
    const interval = setInterval(pingBackend, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-[#0d1322]/95 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-to-tr from-amber-500 to-orange-600 p-2 rounded-xl text-slate-950 shadow-md shadow-amber-500/20 font-black">
            <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
              ROAD RUMBLE
            </h1>
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
              Dashcam & Civic Alerts
            </p>
          </div>
        </div>

        {/* Connection Indicator */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full shadow-inner">
          <span className="relative flex h-3 w-3">
            {isOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                isOnline ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            ></span>
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1">
            {isChecking ? (
              <Activity className="w-3.5 h-3.5 text-slate-400 animate-spin" />
            ) : isOnline ? (
              <span className="text-emerald-400 font-bold">API Online</span>
            ) : (
              <span className="text-rose-400 font-bold">API Offline</span>
            )}
          </span>
        </div>
      </div>
    </header>
  );
}
