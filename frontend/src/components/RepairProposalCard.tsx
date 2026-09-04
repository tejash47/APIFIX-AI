'use client';

import React from 'react';
import {
  FileCode,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Code2,
  CheckCircle2,
  Loader2,
  Sparkles,
  Layers
} from 'lucide-react';
import { type ProjectPatchResponse } from '../lib/api';

interface RepairProposalCardProps {
  patch: ProjectPatchResponse | null;
  isLoading?: boolean;
  progressStep?: string;
  isApplying?: boolean;
  isVerifying?: boolean;
  onReviewDiff: () => void;
  onApprove: () => void;
  onReject: () => void;
  onVerifyRepair?: () => void;
}

export default function RepairProposalCard({
  patch,
  isLoading = false,
  progressStep = 'Generating patch...',
  isApplying = false,
  isVerifying = false,
  onReviewDiff,
  onApprove,
  onReject,
  onVerifyRepair
}: RepairProposalCardProps) {
  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl border border-emerald-500/40 bg-panel/90 shadow-2xl space-y-4 font-mono">
        <div className="flex items-center gap-3 border-b border-panelBorder pb-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">
              AI Code Repair Generation in Progress
            </h3>
            <p className="text-[11px] text-gray-400 font-mono">
              SYNTHESIZING SAFE CODE PATCH // VALIDATING AST
            </p>
          </div>
        </div>

        <div className="space-y-2.5 py-4">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Root cause loaded from Phase 4</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Target files and line boundaries verified</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-300 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold">{progressStep}</span>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-bg border border-panelBorder overflow-hidden">
          <div className="h-full bg-emerald-500 animate-indeterminate" />
        </div>
      </div>
    );
  }

  if (!patch) return null;

  const isApplied = patch.status === 'APPLIED';
  const isRejected = patch.status === 'REJECTED';

  return (
    <div className={`p-6 rounded-2xl border ${
      isApplied ? 'border-emerald-500/50 bg-emerald-950/20' : (isRejected ? 'border-red-500/30 bg-red-950/10' : 'border-indigo-500/40 bg-panel/90')
    } shadow-2xl space-y-4 font-mono text-xs`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-panelBorder pb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            isApplied ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400' : 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-400'
          }`}>
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white uppercase tracking-tight">
                {isApplied ? 'Code Patch Applied' : (isRejected ? 'Patch Proposal Rejected' : 'Repair Proposal Ready')}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                isApplied
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : isRejected
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              }`}>
                {isApplied ? 'PATCH APPLIED — VERIFICATION PENDING' : (isRejected ? 'REJECTED' : 'PATCH READY')}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">
              {patch.changes.length} {patch.changes.length === 1 ? 'file changed' : 'files changed'} · Risk: {patch.risk}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-emerald-400 font-bold">+{patch.linesAdded || 1} lines</span>
          <span className="text-gray-500">|</span>
          <span className="text-[11px] text-red-400 font-bold">-{patch.linesRemoved || 0} lines</span>
        </div>
      </div>

      {/* Summary */}
      <div className="p-3.5 rounded-xl border border-panelBorder bg-bg/60 space-y-1">
        <span className="text-[10px] text-gray-500 uppercase font-bold block">SUMMARY</span>
        <p className="text-white text-xs font-semibold">{patch.summary}</p>
        {patch.reason && (
          <p className="text-gray-400 text-[11px] font-sans pt-1 leading-relaxed">{patch.reason}</p>
        )}
      </div>

      {/* Changed Files List */}
      <div className="space-y-1.5">
        <span className="text-[10px] text-gray-500 uppercase font-bold block">TARGET FILES IN WORKING WORKSPACE</span>
        <div className="space-y-1">
          {patch.changes.map((c, idx) => (
            <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-panelBorder bg-black/40 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-indigo-300 font-semibold">{c.file}</span>
                <span className="text-gray-500 text-[10px]">
                  (lines {c.startLine || 1}..{c.endLine || c.startLine || 1})
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-panel border border-panelBorder text-[10px] text-gray-400 uppercase">
                {c.operation}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {!isApplied && !isRejected && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-panelBorder">
          <button
            onClick={onReviewDiff}
            className="px-4 py-2 rounded-lg border border-indigo-500/40 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-1.5 font-bold"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Review Diff in Monaco</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onReject}
              disabled={isApplying}
              className="px-4 py-2 rounded-lg border border-panelBorder hover:border-gray-500 bg-panel text-gray-300 hover:text-white font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5 text-gray-400" />
              <span>Reject</span>
            </button>

            <button
              onClick={onApprove}
              disabled={isApplying}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_16px_rgba(16,185,129,0.3)] font-bold cursor-pointer"
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  <span>Applying to working/...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-white" />
                  <span>Approve & Apply</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {isApplied && onVerifyRepair && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-panelBorder">
          <button
            onClick={onReviewDiff}
            className="px-3.5 py-1.5 rounded-lg border border-panelBorder hover:border-gray-500 bg-panel text-gray-300 hover:text-white font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-1.5"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Review Applied Diff</span>
          </button>

          <button
            onClick={onVerifyRepair}
            disabled={isVerifying}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_16px_rgba(16,185,129,0.3)] font-bold cursor-pointer"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 text-white animate-spin" />
                <span>Verifying Repair...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-white" />
                <span>Verify Repair (Phase 6)</span>
                <ArrowRight className="w-3.5 h-3.5 text-white" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
