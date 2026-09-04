'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Server,
  AlertCircle,
  PlayCircle,
  TestTube,
  FolderGit2,
  Cpu,
  Box,
  Shield,
  Github,
  Upload,
  GitBranch,
  Key,
  History,
  Sparkles,
  Code,
  CreditCard,
  Activity,
  X,
  Menu
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { importGithubRepo } from '../lib/api';
import { useAuth } from '../lib/authContext';

export default function Sidebar({
  onTriggerDemo,
  onStartRun,
  onOpenIntakeModal,
  currentTab = 'overview',
  onSelectTab
}: {
  onTriggerDemo?: () => void;
  onStartRun?: (runId: string) => void;
  onOpenIntakeModal?: () => void;
  currentTab?: string;
  onSelectTab?: (tab: string) => void;
}) {
  const router = useRouter();
  const { user, isAdmin, isDemoUser, token } = useAuth();
  const [ingestMode, setIngestMode] = useState<'zip' | 'github'>('github');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
  const [authTokenInput, setAuthTokenInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems = [
    { label: 'Overview', tab: 'overview', icon: LayoutDashboard },
    { label: 'SRE & Observability', tab: 'sre', icon: Activity, badge: 'Live' },
    { label: 'Operations Center', tab: 'operations', icon: Shield, badge: 'SRE', path: '/operations' },
    { label: 'APIs Registry', tab: 'apis', icon: Server, badge: 'Live' },
    { label: 'Incidents', tab: 'incidents', icon: AlertCircle, badge: 'Open' },
    { label: 'Agent Runs', tab: 'runs', icon: PlayCircle },
    { label: 'Sandbox Tests', tab: 'tests', icon: TestTube },
    { label: 'Repository Explorer', tab: 'repo', icon: FolderGit2 },
    { label: 'Usage History', tab: 'history', icon: History },
    { label: 'Billing & Credits', tab: 'billing', icon: CreditCard },
    { label: 'Enterprise Admin', tab: 'admin', icon: Shield, badge: 'Gov', path: '/admin' },
    { label: 'Developer Portal', tab: 'developer', icon: Code, badge: 'v1', path: '/developer' }
  ];

  const systemItems = [
    { label: 'Agent Engine', icon: Cpu, detail: 'Online' },
    { label: 'Isolated Sandbox', icon: Box, detail: 'Docker' }
  ];

  const handleUploadAndRun = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('code', selectedFile);
      const activeAuthToken = token || authTokenInput;
      if (activeAuthToken) {
        formData.append('authToken', activeAuthToken);
      }

      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${BACKEND_URL}/api/runs/upload`, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to upload workspace');
      }

      const data = await res.json();
      setSelectedFile(null);
      setAuthTokenInput('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (onStartRun) {
        onStartRun(data.runId);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Upload failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGithubImportAndRun = async () => {
    if (!githubUrl.trim()) return;
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const data = await importGithubRepo({
        repoUrl: githubUrl.trim(),
        branch: githubBranch.trim() || 'main',
        githubToken: githubToken.trim() || undefined,
        authToken: token || authTokenInput.trim() || undefined
      });

      setGithubUrl('');
      setGithubToken('');
      setAuthTokenInput('');

      if (onStartRun) {
        onStartRun(data.runId);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'GitHub import failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const content = (
    <div className="flex flex-col justify-between h-full space-y-6 font-sans text-xs">
      <div className="space-y-6">
        {/* Brand Header */}
        <Link href="/" className="flex items-center gap-2.5 px-2 py-2 group">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-all">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white font-mono flex items-center gap-1.5">
              <span>APIFIX AI</span>
              <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                PROD
              </span>
            </div>
            <div className="text-[10px] text-gray-400 font-mono tracking-tight">AUTONOMOUS RELIABILITY</div>
          </div>
        </Link>

        {/* Primary Navigation */}
        <nav aria-label="Main Navigation" className="space-y-1">
          <div className="px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-500">
            Control Plane
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            const active =
              (!currentTab && item.tab === 'overview') ||
              currentTab === item.tab;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.path) {
                    router.push(item.path);
                  } else if (onSelectTab) {
                    onSelectTab(item.tab);
                  }
                  setMobileOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all font-mono text-xs ${
                  active
                    ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 shadow-sm font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-bg border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-400' : 'text-gray-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`font-mono text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                    item.badge === 'Live'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : item.badge === 'Open'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Codebase Import Section */}
        <div className="space-y-2.5 border-t border-panelBorder pt-4">
          <div className="px-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-400 flex items-center justify-between">
            <span>Code Intake</span>
            <span className="text-[9px] text-emerald-400 font-mono">SANDBOX READY</span>
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-bg/80 border border-panelBorder rounded-xl font-mono text-[10px]">
            <button
              type="button"
              onClick={() => { setIngestMode('github'); setErrorMsg(''); }}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                ingestMode === 'github'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub</span>
            </button>

            <button
              type="button"
              onClick={() => { setIngestMode('zip'); setErrorMsg(''); }}
              className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                ingestMode === 'zip'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>ZIP File</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[10px] font-mono text-red-300 leading-tight">
              {errorMsg}
            </div>
          )}

          {/* GitHub Form */}
          {ingestMode === 'github' && (
            <div className="space-y-2 px-0.5 font-sans">
              <div>
                <label className="block text-[10px] text-gray-400 font-mono mb-1">GitHub Repo URL</label>
                <div className="relative">
                  <Github className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="w-full pl-8 pr-2 py-1.5 bg-bg border border-panelBorder focus:border-indigo-500 rounded-lg text-xs text-white placeholder:text-gray-600 font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 font-sans">
                <div>
                  <label className="block text-[9px] text-gray-400 font-mono mb-1">Branch</label>
                  <div className="relative">
                    <GitBranch className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-2" />
                    <input
                      type="text"
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      placeholder="main"
                      className="w-full pl-7 pr-2 py-1 bg-bg border border-panelBorder focus:border-indigo-500 rounded-lg text-[11px] text-white placeholder:text-gray-600 font-mono outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] text-gray-400 font-mono mb-1">Personal Token</label>
                  <div className="relative">
                    <Key className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-2" />
                    <input
                      type="password"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_***"
                      className="w-full pl-7 pr-2 py-1 bg-bg border border-panelBorder focus:border-indigo-500 rounded-lg text-[11px] text-white placeholder:text-gray-600 font-mono outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={!githubUrl.trim() || isProcessing}
                onClick={handleGithubImportAndRun}
                className="w-full py-2 px-3 rounded-xl border border-indigo-500/50 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 mt-1"
              >
                <Github className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Importing & Repairing...' : 'Clone & Auto-Repair'}</span>
              </button>
            </div>
          )}

          {/* ZIP Form */}
          {ingestMode === 'zip' && (
            <div className="space-y-2 px-0.5 font-sans">
              <button
                type="button"
                onClick={() => {
                  if (onOpenIntakeModal) onOpenIntakeModal();
                  else fileInputRef.current?.click();
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-dashed border-indigo-500/40 hover:border-indigo-500 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 transition-all text-left flex items-center justify-between font-mono text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Upload Project (.zip)</span>
                </div>
                <span className="text-[10px] text-indigo-400 font-bold">Intake</span>
              </button>
              <p className="text-[10px] text-gray-500 font-mono px-1">
                Safe extraction · Immutable storage
              </p>
            </div>
          )}
        </div>

        {/* System Section */}
        <div className="space-y-1 border-t border-panelBorder pt-4 font-mono">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">System Engine</div>
          {systemItems.map(sys => {
            const Icon = sys.icon;
            return (
              <div key={sys.label} className="flex items-center justify-between px-2.5 py-1.5 text-gray-400">
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-gray-500" />
                  <span>{sys.label}</span>
                </div>
                <span className="text-emerald-400 font-semibold">[{sys.detail}]</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Section */}
      <div className="border-t border-panelBorder pt-4 mt-4 font-sans">
        {isAdmin ? (
          <button
            onClick={onTriggerDemo}
            className="w-full py-2.5 px-3 rounded-xl border border-indigo-500/50 bg-indigo-600 text-white font-mono text-[11px] uppercase tracking-wider hover:bg-indigo-500 transition-all flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(99,102,241,0.2)] font-bold"
            title="Trigger seeded demo API incident (Admin Demo Mode)"
          >
            <PlayCircle className="w-4 h-4 text-indigo-200" />
            <span>Run Demo Incident</span>
          </button>
        ) : (
          <button
            onClick={() => {
              if (onOpenIntakeModal) onOpenIntakeModal();
              else if (onSelectTab) onSelectTab('repo');
            }}
            className="w-full py-2.5 px-3 rounded-xl border border-indigo-500/40 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-200 font-mono text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 font-bold"
            title="Import or upload project workspace"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>⚡ Import & Intake Code</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Trigger Bar */}
      <div className="lg:hidden fixed bottom-4 left-4 z-40">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open Navigation Sidebar"
          className="p-3 rounded-2xl bg-indigo-600 text-white shadow-2xl shadow-indigo-600/40 border border-indigo-400/30 flex items-center justify-center"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Backdrop & Slide-over Drawer */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] bg-panel border-r border-panelBorder h-full p-4 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setMobileOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
                aria-label="Close Navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {content}
          </div>
        </div>
      )}

      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-panelBorder bg-panel/75 backdrop-blur-xl flex-col h-screen sticky top-0 p-4 overflow-y-auto z-20">
        {content}
      </aside>
    </>
  );
}
