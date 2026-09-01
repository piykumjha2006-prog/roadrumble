import React from 'react';
import { FileText, Send, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
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
      </div>

      {/* Empty State / List Placeholder */}
      <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-300">No Reports Logged Yet</h3>
        <p className="text-xs text-slate-400 max-w-xs mx-auto">
          Start a detection session on the Detect tab to auto-capture road damage and generate civic complaint drafts.
        </p>
      </div>
    </div>
  );
}
