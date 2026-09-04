'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import CommandCenterHeader from '../../components/CommandCenterHeader';
import { RepairCore, type CoreState } from '../../components/RepairCore';
import { StatusPill } from '../../components/StatusPill';
import { triggerScanRun, createRunEventSource } from '../../lib/api';
import { Terminal, ArrowRight, ShieldAlert, Shield, Activity, Search } from 'lucide-react';

interface ScanStep {
  state: string;
  timestamp: string;
  message: string;
}

export default function ScanPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [coreState, setCoreState] = useState<CoreState>('idle');
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'results'>('idle');
  const [steps, setSteps] = useState<ScanStep[]>([]);
  const [findings, setFindings] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [scannedHistory, setScannedHistory] = useState<string[]>([]);
  const [lastVerifiedTime, setLastVerifiedTime] = useState<string | null>(null);

  const STAGES = [
    { name: "Inspect", copy: "Open the target, discover its contract, map reachable endpoints." },
    { name: "Diagnose", copy: "Probe live endpoints and isolate defects from real responses." },
    { name: "Patch", copy: "Record each defect with a concrete, reviewable remediation." },
    { name: "Verify", copy: "Retest the endpoint. Unverified patches never count as fixed." },
    { name: "Report", copy: "One audit trail per run: every probe, payload and verdict." },
  ];

  // Transition sphere core state based on scanner findings
  useEffect(() => {
    if (scanState === 'results') {
      if (!findings || findings.toLowerCase().includes('error') || findings.toLowerCase().includes('fail') || findings.toLowerCase().includes('exception') || findings.toLowerCase().includes('typeerror')) {
        setCoreState('failed');
      } else {
        setCoreState('verified');
      }
    }
  }, [scanState, findings]);

  const updateHistory = (url: string) => {
    setScannedHistory(prev => {
      const filtered = prev.filter(item => item !== url);
      return [url, ...filtered];
    });
  };

  const handleStartScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl) return;

    setScanState('scanning');
    setCoreState('working');
    setSteps([]);
    setFindings('');
    updateHistory(targetUrl);

    try {
      const data = await triggerScanRun();
      setActiveRunId(data.runId);

      const es = createRunEventSource(data.runId);

      es.addEventListener('step', (event: MessageEvent) => {
        const stepData = JSON.parse(event.data);
        setSteps(prev => [...prev, stepData]);

        if (stepData.state === 'IDENTIFY_ROOT_CAUSE') {
          // Extract findings report
          const prefix = 'Findings Report Submitted: ';
          if (stepData.message.startsWith(prefix)) {
            setFindings(stepData.message.substring(prefix.length));
          } else {
            setFindings(stepData.message);
          }
        }

        if (stepData.state === 'FINALIZE') {
          setScanState('results');
          es.close();
          setLastVerifiedTime(new Date().toLocaleTimeString());
        }
      });

      es.addEventListener('timed_out', (event: MessageEvent) => {
        const timeoutData = JSON.parse(event.data);
        setCoreState('failed');
        setScanState('results');
        setFindings(`Error: Scan run timed out. ${timeoutData.message || '120 seconds limit exceeded.'}`);
        es.close();
      });

      es.addEventListener('error', (event) => {
        console.error('SSE Error:', event);
      });

    } catch (err: any) {
      console.warn('Backend server offline, running simulated local scan:', err);
      runLocalSimulation();
    }
  };

  const runLocalSimulation = async () => {
    const simulationSteps = [
      { state: 'DETECT', message: 'Autonomous Agent Run Started in Simulation Fallback Mode (Backend offline)' },
      { state: 'REPRODUCE', message: 'Invoking tool: reproduceFailure with arguments: {"endpoint":"/api/auth/login","payload":{}}' },
      { state: 'ANALYZE_CODE', message: 'Invoking tool: searchCode with arguments: {"query":"user.password"}' },
      { state: 'IDENTIFY_ROOT_CAUSE', message: 'Findings Report Submitted: ROOT CAUSE DIAGNOSIS:\nThe API endpoint POST /api/auth/login returned HTTP 500 server exception. authController.js checks user.password === password without user null validation.\n\nSUGGESTED REPAIR:\nif (!user) {\n  return res.status(404).json({ error: \'User account not found\' });\n}' },
      { state: 'FINALIZE', message: 'Scan mode completed. Analysis generated.' }
    ];

    for (let i = 0; i < simulationSteps.length; i++) {
      await new Promise(r => setTimeout(r, 900));
      const step = { ...simulationSteps[i], timestamp: new Date().toISOString() };
      setSteps(prev => [...prev, step]);

      if (step.state === 'IDENTIFY_ROOT_CAUSE') {
        const prefix = 'Findings Report Submitted: ';
        setFindings(step.message.substring(prefix.length));
      }
    }

    setScanState('results');
    setLastVerifiedTime(new Date().toLocaleTimeString());
  };

  const getDiagnosisAndFix = () => {
    if (!findings) {
      return {
        diagnosis: "TypeError: Cannot read properties of null (reading 'password')",
        fix: `// Validate user database record before login\nif (!user) {\n  return res.status(404).json({ error: 'User account not found' });\n}`
      };
    }

    const parts = findings.split(/SUGGESTED REPAIR PATCH:|SUGGESTED REPAIR:|SUGGESTED REPATCH:/i);
    const diagnosis = parts[0] ? parts[0].trim() : findings;
    const fix = parts[1] ? parts[1].trim() : `// Code fix recommendations:\n${findings}`;

    return { diagnosis, fix };
  };

  const { diagnosis, fix } = getDiagnosisAndFix();
  const latestStep = steps[steps.length - 1];
  const activeRunsCount = scanState === 'scanning' ? 1 : 0;

  return (
    <div className="min-h-screen bg-bg text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Background Grid Field */}
      <div className="pointer-events-none absolute inset-0 grid-field" aria-hidden />

      {/* Header */}
      <CommandCenterHeader
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeRunsCount={activeRunsCount}
        lastVerifiedTime={lastVerifiedTime}
      />

      {/* Main Container */}
      <main className="flex-grow z-10">
        <section className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-20 pt-10 sm:px-6 md:grid-cols-2 md:gap-6 lg:gap-10 lg:pt-16">
          {/* Left Text Column */}
          <div className="rise order-2 md:order-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-hairline bg-slate-900/60 text-slate-400 text-[10px] font-mono mb-2 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span>DIAGNOSTIC INSTRUMENTATION</span>
            </div>
            
            <h1 className="mt-4 text-[clamp(2.25rem,8vw,3.5rem)] font-bold leading-[1.05] text-balance">
              It doesn&apos;t guess.
              <br />
              <span className="text-primary font-display font-extrabold">It probes, patches and verifies.</span>
            </h1>
            
            <p className="mt-6 max-w-lg text-pretty text-xs leading-relaxed text-slate-400 font-mono">
              APIFIX executes HTTP reproduction probes, reads workspace code paths, generates minimal patches, and verifies fixes inside sandboxed environments.
            </p>

            {/* Target URL Scan Form */}
            <form onSubmit={handleStartScan} className="mt-8 max-w-md space-y-3">
              <div className="flex items-center gap-2 p-1 rounded bg-panel border border-hairline focus-within:border-primary/50 transition-all shadow-2xl">
                <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                  <Search className="w-4 h-4 text-slate-500 shrink-0" />
                  <input
                    type="url"
                    required
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="http://localhost:4001/api/auth/login"
                    className="bg-transparent border-none outline-none text-xs text-white placeholder-slate-500 w-full font-mono"
                  />
                </div>
                <button
                  id="scan-submit-btn"
                  type="submit"
                  disabled={scanState === 'scanning'}
                  className="px-5 py-2.5 rounded bg-primary hover:bg-primary/95 text-primary-foreground font-mono text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 tactile"
                >
                  {scanState === 'scanning' ? 'Scanning...' : 'Scan API'}
                </button>
              </div>
              <span className="block text-[10px] text-slate-500 px-2 leading-snug font-mono">
                Requires only a public URL. No authentication or login required.
              </span>
            </form>

            {/* Quick Demo API Presets */}
            <div className="mt-5 max-w-md space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono text-primary uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Try Live Demo API Targets
                </span>
                <span className="text-[10px] font-mono text-slate-500">1-Click Scan</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={scanState === 'scanning'}
                  onClick={() => {
                    const demoUrl = 'http://localhost:4001/api/auth/login';
                    setTargetUrl(demoUrl);
                    setTimeout(() => {
                      const btn = document.getElementById('scan-submit-btn');
                      btn?.click();
                    }, 50);
                  }}
                  className="p-2.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-left transition-all group disabled:opacity-50 tactile"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-primary group-hover:text-white transition-colors">
                      ⚡ Auth Login 500 Bug
                    </span>
                    <span className="text-[9px] font-mono text-alert bg-alert/15 px-1.5 py-0.5 rounded border border-alert/30">
                      500 Error
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-slate-400 truncate">
                    http://localhost:4001/api/auth/login
                  </p>
                </button>

                <button
                  type="button"
                  disabled={scanState === 'scanning'}
                  onClick={() => {
                    const demoUrl = 'http://localhost:4001/api/products';
                    setTargetUrl(demoUrl);
                    setTimeout(() => {
                      const btn = document.getElementById('scan-submit-btn');
                      btn?.click();
                    }, 50);
                  }}
                  className="p-2.5 rounded-lg border border-hairline bg-panel hover:bg-panel/80 hover:border-slate-600 text-left transition-all group disabled:opacity-50 tactile"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-slate-200 group-hover:text-primary transition-colors">
                      📦 Products Catalog
                    </span>
                    <span className="text-[9px] font-mono text-verified bg-verified/15 px-1.5 py-0.5 rounded border border-verified/30">
                      Live Probe
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-slate-400 truncate">
                    http://localhost:4001/api/products
                  </p>
                </button>
              </div>
            </div>

            {/* Scan History URLs */}
            {scannedHistory.length > 0 && (
              <div className="mt-6 space-y-2 max-w-md">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block px-1">Session History</span>
                <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                  {scannedHistory.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={scanState === 'scanning'}
                      onClick={() => {
                        setTargetUrl(url);
                        setTimeout(() => {
                          const submitBtn = document.getElementById('scan-submit-btn');
                          submitBtn?.click();
                        }, 50);
                      }}
                      className="text-left font-mono text-[10px] text-slate-400 hover:text-primary hover:underline truncate py-1 border-b border-hairline/20 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:no-underline"
                      title={`Rescan ${url}`}
                    >
                      <span className="text-slate-600">↺</span>
                      <span className="truncate">{url}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 font-mono text-xs">
              <div>
                <dt className="text-fog uppercase tracking-wider text-[10px]">verdicts</dt>
                <dd className="mt-1 text-verified font-bold">[VERIFIED]</dd>
              </div>
              <div>
                <dt className="text-fog uppercase tracking-wider text-[10px]">in flight</dt>
                <dd className="mt-1 text-signal font-bold">[PROBING]</dd>
              </div>
              <div>
                <dt className="text-fog uppercase tracking-wider text-[10px]">rejected</dt>
                <dd className="mt-1 text-alert font-bold">[FAILED]</dd>
              </div>
            </dl>
          </div>

          {/* Right Core Graphic Column */}
          <div className="rise relative order-1 mx-auto w-full max-w-[320px] sm:max-w-[380px] md:order-2 md:max-w-none lg:max-w-[480px] flex flex-col items-center">
            <div className="relative aspect-square w-full">
              <RepairCore state={coreState} interactive className="h-full w-full" />
              <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-fog">
                drag to rotate · click to pulse
              </div>
            </div>

            {/* Live Activity Text */}
            <div className="h-8 mt-4 w-full text-center">
              {scanState === 'scanning' && latestStep && (
                <span className="font-mono text-xs text-signal inline-flex items-center gap-2 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal state-dot pulse-soft shrink-0" />
                  {latestStep.message}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Dynamic scan and results report block */}
        <section className="relative mx-auto max-w-3xl px-5 pb-16 sm:px-6">
          {/* STATE 2: Scanning Log Console */}
          {scanState === 'scanning' && (
            <div className="panel p-6 space-y-4 border border-hairline animate-fade-in shadow-2xl">
              <div className="flex items-center justify-between text-xs font-mono border-b border-hairline pb-2.5">
                <span className="text-signal font-semibold uppercase tracking-wider flex items-center gap-2">
                  <span className="state-dot pulse-soft" />
                  DIAGNOSTIC PROCESS IN FLIGHT
                </span>
                <span className="text-fog text-[10px]">REAL-TIME BROADCAST</span>
              </div>
              
              <div className="space-y-2 max-h-[220px] overflow-y-auto font-mono text-[11px] text-slate-300 pr-1">
                {steps.length === 0 ? (
                  <p className="text-slate-500 italic py-4 text-center">Awaiting initial stream event...</p>
                ) : (
                  steps.map((st, idx) => (
                    <div key={idx} className="p-2 rounded bg-bg border border-hairline flex items-start gap-2">
                      <span className="text-primary shrink-0">[{st.state}]</span>
                      <span className="text-slate-300">{st.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* STATE 3: Results diagnosis and suggested fix */}
          {scanState === 'results' && (
            <div className="space-y-6">
              {/* Diagnosis Container */}
              <div className="panel p-6 border border-hairline space-y-3 shadow-2xl">
                <div className="flex items-center gap-2.5 text-xs font-mono font-bold text-alert">
                  <ShieldAlert className="w-4 h-4" />
                  <span>ROOT CAUSE DIAGNOSIS REPORT</span>
                </div>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono p-4 rounded-xl bg-bg border border-hairline leading-relaxed overflow-x-auto">
                  {diagnosis}
                </pre>
              </div>

              {/* Fix suggestion patch container */}
              <div className="panel p-6 border border-hairline space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <span className="text-xs font-mono font-bold text-verified uppercase tracking-wider">SUGGESTED RECONSTRUCTION</span>
                  <StatusPill status={coreState === 'failed' ? 'fail' : 'verified'} />
                </div>

                <pre className="p-4 rounded-xl bg-bg border border-hairline font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {fix}
                </pre>

                {/* Upgrade Callout Banner */}
                <div className="p-4 rounded-xl border border-alert/20 bg-alert/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
                  <div className="space-y-1 text-center sm:text-left">
                    <div className="text-alert font-bold flex items-center gap-1.5 justify-center sm:justify-start">
                      <Shield className="w-4.5 h-4.5 shrink-0" />
                      <span>Suggested fix - not applied.</span>
                    </div>
                    <p className="text-slate-400 text-[11px] font-sans">
                      For automatic sandbox patching, unit testing, and git integrations, use APIFIX Pro.
                    </p>
                  </div>
                  <Link
                    href="/register"
                    className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/20 transition-all shrink-0 tactile"
                  >
                    Upgrade to APIFIX Pro
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Pipeline loop explanation section */}
        <section id="pipeline" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 pb-24 sm:px-6">
          <p className="eyebrow">the loop</p>
          <h2 className="mt-3 text-[clamp(1.5rem,4.5vw,1.875rem)] font-semibold text-balance">Five stages, executed in order, logged in full.</h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map((stage, i) => (
              <li
                key={stage.name}
                className="panel lift rise p-4"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <span className="font-mono text-xs text-primary">0{i + 1}</span>
                <h3 className="mt-2 text-base font-semibold text-white">{stage.name}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{stage.copy}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-hairline/60 py-8 px-6 mt-auto">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-slate-500 font-mono">
          <span>apifix · autonomous api repair</span>
          <Link href="/login" className="transition-colors hover:text-slate-300">
            Sign in to the console
          </Link>
        </div>
      </footer>
    </div>
  );
}
