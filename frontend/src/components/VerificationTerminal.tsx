'use client';

import React from 'react';
import { Terminal, RefreshCw, Download, FileCode, Archive, AlertCircle, CheckCircle2 } from 'lucide-react';

interface VerificationResult {
  status: string;
  verified: boolean;
  summary?: string;
  reason?: string;
  results?: {
    probesExecuted?: boolean;
    unknownUserProbe?: {
      status: number;
      expected: string;
      pass: boolean;
      evidence?: string[];
    };
    validUserProbe?: {
      status: number;
      expected: string;
      pass: boolean;
      evidence?: string[];
    };
    error?: string;
  };
  metrics?: {
    testsPassed?: number | null;
    testsFailed?: number | null;
    testSummary?: string;
    apiChecksPassed?: number | null;
    apiChecksFailed?: number | null;
    apiSummary?: string;
    executionTimeMs?: number;
  };
}

export default function VerificationTerminal({
  verification,
  onReinvestigate,
  runId
}: {
  verification: VerificationResult | null;
  onReinvestigate?: () => void;
  runId?: string | null;
}) {
  if (!verification) return null;

  const isVerified = verification.verified || verification.status === 'VERIFIED';
  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

  const handleDownloadFullCodebase = () => {
    if (runId) {
      window.open(`${BACKEND_URL}/api/runs/${runId}/download?type=full`, '_blank');
    }
  };

  const handleDownloadSingleFile = () => {
    if (runId) {
      window.open(`${BACKEND_URL}/api/runs/${runId}/download?type=file`, '_blank');
    }
  };

  const testSummary = verification.metrics?.testSummary || (
    verification.metrics?.testsPassed !== null && verification.metrics?.testsPassed !== undefined
      ? `${verification.metrics.testsPassed} tests passed, ${verification.metrics.testsFailed || 0} failed`
      : 'Tests not executed'
  );

  const apiSummary = verification.metrics?.apiSummary || (
    verification.metrics?.apiChecksPassed !== null && verification.metrics?.apiChecksPassed !== undefined
      ? `${verification.metrics.apiChecksPassed} API checks passed`
      : 'API verification not completed'
  );

  return (
    <div className="rounded border border-panelBorder bg-panel/95 overflow-hidden font-mono text-xs shadow-2xl">
      {/* Terminal Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-panelBorder bg-bg/70 text-gray-400">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-gray-200">ISOLATED SANDBOX // VERIFICATION TERMINAL</span>
        </div>
        <span className="text-gray-500 text-[10px]">
          {verification.metrics?.executionTimeMs ? `${verification.metrics.executionTimeMs}ms` : 'Target Probe Verification'}
        </span>
      </div>

      {/* Terminal Output */}
      <div className="p-4 space-y-2 text-gray-300 bg-bg/90 leading-relaxed font-mono">
        <div className="text-gray-400 pb-1 border-b border-panelBorder flex items-center justify-between">
          <span className="text-indigo-400">&gt; Verification Suite Status:</span>
          <span className="text-gray-500 text-[10px]">[EVIDENCE LOGS]</span>
        </div>

        {/* Live HTTP Probe Results */}
        {verification.results?.unknownUserProbe ? (
          <div className="space-y-1 pt-1">
            <p className="text-indigo-300">&gt; exec live_probe [unregistered_user_check]</p>
            <p className={verification.results.unknownUserProbe.pass ? 'text-emerald-400' : 'text-red-400'}>
              {verification.results.unknownUserProbe.pass ? '✓' : '✗'} Probe 1: Non-existent User -&gt; HTTP {verification.results.unknownUserProbe.status} (Expected: {verification.results.unknownUserProbe.expected})
            </p>
          </div>
        ) : null}

        {verification.results?.validUserProbe ? (
          <div className="space-y-1">
            <p className="text-indigo-300">&gt; exec live_probe [valid_user_check]</p>
            <p className={verification.results.validUserProbe.pass ? 'text-emerald-400' : 'text-red-400'}>
              {verification.results.validUserProbe.pass ? '✓' : '✗'} Probe 2: Valid User -&gt; HTTP {verification.results.validUserProbe.status} (Expected: {verification.results.validUserProbe.expected})
            </p>
          </div>
        ) : null}

        {/* Summary Metrics */}
        <div className="pt-2 mt-2 border-t border-panelBorder space-y-1 text-xs">
          <p className="text-gray-400">
            API Checks: <span className="text-emerald-400 font-semibold">{apiSummary}</span>
          </p>
          <p className="text-gray-400">
            Unit Test Suite: <span className="text-amber-400/90">{testSummary}</span>
          </p>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t ${
        isVerified ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'
      }`}>
        <div className="flex items-center gap-3">
          <div>
            <div className={`text-sm font-extrabold tracking-wide ${isVerified ? 'text-emerald-400' : 'text-red-400'}`}>
              {isVerified ? '[VERIFICATION: SUCCESS]' : '[VERIFICATION: NOT VERIFIED]'}
            </div>
            <p className="text-xs text-gray-300 mt-1.5 font-sans leading-relaxed">
              {verification.summary || verification.reason || (isVerified ? 'Patch verified via live HTTP probes.' : 'Verification failed or incomplete.')}
            </p>
          </div>
        </div>

        {isVerified && runId && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Download Full Repaired Codebase */}
            <button
              onClick={handleDownloadFullCodebase}
              className="px-3 py-1.5 rounded border border-indigo-500/50 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] uppercase font-bold tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
              title="Download the complete repaired repository with all patches applied"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Download Codebase (.ZIP)</span>
            </button>

            {/* Download Single Patched File */}
            <button
              onClick={handleDownloadSingleFile}
              className="px-3 py-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-mono text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5"
              title="Download only the patched file"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Patched File</span>
            </button>
          </div>
        )}

        {!isVerified && onReinvestigate && (
          <button
            onClick={onReinvestigate}
            className="px-3.5 py-1.5 rounded border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 text-red-300 font-mono text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-investigate</span>
          </button>
        )}
      </div>
    </div>
  );
}


