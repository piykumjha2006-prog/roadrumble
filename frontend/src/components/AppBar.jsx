import React, { useState, useEffect } from 'react';
import { ShieldAlert, Activity, Smartphone, X, QrCode, Trash2, CheckCircle2 } from 'lucide-react';
import { checkHealth, fetchServerInfo, API_URL } from '../services/api';

export default function AppBar() {
  const [isOnline, setIsOnline] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [serverInfo, setServerInfo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function pingBackend() {
      setIsChecking(true);
      const healthy = await checkHealth();
      if (isMounted) {
        setIsOnline(healthy);
        setIsChecking(false);
      }
      if (healthy) {
        const info = await fetchServerInfo();
        if (isMounted && info) setServerInfo(info);
      }
    }

    pingBackend();
    const interval = setInterval(pingBackend, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleResetDB = async () => {
    try {
      const response = await fetch(`${API_URL}/api/reset`, { method: 'POST' });
      if (response.ok) {
        setResetMessage('Database & uploads cleared!');
        setTimeout(() => setResetMessage(''), 3000);
        window.location.reload();
      }
    } catch (e) {
      console.error('Reset error:', e);
    }
  };

  const lanUrl = serverInfo?.url || `http://${window.location.hostname}:8000`;

  return (
    <>
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

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowModal(true)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-amber-400 text-xs font-bold flex items-center gap-1 transition-all active:scale-95"
              title="2-Phone Setup Info"
            >
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>2-Phone Setup</span>
            </button>

            {/* Connection Indicator */}
            <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-2.5 py-1.5 rounded-full shadow-inner">
              <span className="relative flex h-2.5 w-2.5">
                {isOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                ></span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2-Phone Setup Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1322] border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">2-Phone Demo Guide</h3>
                <p className="text-xs text-slate-400">Connect 2 phones over WiFi</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                1. Connect Both Phones to WiFi
              </span>
              <p className="text-xs text-slate-300">Open this URL on both phones:</p>
              <div className="bg-slate-950 p-2.5 rounded-lg font-mono text-cyan-300 font-bold text-sm text-center border border-cyan-500/30 select-all">
                {lanUrl}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-amber-400">📷 Phone 1 (Dashcam)</div>
                <div className="text-slate-300 text-[11px]">Open **Detect Tab**</div>
                <div className="text-slate-400 text-[10px]">Mount on dashboard facing road. Turn on Demo Mode or live camera.</div>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-cyan-400">🗺️ Phone 2 (Map)</div>
                <div className="text-slate-300 text-[11px]">Open **Map Tab**</div>
                <div className="text-slate-400 text-[10px]">Displays live hazard map + proximity alert banner when near pothole.</div>
              </div>
            </div>

            {resetMessage && (
              <div className="p-2 bg-emerald-500/20 border border-emerald-500 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{resetMessage}</span>
              </div>
            )}

            <button
              onClick={handleResetDB}
              className="w-full py-2 px-3 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Clear Database (Reset All Potholes)
            </button>
          </div>
        </div>
      )}
    </>
  );
}

