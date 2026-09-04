'use client';

import React from 'react';
import { ShieldCheck, XCircle, Code2, FileCode, Loader2, Info } from 'lucide-react';

interface MonacoDiffViewerProps {
  originalCode?: string;
  proposedCode?: string;
  fileName?: string;
  confidence?: number | null;
  risk?: string | null;
  onApprove?: () => void;
  onReject?: () => void;
  isApplying?: boolean;
}

export default function MonacoDiffViewer({
  originalCode = '',
  proposedCode = '',
  fileName = 'Source File',
  confidence = null,
  risk = null,
  onApprove,
  onReject,
  isApplying = false
}: MonacoDiffViewerProps) {
  const hasCode = Boolean(originalCode || proposedCode);
  const origLines = (originalCode || '').split('\n');
  const propLines = (proposedCode || '').split('\n');

  const confidenceDisplay = confidence !== null && confidence !== undefined
    ? `[CONFIDENCE: ${Math.round(confidence * (confidence <= 1 ? 100 : 1))}%]`
    : '[CONFIDENCE: UNAVAILABLE]';

  const riskDisplay = risk ? `[RISK: ${risk.toUpperCase()}]` : '[RISK: UNASSESSED]';

  const linesAdded = propLines.length > origLines.length ? propLines.length - origLines.length : 0;

  return (
    <div className="rounded border border-panelBorder bg-panel/95 overflow-hidden shadow-2xl">
      {/* Diff Header & Risk Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-panelBorder bg-bg/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <FileCode className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase">
                PROPOSED PATCH
              </span>
              <span className="text-xs font-mono font-semibold text-gray-200">{fileName}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
              {hasCode ? 'REMEDIATION DIFF // SIDE-BY-SIDE INSPECTOR' : 'WAITING FOR PATCH GENERATION'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono">
            <span className="text-gray-300 font-semibold">{confidenceDisplay}</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">{riskDisplay}</span>
            {hasCode && (
              <>
                <span className="text-gray-500">|</span>
                <span className="text-emerald-400">[+{linesAdded}]</span>
                <span className="text-red-400">[-0]</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onReject && hasCode && (
              <button
                onClick={onReject}
                className="px-3 py-1.5 rounded border border-panelBorder bg-bg text-[10px] font-mono uppercase tracking-wider text-gray-300 hover:bg-panel transition-all flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5 text-gray-400" />
                Reject
              </button>
            )}

            {onApprove && hasCode && (
              <button
                onClick={onApprove}
                disabled={isApplying}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-[10px] font-mono uppercase tracking-wider text-white transition-all flex items-center gap-1.5 shadow-[0_0_14px_rgba(16,185,129,0.3)] cursor-pointer font-bold select-none"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    <span>Applying to working/...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-white" />
                    <span>Approve & Apply</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Diff Viewer Content or Empty State */}
      {!hasCode ? (
        <div className="p-12 flex flex-col items-center justify-center text-center bg-bg/95 font-mono text-xs text-gray-400 space-y-2">
          <Info className="w-6 h-6 text-gray-500" />
          <span>No patch proposed yet.</span>
          <span className="text-[10px] text-gray-500">When an incident is investigated and a fix is generated, the code comparison will appear here.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 text-xs font-mono bg-bg/95 divide-y md:divide-y-0 md:divide-x divide-panelBorder">
          {/* Left Side: Original Code */}
          <div className="flex flex-col h-[320px]">
            <div className="px-4 py-2 border-b border-panelBorder bg-red-500/5 text-red-400 flex items-center justify-between text-[11px] font-bold">
              <span>🔴 ORIGINAL CODE</span>
              <span className="text-gray-500 font-normal">{origLines.length} lines</span>
            </div>
            <div className="p-3 overflow-auto flex-1 font-mono text-[11px] leading-relaxed select-text space-y-1">
              {origLines.map((line, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 px-2 py-0.5 rounded text-gray-400"
                >
                  <span className="text-gray-600 select-none w-5 text-right shrink-0">{idx + 1}</span>
                  <span className="whitespace-pre overflow-x-auto">{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side: Proposed Code */}
          <div className="flex flex-col h-[320px] bg-emerald-500/[0.02]">
            <div className="px-4 py-2 border-b border-panelBorder bg-emerald-500/5 text-emerald-400 flex items-center justify-between text-[11px] font-bold">
              <span>🟢 PROPOSED PATCH</span>
              <span className="text-emerald-400/80 font-normal">{propLines.length} lines</span>
            </div>
            <div className="p-3 overflow-auto flex-1 font-mono text-[11px] leading-relaxed select-text space-y-1">
              {propLines.map((line, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 px-2 py-0.5 rounded text-gray-200"
                >
                  <span className="text-gray-600 select-none w-5 text-right shrink-0">{idx + 1}</span>
                  <span className="whitespace-pre overflow-x-auto">{line || ' '}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

