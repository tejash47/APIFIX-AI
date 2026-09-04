'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  X,
  Server,
  AlertCircle,
  Cpu,
  TestTube,
  Shield,
  RotateCcw,
  Check,
  FolderGit2,
  Play,
  Layers,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useToast } from '../lib/ToastContext';

interface CustomerOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartDemo?: () => void;
  onOpenProjectIntake?: () => void;
}

const STEPS = [
  { id: 1, title: 'Workspace Setup', desc: 'Configure your organization and workspace environment' },
  { id: 2, title: 'Connect API', desc: 'Import an API via Git repo, ZIP archive, or pre-warmed Demo API' },
  { id: 3, title: 'API Discovery', desc: 'Scan and index REST endpoints and OpenAPI schema' },
  { id: 4, title: 'Incident Ingestion', desc: 'Detect production HTTP runtime crashes and anomalies' },
  { id: 5, title: 'AI Root-Cause Analysis', desc: 'AI investigates stack trace and generates AST patch' },
  { id: 6, title: 'Sandbox Verification', desc: 'Verify fix in isolated ephemeral sandbox container' },
  { id: 7, title: 'Governance & Launch', desc: 'Approve fix and view immutable cryptographic audit ledger' }
];

export default function CustomerOnboardingModal({
  isOpen,
  onClose,
  onStartDemo,
  onOpenProjectIntake
}: CustomerOnboardingModalProps) {
  const { user, activeWorkspace } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Load saved onboarding state if present
      const saved = localStorage.getItem('apifix_onboarding_step');
      if (saved) {
        const stepNum = parseInt(saved, 10);
        if (!isNaN(stepNum) && stepNum >= 1 && stepNum <= 7) {
          setCurrentStep(stepNum);
          setCompletedSteps(Array.from({ length: stepNum - 1 }, (_, i) => i + 1));
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNextStep = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const next = currentStep + 1;
      const newCompleted = [...completedSteps, currentStep];
      setCompletedSteps(newCompleted);

      localStorage.setItem('apifix_onboarding_step', String(next));

      // Sync with backend API
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      await fetch(`${BACKEND_URL}/api/product/onboarding/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id || 'default_workspace',
          step: currentStep,
          action: 'complete'
        })
      }).catch(() => {});

      if (currentStep >= 7) {
        toast.success('Onboarding Complete!', 'Welcome to APIFIX AI Autonomous Control Plane.');
        onClose();
      } else {
        setCurrentStep(next);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to advance onboarding step');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    localStorage.setItem('apifix_onboarding_step', '7');
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    await fetch(`${BACKEND_URL}/api/product/onboarding/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: activeWorkspace?.id || 'default_workspace',
        skipped: true
      })
    }).catch(() => {});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl border border-panelBorder bg-panel shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-panelBorder flex items-center justify-between bg-bg/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                APIFIX AI Quickstart Onboarding
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Step {currentStep} of 7
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Follow this guided walkthrough to connect, detect, and self-heal your first API endpoint.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Stepper Bar */}
        <div className="px-6 py-3 bg-bg/80 border-b border-panelBorder flex items-center justify-between gap-1 overflow-x-auto">
          {STEPS.map((s) => {
            const isDone = completedSteps.includes(s.id);
            const isCurrent = currentStep === s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono shrink-0 transition-all ${
                  isCurrent
                    ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                    : isDone
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-gray-500 bg-panel/40'
                }`}
              >
                {isDone ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <span>{s.id}.</span>
                )}
                <span className="hidden sm:inline">{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Workspace */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <Shield className="w-4 h-4" />
                  <span>Workspace &amp; Organization Scope</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Your tenant workspace is provisioned with row-level security isolation, dedicated job queues, and Merkle audit ledger hashing.
                </p>
                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono pt-2">
                  <div className="p-2.5 rounded-lg bg-bg/60 border border-panelBorder">
                    <span className="text-gray-500 block">Workspace ID</span>
                    <span className="text-white font-bold">{activeWorkspace?.id || 'ws_default_alpha'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-bg/60 border border-panelBorder">
                    <span className="text-gray-500 block">Isolation Tier</span>
                    <span className="text-emerald-400 font-bold">Enterprise Dedicated</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Connect API */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <FolderGit2 className="w-4 h-4" />
                  <span>Choose Your Ingestion Source</span>
                </div>
                <p className="text-xs text-gray-300">
                  Select how you want to connect your API codebase to APIFIX AI:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => {
                      if (onStartDemo) onStartDemo();
                    }}
                    className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-left transition-all group"
                  >
                    <div className="flex items-center justify-between text-indigo-300 font-bold text-xs">
                      <span>⚡ Pre-Warmed Demo API</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Includes reproducible HTTP 500 error for immediate zero-config demonstration.
                    </p>
                  </button>
                  <button
                    onClick={() => {
                      if (onOpenProjectIntake) onOpenProjectIntake();
                    }}
                    className="p-3 rounded-xl border border-panelBorder bg-panel/80 hover:border-indigo-500/40 text-left transition-all group"
                  >
                    <div className="flex items-center justify-between text-white font-bold text-xs">
                      <span>📁 Upload ZIP / GitHub</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Connect your existing Node.js / Express codebase with automated route indexing.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Discovery */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <Server className="w-4 h-4" />
                  <span>Static &amp; Dynamic Route Discovery</span>
                </div>
                <p className="text-xs text-gray-300">
                  APIFIX parses your route handlers via Babel AST and performs dynamic dynamic TCP port probing to verify endpoint reachability.
                </p>
                <div className="p-3 rounded-lg bg-bg/80 border border-panelBorder font-mono text-[11px] space-y-1">
                  <div className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>POST /api/auth/login — Discovered (Auth Required)</span>
                  </div>
                  <div className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>GET /api/users — Discovered (Public)</span>
                  </div>
                  <div className="text-indigo-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>GET /health — Discovered (Liveness Probe)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Incident Ingestion */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Incident Ingestion &amp; Crash Capture</span>
                </div>
                <p className="text-xs text-gray-300">
                  When a runtime exception occurs, APIFIX captures the HTTP request payload, response status, and stack trace without recording secrets.
                </p>
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 font-mono text-[11px] text-red-300">
                  <div className="font-bold">HTTP 500 Internal Server Error</div>
                  <div className="text-gray-400 mt-1">TypeError: Cannot read properties of undefined (reading 'password')</div>
                  <div className="text-gray-500 text-[10px]">at /src/controllers/auth.js:42:18</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: AI Investigation */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                  <Cpu className="w-4 h-4" />
                  <span>Autonomous AI Root-Cause Investigation</span>
                </div>
                <p className="text-xs text-gray-300">
                  The AI multi-provider cascade analyzes source code around the fault line and generates a minimal, syntax-verified patch diff.
                </p>
                <div className="p-3 rounded-lg bg-bg/80 border border-panelBorder font-mono text-[11px] text-indigo-300">
                  <span className="text-gray-400 block font-bold">Root Cause Summary:</span>
                  <span>Missing null check on user request payload object before password property access.</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Sandbox Verification */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <TestTube className="w-4 h-4" />
                  <span>Ephemeral Sandbox Verification Probe</span>
                </div>
                <p className="text-xs text-gray-300">
                  Before any code is committed, APIFIX boots an isolated test instance on a dynamic port and executes regression test suites.
                </p>
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 font-mono text-[11px] text-emerald-300">
                  <div className="font-bold">VERIFIED: HTTP 500 $\rightarrow$ HTTP 401 (Controlled Response)</div>
                  <div className="text-gray-400 mt-1">Unit Tests: 1/1 Passed (0 regressions)</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 7: Governance & Launch */}
          {currentStep === 7 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3 text-center">
                <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-2">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-white">You Are Ready for Autonomous API Repair!</h3>
                <p className="text-xs text-gray-300 max-w-md mx-auto">
                  Your platform is configured with multi-reviewer approval gates, immutable SHA-256 audit logging, and automated Canary rollouts.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-panelBorder bg-bg/50 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs font-mono text-gray-400 hover:text-white transition-all px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            Skip Walkthrough
          </button>

          <div className="flex items-center gap-3">
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                className="px-4 py-2 rounded-xl border border-panelBorder bg-panel hover:bg-panelBorder/40 text-xs font-mono text-white transition-all"
              >
                Back
              </button>
            )}

            <button
              onClick={handleNextStep}
              disabled={isLoading}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-mono font-bold text-white flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
            >
              {isLoading ? (
                <span>Saving...</span>
              ) : currentStep === 7 ? (
                <>
                  <span>Enter Platform</span>
                  <Check className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Next Step</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
