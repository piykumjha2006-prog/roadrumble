import React, { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, AlertTriangle, ExternalLink, CheckCircle2, Clock, MapPin, ShieldAlert, Sparkles, Send } from 'lucide-react';
import { fetchPotholes, generateComplaint, API_URL } from '../services/api';
import { uploaderInstance } from '../services/uploader';

export default function ReportsPage() {
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);

  // 1. Fetch Potholes List from GET /api/potholes
  const loadPotholes = useCallback(async (isManualRefresh = false) => {
    if (!isManualRefresh) setLoading(true);
    setError(null);

    try {
      const data = await fetchPotholes();
      if (Array.isArray(data)) {
        setPotholes(data);
      } else {
        setPotholes([]);
      }
    } catch (err) {
      console.error('Reports load error:', err);
      setError('Unable to connect to server. Check API connection and retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch on mount and refresh every 15 seconds
  useEffect(() => {
    loadPotholes();
    const interval = setInterval(() => {
      loadPotholes(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [loadPotholes]);

  // 3. File Complaint Action Handler
  const handleFileComplaint = async (pothole) => {
    setGeneratingId(pothole.id);
    uploaderInstance.log(`Filing complaint for pothole #${pothole.id}...`, 'info');

    try {
      const result = await generateComplaint(pothole.id);

      // Open PDF in new tab
      if (result && result.pdf_url) {
        const fullPdfUrl = result.pdf_url.startsWith('http')
          ? result.pdf_url
          : `${API_URL}${result.pdf_url}`;
        window.open(fullPdfUrl, '_blank');
      }

      // Trigger mailto link
      if (result && result.mailto) {
        window.location.href = result.mailto;
      }

      // Update local row status to "generated"
      setPotholes((prev) =>
        prev.map((p) => (p.id === pothole.id ? { ...p, complaint_status: 'generated' } : p))
      );

      uploaderInstance.emitToast('Complaint generated & PDF opened!', 'success');
      uploaderInstance.log(`Complaint PDF generated: ${result?.pdf_url || 'PDF'}`, 'success');
    } catch (err) {
      console.warn('Backend complaint generation fallback:', err.message);

      // Demo fallback if backend endpoint is unavailable
      const roadName = pothole.road_name || `Location (${pothole.lat.toFixed(4)}, ${pothole.lng.toFixed(4)})`;
      const subject = encodeURIComponent(`Pothole Complaint — ${roadName}`);
      const body = encodeURIComponent(
        `Respected Authority,\n\nA severe pothole hazard was detected at ${roadName} (${pothole.lat}, ${pothole.lng}) with ${Math.round(
          pothole.confidence * 100
        )}% confidence.\n\nPlease inspect and initiate road repairs.\n\nReported via Road Rumble.`
      );

      window.location.href = `mailto:grievance@example.gov.in?subject=${subject}&body=${body}`;

      setPotholes((prev) =>
        prev.map((p) => (p.id === pothole.id ? { ...p, complaint_status: 'generated' } : p))
      );

      uploaderInstance.emitToast('Complaint email draft opened', 'success');
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Header Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-400">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Civic Complaints</h2>
            <p className="text-xs text-slate-400 font-medium">Auto-generated reports & mailto export</p>
          </div>
        </div>

        <button
          onClick={() => loadPotholes(true)}
          className="touch-target px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Loading State */}
      {loading && potholes.length === 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-purple-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <p className="text-xs font-bold text-slate-300">Fetching Pothole Reports...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-5 text-center space-y-3 shadow-lg">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-900/40 border border-rose-700/50 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-rose-200">Failed to Load Reports</h3>
            <p className="text-xs text-rose-300/80 max-w-xs mx-auto mt-1">{error}</p>
          </div>
          <button
            onClick={() => loadPotholes(true)}
            className="touch-target px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow active:scale-95 transition-all inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" /> Retry Fetch
          </button>
        </div>
      )}

      {/* Empty State (Only shown when API genuinely returns 0 potholes and not loading) */}
      {!loading && !error && potholes.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 text-center space-y-3 shadow-inner">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
            <FileText className="w-6 h-6 text-purple-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-300">No Reports Logged Yet</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Start a detection session on the Detect tab to auto-capture road damage and generate civic complaint drafts.
          </p>
        </div>
      )}

      {/* Pothole Cards List */}
      {!error && potholes.length > 0 && (
        <div className="space-y-3">
          {potholes.map((pothole) => {
            const isGenerated = pothole.complaint_status === 'generated';
            const isSubmitted = pothole.complaint_status === 'submitted';
            const isFilingThis = generatingId === pothole.id;

            const fullImageUrl = pothole.image_url
              ? pothole.image_url.startsWith('http')
                ? pothole.image_url
                : `${API_URL}${pothole.image_url}`
              : null;

            const displayName =
              pothole.road_name ||
              `GPS: ${pothole.lat?.toFixed(4)}, ${pothole.lng?.toFixed(4)}`;

            const formattedDate = pothole.last_seen
              ? new Date(pothole.last_seen).toLocaleString()
              : pothole.timestamp
              ? new Date(pothole.timestamp).toLocaleString()
              : 'Recently detected';

            const confPercent = Math.round((pothole.confidence || 0.85) * 100);

            return (
              <div
                key={pothole.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 shadow-xl space-y-3 transition-all"
              >
                {/* Top Info Header */}
                <div className="flex items-start gap-3">
                  {/* Image Thumbnail */}
                  <div className="w-20 h-20 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                    {fullImageUrl ? (
                      <img
                        src={fullImageUrl}
                        alt="Pothole capture"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <AlertTriangle className="w-8 h-8 text-amber-500/80" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-sm font-bold text-white truncate">{displayName}</h3>
                      {/* Status Badge */}
                      <span
                        className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full border shrink-0 flex items-center gap-1 ${
                          isSubmitted
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                            : isGenerated
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {isSubmitted ? (
                          <>
                            <Send className="w-3 h-3 text-sky-400" /> Submitted
                          </>
                        ) : isGenerated ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Generated
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 text-amber-400" /> Draft Ready
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                      {pothole.lat?.toFixed(5)}, {pothole.lng?.toFixed(5)}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 pt-1">
                      <span className="text-emerald-400 font-bold">
                        {confPercent}% Conf
                      </span>
                      <span>•</span>
                      <span>
                        Hits: <strong className="text-amber-400">{pothole.hit_count || 1}x</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Bar: Date & File Complaint Action */}
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-[11px] font-mono text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formattedDate}</span>
                  </div>

                  <button
                    onClick={() => handleFileComplaint(pothole)}
                    disabled={isFilingThis}
                    className={`touch-target py-2 px-3 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 transition-all ${
                      isGenerated
                        ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40'
                        : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/20'
                    }`}
                  >
                    {isFilingThis ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Processing...
                      </>
                    ) : isGenerated ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Re-open PDF
                        <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        File Complaint
                        <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
