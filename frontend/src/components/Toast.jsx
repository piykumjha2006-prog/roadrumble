import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { uploaderInstance } from '../services/uploader';

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = uploaderInstance.onToast((toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    });

    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-50 pointer-events-none px-4 flex flex-col items-center gap-2">
      {toasts.map((toast) => {
        const isSuccess = toast.status === 'success';
        const isDuplicate = toast.status === 'duplicate';
        const isWarn = toast.status === 'warn';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-xs w-full px-4 py-3 rounded-2xl shadow-2xl border flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-200 ${
              isSuccess
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
                : isDuplicate
                ? 'bg-slate-900/95 border-cyan-500/50 text-cyan-200 shadow-cyan-950/50'
                : 'bg-amber-950/95 border-amber-500/50 text-amber-200 shadow-amber-950/50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : isDuplicate ? (
                <Info className="w-5 h-5 text-cyan-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span className="text-xs font-extrabold uppercase tracking-wider">
                {toast.message}
              </span>
            </div>

            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
