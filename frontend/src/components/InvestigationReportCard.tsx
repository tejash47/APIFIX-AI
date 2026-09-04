'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  FileCode,
  AlertTriangle,
  Layers,
  ArrowRight,
  Code2,
  Check,
  ShieldCheck,
  Cpu,
  Eye,
  Terminal,
  HelpCircle
} from 'lucide-react';
import { type AIInvestigationResponse } from '../lib/api';

interface InvestigationReportCardProps {
  investigation: AIInvestigationResponse | null;
  isLoading?: boolean;
  progressStep?: string;
  isGeneratingPatch?: boolean;
  onViewEvidence?: () => void;
  onViewSource?: (file: string, line: number) => void;
  onGenerateRepair?: () => void;
}

export default function InvestigationReportCard({
  investigation,
  isLoading = false,
  progressStep = 'Investigating...',
  isGeneratingPatch = false,
  onViewEvidence,
  onViewSource,
  onGenerateRepair
}: InvestigationReportCardProps) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl border border-indigo-500/40 bg-panel/90 shadow-2xl space-y-4 font-mono">
        <div className="flex items-center gap-3 border-b border-panelBorder pb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">
              AI Root-Cause Investigation in Progress
            </h3>
            <p className="text-[11px] text-gray-400 font-mono">
              CORRELATING RUNTIME EVIDENCE // ANALYZING AST
            </p>
          </div>
        </div>

        <div className="space-y-2.5 py-4">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Failure evidence loaded from Phase 3</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Runtime stack trace parsed</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-300 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="font-semibold">{progressStep}</span>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-bg border border-panelBorder overflow-hidden">
          <div className="h-full bg-indigo-500 animate-indeterminate" />
        </div>
      </div>
    );
  }

  if (!investigation) return null;

  const rc = investigation.rootCause;
  const rs = investigation.repairStrategy;

  return (
    <div className="p-6 rounded-2xl border border-indigo-500/30 bg-panel/90 shadow-2xl space-y-5 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-panelBorder pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.2)]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white uppercase tracking-tight">
                AI Root-Cause Analysis
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {investigation.status}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">
              {investigation.endpoint.method} {investigation.endpoint.path} · HTTP {investigation.failure.statusCode} ({investigation.failure.category})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded bg-bg border border-panelBorder text-[10px] text-gray-400">
            CONFIDENCE: {investigation.confidence || 'UNAVAILABLE'}
          </span>
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="px-2.5 py-1 rounded border border-panelBorder hover:border-gray-500 bg-panel text-gray-400 hover:text-white text-[10px] transition-all"
          >
            {showRawJson ? 'Hide JSON' : 'Raw JSON'}
          </button>
        </div>
      </div>

      {showRawJson ? (
        <pre className="p-4 rounded-xl bg-black/60 border border-panelBorder text-[11px] text-indigo-300 overflow-x-auto max-h-80 overflow-y-auto">
          {JSON.stringify(investigation, null, 2)}
        </pre>
      ) : (
        <>
          {/* Root Cause Summary Card */}
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 space-y-2">
            <div className="flex items-center justify-between text-red-300 font-bold text-[11px] uppercase">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>ROOT CAUSE IDENTIFIED</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-200 border border-red-500/30 text-[10px]">
                {rc.file}:{rc.line}
              </span>
            </div>
            <p className="text-white text-xs font-semibold leading-relaxed">
              {rc.summary}
            </p>
          </div>

          {/* Source Code Context Snippet */}
          {rc.snippet && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-gray-400 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span>SUSPECTED SOURCE CODE ({rc.file})</span>
                </div>
                <span className="text-[10px] text-gray-500">FAILURE LINE: {rc.line}</span>
              </div>
              <pre className="p-3.5 rounded-xl bg-black/70 border border-panelBorder text-[11px] text-gray-300 overflow-x-auto leading-relaxed max-h-48 overflow-y-auto">
                {rc.snippet}
              </pre>
            </div>
          )}

          {/* Detailed Explanation */}
          <div className="space-y-1.5">
            <span className="text-gray-400 font-bold text-[11px] uppercase block">
              WHY THIS FAILED
            </span>
            <div className="p-3.5 rounded-xl bg-bg/60 border border-panelBorder text-gray-300 leading-relaxed font-sans text-xs">
              {rc.explanation}
            </div>
          </div>

          {/* Supporting Evidence Chain */}
          <div className="space-y-2">
            <span className="text-gray-400 font-bold text-[11px] uppercase block">
              SUPPORTING EVIDENCE CHAIN
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {investigation.evidence.map((ev, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-panelBorder bg-bg/40 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[10px] uppercase">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{ev.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-gray-400 text-[10px] truncate">
                    {ev.error || ev.detail || `${ev.file}:${ev.line}`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Repair Strategy */}
          <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-2">
            <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px] uppercase">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>SUGGESTED REPAIR STRATEGY</span>
            </div>
            <p className="text-gray-200 text-xs font-sans leading-relaxed">
              {rs.summary}
            </p>
            {rs.filesLikelyAffected && rs.filesLikelyAffected.length > 0 && (
              <div className="text-[10px] text-gray-500 font-mono pt-1">
                Files to repair in Phase 5: <span className="text-indigo-300">{rs.filesLikelyAffected.join(', ')}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-panelBorder">
        <div className="flex items-center gap-2">
          {onViewEvidence && (
            <button
              onClick={onViewEvidence}
              className="px-3 py-1.5 rounded-lg border border-panelBorder hover:border-gray-500 bg-panel text-gray-300 hover:text-white text-[11px] transition-all flex items-center gap-1.5 uppercase"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>View Raw Evidence</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onGenerateRepair && (
            <button
              onClick={onGenerateRepair}
              disabled={isGeneratingPatch}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_14px_rgba(16,185,129,0.3)] transition-all cursor-pointer"
              title="Synthesize structured patch for human review"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isGeneratingPatch ? 'Synthesizing Patch...' : 'Generate Repair'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
