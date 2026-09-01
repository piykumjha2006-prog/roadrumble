import React, { useState, useEffect } from 'react';
import { Terminal, ChevronDown, ChevronUp, Trash2, Wifi, UploadCloud } from 'lucide-react';
import { uploaderInstance } from '../services/uploader';

export default function InAppDebugPanel() {
  const [logs, setLogs] = useState([]);
  const [queue, setQueue] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = uploaderInstance.subscribe((updatedLogs, updatedQueue) => {
      setLogs(updatedLogs);
      setQueue(updatedQueue);
    });
    return unsubscribe;
  }, []);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl text-xs font-mono">
      {/* Header Bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-slate-900/90 hover:bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-slate-300 font-bold active:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-400" />
          <span className="text-white uppercase tracking-wider text-[11px]">
            In-App Debug Log
          </span>
          {queue.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-[10px]">
              {queue.length} Queued
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-normal">
            {logs.length} entries
          </span>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </button>

      {/* Expandable Console Body */}
      {isOpen && (
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
              Live Event Trace
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => uploaderInstance.processQueue()}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded flex items-center gap-1 text-[10px]"
              >
                <UploadCloud className="w-3 h-3" /> Retry Queue
              </button>
              <button
                onClick={() => uploaderInstance.clearLogs()}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded flex items-center gap-1 text-[10px]"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {logs.length === 0 ? (
              <p className="text-slate-500 text-[11px] italic py-2 text-center">
                No events logged yet. Detection triggers will stream here.
              </p>
            ) : (
              logs.map((log) => {
                const isSuccess = log.type === 'success';
                const isWarn = log.type === 'warn';
                const isDuplicate = log.type === 'duplicate';

                return (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg leading-relaxed flex items-start gap-2 border text-[11px] ${
                      isSuccess
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                        : isDuplicate
                        ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300'
                        : isWarn
                        ? 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                    <span className="break-all">{log.msg}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
