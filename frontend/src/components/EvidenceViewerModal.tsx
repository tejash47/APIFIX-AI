'use client';

import React from 'react';
import {
  AlertTriangle,
  X,
  FileCode,
  Terminal,
  Send,
  CornerDownRight,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  Code
} from 'lucide-react';

interface EvidenceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: {
    endpoint: string;
    method?: string;
    httpStatus?: number | null;
    category?: string;
    severity?: string;
    sourceFile?: string;
    sourceLine?: number;
    evidence?: {
      targetUrl?: string;
      payload?: any;
      responseStatus?: number;
      responseHeaders?: Record<string, string>;
      responseBody?: any;
      error?: string;
      sourceFile?: string;
      sourceLine?: number;
      stderrSnippet?: string;
    };
  } | null;
  onInvestigateAI?: () => void;
}

export default function EvidenceViewerModal({
  isOpen,
  onClose,
  evidence,
  onInvestigateAI
}: EvidenceViewerModalProps) {
  if (!isOpen || !evidence) return null;

  const evData = evidence.evidence || {};
  const is5xx = (evidence.httpStatus && evidence.httpStatus >= 500) || evidence.category === 'HTTP_5XX' || evidence.category === 'RUNTIME_EXCEPTION';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="relative w-full max-w-3xl rounded-2xl border border-panelBorder bg-panel shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-panelBorder bg-bg/60">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              is5xx ? 'bg-red-600/20 border border-red-500/30 text-red-400' : 'bg-amber-600/20 border border-amber-500/30 text-amber-400'
            }`}>
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white font-mono uppercase tracking-tight">
                  Failure Evidence Record
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  is5xx ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {evidence.category || 'HTTP_FAILURE'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono">
                REAL TIME TELEMETRY // {evidence.endpoint}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-panelBorder bg-bg/80 text-gray-400 hover:text-white transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
          {/* Key Findings Overview Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border border-panelBorder bg-bg/50">
            <div>
              <span className="text-gray-500 block text-[10px]">HTTP STATUS</span>
              <span className={`font-bold ${is5xx ? 'text-red-400' : 'text-amber-400'}`}>
                {evidence.httpStatus || 'N/A'} {evidence.httpStatus === 500 ? 'Internal Error' : (evidence.httpStatus === 404 ? 'Not Found' : '')}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px]">SEVERITY</span>
              <span className="text-red-300 font-bold uppercase">{evidence.severity || 'CRITICAL'}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500 block text-[10px]">SOURCE LOCATION</span>
              <span className="text-indigo-300">
                {evidence.sourceFile || evData.sourceFile || 'Unknown file'}
                {evidence.sourceLine ? `:${evidence.sourceLine}` : ''}
              </span>
            </div>
          </div>

          {/* Request Payload Sent */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-gray-400 font-semibold text-[11px]">
              <Send className="w-3.5 h-3.5 text-indigo-400" />
              <span>PROBE REQUEST DETAILS</span>
            </div>
            <div className="p-3 rounded-lg border border-panelBorder bg-bg/80 space-y-1 text-gray-300">
              <div>
                <span className="text-gray-500">Target URL: </span>
                <span className="text-gray-200">{evData.targetUrl || evidence.endpoint}</span>
              </div>
              {evData.payload && (
                <div className="pt-1">
                  <span className="text-gray-500 block">Payload:</span>
                  <pre className="mt-1 p-2 rounded bg-black/50 border border-panelBorder/50 text-indigo-200 text-[11px] overflow-x-auto">
                    {typeof evData.payload === 'string' ? evData.payload : JSON.stringify(evData.payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Response Payload */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-gray-400 font-semibold text-[11px]">
              <CornerDownRight className="w-3.5 h-3.5 text-emerald-400" />
              <span>SERVER HTTP RESPONSE</span>
            </div>
            <div className="p-3 rounded-lg border border-panelBorder bg-bg/80 space-y-1 text-gray-300">
              <pre className="p-2 rounded bg-black/50 border border-panelBorder/50 text-red-300 text-[11px] overflow-x-auto whitespace-pre-wrap">
                {evData.responseBody
                  ? (typeof evData.responseBody === 'string' ? evData.responseBody : JSON.stringify(evData.responseBody, null, 2))
                  : (evData.error || 'No response body returned.')}
              </pre>
            </div>
          </div>

          {/* Server Stderr / Stack Trace Logs */}
          {evData.stderrSnippet && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-gray-400 font-semibold text-[11px]">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>SERVER STDERR RUNTIME LOGS</span>
              </div>
              <div className="p-3 rounded-lg border border-panelBorder bg-bg/80 space-y-1">
                <pre className="p-2 rounded bg-black/70 border border-red-500/20 text-red-400 text-[10px] overflow-x-auto font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {evData.stderrSnippet}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-panelBorder bg-bg/60">
          <span className="text-[11px] text-gray-500 font-mono">
            Evidence persisted to run workspace
          </span>

          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-panelBorder hover:border-gray-500 bg-panel text-gray-300 hover:text-white transition-all uppercase"
            >
              Close
            </button>

            <button
              onClick={() => {
                if (onInvestigateAI) onInvestigateAI();
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 uppercase"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Investigate with AI</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
