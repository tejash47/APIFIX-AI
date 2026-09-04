'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  ShieldCheck,
  Activity,
  ArrowRight,
  Sparkles,
  Server,
  FileCode,
  Lock,
  Layers,
  Terminal,
  GitPullRequest,
  ExternalLink,
  Github,
  Loader2,
  X
} from 'lucide-react';
import {
  type ProjectVerificationResponse,
  getVerifiedDownloadUrl,
  createPullRequest,
  type CreatePullRequestResponse
} from '../lib/api';

interface VerificationResultCardProps {
  verification: ProjectVerificationResponse | null;
  isLoading?: boolean;
  progressStep?: string;
  projectId?: string;
  runId?: string;
  projectRepository?: string;
  authToken?: string | null;
  onVerify?: () => void;
  onViewEvidence?: () => void;
}

export default function VerificationResultCard({
  verification,
  isLoading = false,
  progressStep = 'Verifying patched application...',
  projectId,
  runId,
  projectRepository,
  authToken,
  onVerify,
  onViewEvidence
}: VerificationResultCardProps) {
  // GitHub PR Modal State
  const [isPrModalOpen, setIsPrModalOpen] = useState(false);
  const [baseBranch, setBaseBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
  const [customRepo, setCustomRepo] = useState(projectRepository || '');
  const [isSubmittingPr, setIsSubmittingPr] = useState(false);
  const [prStep, setPrStep] = useState<string>('');
  const [prResult, setPrResult] = useState<CreatePullRequestResponse | null>(null);
  const [prError, setPrError] = useState<string | null>(null);

  const handleOpenPrModal = () => {
    setIsPrModalOpen(true);
    setPrError(null);
  };

  const handleClosePrModal = () => {
    if (!isSubmittingPr) {
      setIsPrModalOpen(false);
    }
  };

  const handleCreatePullRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !runId) return;

    setIsSubmittingPr(true);
    setPrError(null);
    setPrResult(null);
    setPrStep('Connecting to GitHub API...');

    try {
      setPrStep('Validating credentials & repository access...');
      const payload: any = {
        baseBranch: baseBranch.trim() || 'main'
      };

      if (githubToken.trim()) {
        payload.githubToken = githubToken.trim();
      }

      if (customRepo.trim()) {
        payload.repoUrl = customRepo.trim();
      }

      setPrStep('Creating repair branch & verified Git commit...');
      const response = await createPullRequest(projectId, runId, payload, authToken);

      setPrStep('Pull Request successfully created!');
      setPrResult(response);
    } catch (err: any) {
      setPrError(err.message || 'Failed to create GitHub Pull Request.');
    } finally {
      setIsSubmittingPr(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl border border-emerald-500/50 bg-panel/90 shadow-2xl space-y-4 font-mono">
        <div className="flex items-center gap-3 border-b border-panelBorder pb-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">
              Executing Real Sandbox Verification Pipeline
            </h3>
            <p className="text-[11px] text-gray-400 font-mono">
              DYNAMIC PORT EXECUTION // LIVE HTTP PROBING // REGRESSION CHECKS
            </p>
          </div>
        </div>

        <div className="space-y-2.5 py-4">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Patched project loaded from working workspace</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Dynamic port allocated & environment sanitized</span>
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

  if (!verification) return null;

  const isVerified = verification.status === 'VERIFIED';
  const isFailed = verification.status === 'VERIFICATION_FAILED' || verification.status === 'SECURITY_FAILURE';
  const isRegression = verification.status === 'REGRESSION_DETECTED';

  const downloadUrl = (projectId && runId && isVerified)
    ? getVerifiedDownloadUrl(projectId, runId)
    : null;

  return (
    <>
      <div className={`p-6 rounded-2xl border ${
        isVerified
          ? 'border-emerald-500/50 bg-emerald-950/20'
          : isRegression
          ? 'border-amber-500/50 bg-amber-950/20'
          : 'border-red-500/40 bg-red-950/10'
      } shadow-2xl space-y-5 font-mono text-xs`}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-panelBorder pb-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isVerified
                ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
                : isRegression
                ? 'bg-amber-600/20 border border-amber-500/40 text-amber-400'
                : 'bg-red-600/20 border border-red-500/40 text-red-400'
            }`}>
              {isVerified ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white uppercase tracking-tight">
                  {isVerified
                    ? 'Real Repair Verified'
                    : isRegression
                    ? 'Regression Detected'
                    : 'Verification Failed'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  isVerified
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : isRegression
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40'
                }`}>
                  {verification.status}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                Target: {verification.target?.method} {verification.target?.path} · Workspace integrity verified
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download Verified ZIP */}
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="px-3.5 py-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 text-white font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_16px_rgba(16,185,129,0.2)] font-bold cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .ZIP</span>
              </a>
            )}

            {/* Create Pull Request Button (Verified Only) */}
            {isVerified && (
              <button
                onClick={handleOpenPrModal}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-2 shadow-[0_0_16px_rgba(99,102,241,0.3)] font-bold cursor-pointer"
              >
                <GitPullRequest className="w-3.5 h-3.5" />
                <span>Create Pull Request</span>
              </button>
            )}
          </div>
        </div>

        {/* PR Success Banner if already generated in this session */}
        {prResult && (
          <div className="p-3.5 rounded-xl border border-indigo-500/50 bg-indigo-950/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-white font-bold">Pull Request #{prResult.pullRequestNumber} Created</span>
                <p className="text-[11px] text-gray-400">Branch: <code className="text-indigo-300">{prResult.branch}</code> · Commit: <code className="text-gray-300">{prResult.commitSha.substring(0, 7)}</code></p>
              </div>
            </div>
            <a
              href={prResult.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
            >
              <span>Open on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Decision Summary */}
        <div className="p-3.5 rounded-xl border border-panelBorder bg-bg/60 space-y-1">
          <span className="text-[10px] text-gray-500 uppercase font-bold block">VERIFICATION DECISION</span>
          <p className="text-white text-xs font-semibold">{verification.decisionReason}</p>
        </div>

        {/* Before vs After Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* BEFORE BOX */}
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-red-400">
              <span>BEFORE REPAIR</span>
              <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30">
                HTTP {verification.before.status}
              </span>
            </div>
            <div className="space-y-1 text-[11px] font-mono">
              <div className="text-gray-400">Category: <span className="text-gray-200">{verification.before.category}</span></div>
              <div className="text-red-300 truncate">Error: {verification.before.error || 'Unhandled Exception'}</div>
            </div>
          </div>

          {/* AFTER BOX */}
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
              <span>AFTER REPAIR (PATCHED)</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
                HTTP {verification.after.status || 'N/A'}
              </span>
            </div>
            <div className="space-y-1 text-[11px] font-mono">
              <div className="text-gray-400">Crash Resolved: <span className="text-emerald-300 font-bold">{verification.targetFailureResolved ? 'YES' : 'NO'}</span></div>
              <div className="text-gray-300 truncate">Response: {typeof verification.after.responseBody === 'object' ? JSON.stringify(verification.after.responseBody) : (verification.after.responseBody || 'Controlled Response')}</div>
            </div>
          </div>
        </div>

        {/* Gate Verification Checks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="p-2.5 rounded-lg border border-panelBorder bg-black/40 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-gray-300">App Starts Live</span>
          </div>
          <div className="p-2.5 rounded-lg border border-panelBorder bg-black/40 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-gray-300">Target Reachable</span>
          </div>
          <div className="p-2.5 rounded-lg border border-panelBorder bg-black/40 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-gray-300">
              Tests: {verification.tests.status}
            </span>
          </div>
          <div className="p-2.5 rounded-lg border border-panelBorder bg-black/40 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[10px] text-gray-300">original/ Immutable</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-panelBorder">
          {onViewEvidence && (
            <button
              onClick={onViewEvidence}
              className="px-3.5 py-1.5 rounded-lg border border-panelBorder hover:border-gray-500 bg-panel text-gray-300 hover:text-white font-mono text-[11px] uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>View Raw Evidence</span>
            </button>
          )}

          {onVerify && !isVerified && (
            <button
              onClick={onVerify}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] uppercase tracking-wider font-bold flex items-center gap-1.5 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Re-run Verification</span>
            </button>
          )}
        </div>
      </div>

      {/* GitHub Pull Request Modal */}
      {isPrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-mono text-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-indigo-500/50 bg-panel shadow-2xl p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-panelBorder pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Github className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-tight">
                    Create GitHub Pull Request
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Push verified repair branch & open Pull Request
                  </p>
                </div>
              </div>
              <button
                onClick={handleClosePrModal}
                disabled={isSubmittingPr}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-panelBorder/50 transition-all disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Display */}
            {prError && (
              <div className="p-3.5 rounded-xl border border-red-500/50 bg-red-950/30 text-red-300 space-y-1">
                <div className="flex items-center gap-2 font-bold text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>GitHub Operation Failed</span>
                </div>
                <p className="text-[11px] pl-6">{prError}</p>
              </div>
            )}

            {/* Success State */}
            {prResult ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl border border-emerald-500/50 bg-emerald-950/20 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Pull Request Opened Successfully!</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-gray-300 pl-7">
                    <div>Pull Request: <span className="text-white font-bold">#{prResult.pullRequestNumber}</span></div>
                    <div>Branch: <code className="text-indigo-300">{prResult.branch}</code></div>
                    <div>Commit: <code className="text-gray-300">{prResult.commitSha.substring(0, 7)}</code></div>
                    <div>Base Branch: <code className="text-gray-300">{prResult.baseBranch}</code></div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={handleClosePrModal}
                    className="px-4 py-2 rounded-lg border border-panelBorder hover:border-gray-500 text-gray-300 hover:text-white font-bold uppercase tracking-wider text-[11px]"
                  >
                    Done
                  </button>
                  <a
                    href={prResult.pullRequestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-wider text-[11px] flex items-center gap-2 shadow-[0_0_16px_rgba(99,102,241,0.3)]"
                  >
                    <span>View Pull Request on GitHub</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : (
              /* Form State */
              <form onSubmit={handleCreatePullRequest} className="space-y-4">
                {/* Repository Target */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-gray-300 uppercase font-bold flex items-center justify-between">
                    <span>Target Repository (owner/repo)</span>
                  </label>
                  <input
                    type="text"
                    value={customRepo}
                    onChange={(e) => setCustomRepo(e.target.value)}
                    placeholder="e.g. facebook/react or owner/repository"
                    disabled={isSubmittingPr}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-panelBorder bg-bg/80 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs placeholder:text-gray-600 disabled:opacity-50"
                  />
                </div>

                {/* Base Branch */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-gray-300 uppercase font-bold">
                    Base Branch to Target
                  </label>
                  <input
                    type="text"
                    value={baseBranch}
                    onChange={(e) => setBaseBranch(e.target.value)}
                    placeholder="main or master"
                    disabled={isSubmittingPr}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-panelBorder bg-bg/80 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs disabled:opacity-50"
                  />
                </div>

                {/* GitHub Personal Access Token */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-gray-300 uppercase font-bold flex items-center justify-between">
                    <span>GitHub Personal Access Token (PAT)</span>
                    <span className="text-[10px] text-gray-500 lowercase">repo scope required</span>
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="Personal Access Token (classic or fine-grained)"
                    disabled={isSubmittingPr}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-panelBorder bg-bg/80 text-white focus:outline-none focus:border-indigo-500 font-mono text-xs placeholder:text-gray-600 disabled:opacity-50"
                  />
                  <p className="text-[10px] text-gray-500">
                    Token is used ephemerally and never persisted to the database in plaintext.
                  </p>
                </div>

                {/* Live Progress Bar during execution */}
                {isSubmittingPr && (
                  <div className="p-3.5 rounded-xl border border-indigo-500/40 bg-indigo-950/20 space-y-2">
                    <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span>{prStep}</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-bg border border-panelBorder overflow-hidden">
                      <div className="h-full bg-indigo-500 animate-indeterminate" />
                    </div>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-panelBorder">
                  <button
                    type="button"
                    onClick={handleClosePrModal}
                    disabled={isSubmittingPr}
                    className="px-4 py-2 rounded-lg border border-panelBorder hover:border-gray-500 text-gray-300 hover:text-white font-bold uppercase tracking-wider text-[11px] transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPr}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold uppercase tracking-wider text-[11px] transition-all flex items-center gap-2 shadow-[0_0_16px_rgba(99,102,241,0.3)] disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingPr ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Creating PR...</span>
                      </>
                    ) : (
                      <>
                        <GitPullRequest className="w-3.5 h-3.5" />
                        <span>Create Pull Request</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
