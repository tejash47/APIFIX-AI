'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CommandCenterHeader from '../components/CommandCenterHeader';
import SettingsModal from '../components/SettingsModal';
import CustomerOnboardingModal from '../components/CustomerOnboardingModal';
import CustomerSupportModal from '../components/CustomerSupportModal';
import {
  Search,
  Terminal,
  ArrowRight,
  ShieldAlert,
  Cpu,
  Box,
  Code,
  Settings,
  History,
  Sparkles,
  Zap,
  CheckCircle2,
  Server,
  Activity,
  GitBranch,
  ShieldCheck,
  Lock,
  Layers,
  Check,
  AlertTriangle,
  FileCode,
  HelpCircle,
  Play,
  RotateCcw,
  LifeBuoy
} from 'lucide-react';

export default function RootLandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const router = useRouter();

  const pricingTiers = [
    {
      name: 'Free',
      badge: 'Community',
      price: '$0',
      period: '/month',
      desc: 'Essential API monitoring and interactive diagnostics for individual developers.',
      features: [
        'Up to 100 API health checks/day',
        '3 Autonomous repair cycles/month',
        'Ephemeral dynamic port testing',
        'Public documentation access',
        'Standard rate limiting (100 req/min)'
      ],
      cta: 'Start Free',
      highlighted: false
    },
    {
      name: 'Pro',
      badge: 'Most Popular',
      price: '$49',
      period: '/month',
      desc: 'Complete autonomous self-repair and regression testing for growing API services.',
      features: [
        'Unlimited API monitoring probes',
        '50 Autonomous repair cycles/month',
        'Multi-provider AI fallback cascade',
        'GitHub Pull Request automation',
        'FinOps cost tracking & alerts'
      ],
      cta: 'Start Pro Trial',
      highlighted: true
    },
    {
      name: 'Team',
      badge: 'Collaboration',
      price: '$199',
      period: '/month',
      desc: 'Enterprise governance, multi-reviewer approvals, and team workspace isolation.',
      features: [
        '250 Autonomous repair cycles/month',
        'Multi-reviewer human approval gates',
        'Immutable SHA-256 Merkle audit ledger',
        'Team RBAC & workspace isolation',
        'Custom webhook alert integration'
      ],
      cta: 'Upgrade to Team',
      highlighted: false
    },
    {
      name: 'Enterprise',
      badge: 'Dedicated',
      price: 'Custom',
      period: '',
      desc: 'Dedicated infrastructure, custom SLAs, SAML/SCIM SSO, and 24/7 SRE support.',
      features: [
        'Unlimited autonomous repairs',
        'SAML 2.0 / OIDC SSO & SCIM directory',
        'Canary rollouts & instant rollback',
        'Dedicated distributed worker pool',
        '99.99% SLA & 15-min emergency response'
      ],
      cta: 'Contact Sales',
      highlighted: false
    }
  ];

  const faqs = [
    {
      q: 'How does APIFIX AI ensure generated patches do not introduce regressions?',
      a: 'Before any code is approved, APIFIX boots an ephemeral sandbox on an unassigned dynamic TCP port, applies the AST-validated patch in an isolated temporary directory, and runs probe requests plus regression test suites. The original workspace files remain strictly immutable until full verification succeeds.'
    },
    {
      q: 'Does APIFIX store our private API keys or source code credentials?',
      a: 'No. APIFIX enforces zero-secret retention. All inbound payloads, log sinks, telemetry buffers, and AI prompt contexts are scrubbed through a multi-pass regex sanitizer that redacts credentials, tokens, and private keys.'
    },
    {
      q: 'How does the AI Multi-Provider Fallback Cascade work?',
      a: 'APIFIX routes investigation requests to primary high-speed inference (Groq Llama 3.3 70B). If rate limits, latency spikes, or timeouts occur, the circuit breaker automatically falls back to secondary (Claude 3.5 Sonnet) or tertiary (GPT-4o) providers with zero context loss.'
    },
    {
      q: 'Can human engineers review patches before production deployment?',
      a: 'Yes. Enterprise Governance policies allow you to enforce human-in-the-loop approval gates. When an approval is required, patches remain in AWAITING_APPROVAL state with an interactive Monaco diff viewer before any branch or PR is created.'
    }
  ];

  return (
    <div className="min-h-screen bg-bg text-slate-100 flex flex-col font-sans relative overflow-x-hidden">
      {/* Background Grid & Glows */}
      <div className="pointer-events-none absolute inset-0 grid-field opacity-60" aria-hidden />
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/10 blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute top-[600px] right-0 w-[500px] h-[300px] bg-emerald-600/10 blur-[120px] rounded-full" />

      {/* Shared Navigation Header */}
      <CommandCenterHeader searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      <main className="flex-grow flex flex-col items-center w-full z-10 px-4 sm:px-6 py-8 space-y-24 max-w-7xl mx-auto">
        
        {/* ============================================================ */}
        {/* SECTION 1: HERO SECTION */}
        {/* ============================================================ */}
        <section className="text-center space-y-6 max-w-4xl pt-8 pb-4 animate-in fade-in duration-500">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-mono uppercase tracking-wider shadow-sm">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>Autonomous API Reliability &amp; Self-Repair Platform</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
            Detect, Diagnose &amp; <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent">Self-Heal API Failures</span> in Real-Time
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Eliminate on-call alert fatigue. APIFIX autonomously discovers REST endpoints, investigates runtime crash stack traces, generates AST-verified code patches, and validates fixes in ephemeral sandboxes.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              href="/register"
              className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-sm font-bold shadow-xl shadow-indigo-600/30 flex items-center gap-2 hover:scale-[1.02] transition-all"
            >
              <span>Start Free</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/dashboard?demo=true"
              className="px-6 py-3.5 rounded-xl border border-panelBorder bg-panel/80 hover:bg-panelBorder/50 text-white font-mono text-sm font-bold flex items-center gap-2 hover:scale-[1.02] transition-all"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span>View Interactive Demo</span>
            </Link>

            <button
              onClick={() => setShowOnboardingModal(true)}
              className="px-4 py-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold transition-all"
            >
              Quickstart Guide
            </button>
          </div>

          {/* Metric Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 max-w-3xl mx-auto text-left font-mono">
            <div className="p-4 rounded-xl border border-panelBorder bg-panel/60">
              <span className="text-gray-400 text-xs block">p95 Latency</span>
              <span className="text-xl font-extrabold text-emerald-400">&lt; 15 ms</span>
            </div>
            <div className="p-4 rounded-xl border border-panelBorder bg-panel/60">
              <span className="text-gray-400 text-xs block">AI Fallback Cascade</span>
              <span className="text-xl font-extrabold text-indigo-400">3 Tiers</span>
            </div>
            <div className="p-4 rounded-xl border border-panelBorder bg-panel/60">
              <span className="text-gray-400 text-xs block">Audit Hash Chain</span>
              <span className="text-xl font-extrabold text-amber-400">SHA-256</span>
            </div>
            <div className="p-4 rounded-xl border border-panelBorder bg-panel/60">
              <span className="text-gray-400 text-xs block">Tenant Isolation</span>
              <span className="text-xl font-extrabold text-purple-400">100% RLS</span>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 2: THE PROBLEM VS APIFIX */}
        {/* ============================================================ */}
        <section className="w-full space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Why Traditional Incident Management Fails
            </h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Manual on-call triage creates multi-hour MTTR, human error, and sleepless engineering teams.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Traditional */}
            <div className="p-6 rounded-2xl border border-red-500/20 bg-red-950/10 space-y-4">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Traditional On-Call Triage</span>
              </div>
              <ul className="space-y-2.5 text-xs text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">✕</span>
                  <span>Engineers woken up at 3 AM for preventable runtime null errors.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">✕</span>
                  <span>Average MTTR of 45–180 minutes while debugging stack traces manually.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">✕</span>
                  <span>Hotfixes deployed directly to production without isolated sandbox verification.</span>
                </li>
              </ul>
            </div>

            {/* APIFIX */}
            <div className="p-6 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 space-y-4">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>APIFIX Autonomous Self-Repair</span>
              </div>
              <ul className="space-y-2.5 text-xs text-gray-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Immediate incident capture with automated Babel AST root cause diagnosis.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Sub-minute autonomous repair cycle with dynamic port probe validation.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Multi-reviewer governance gates with immutable SHA-256 Merkle audit logs.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 3 & 4: 10-STAGE AUTONOMOUS REPAIR WORKFLOW */}
        {/* ============================================================ */}
        <section className="w-full space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-indigo-400 font-bold">
              <Layers className="w-3.5 h-3.5" />
              <span>THE AUTONOMOUS LIFECYCLE</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              From Ingestion to Canary Deployment
            </h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Every stage is executed with deterministic state transitions, security boundary guards, and evidence logging.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-5xl mx-auto font-mono text-[11px]">
            {[
              { step: '01', title: 'DISCOVER', desc: 'Static AST & TCP Probe' },
              { step: '02', title: 'DETECT', desc: 'Runtime 500 Captured' },
              { step: '03', title: 'INVESTIGATE', desc: 'Multi-AI Root Cause' },
              { step: '04', title: 'AST PATCH', desc: 'Syntax-Safe Code Diff' },
              { step: '05', title: 'GOVERN', desc: 'Policy & Risk Scoring' },
              { step: '06', title: 'APPROVE', desc: 'Human-in-the-Loop Gate' },
              { step: '07', title: 'SANDBOX', desc: 'Ephemeral Port Probe' },
              { step: '08', title: 'VERIFY', desc: 'Regression Suite Pass' },
              { step: '09', title: 'DEPLOY', desc: 'Git PR & Canary Rollout' },
              { step: '10', title: 'AUDIT', desc: 'SHA-256 Merkle Ledger' }
            ].map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-xl border border-panelBorder bg-panel/70 hover:border-indigo-500/50 transition-all space-y-1">
                <span className="text-indigo-400 font-bold text-[10px]">{item.step}</span>
                <h4 className="text-white font-bold">{item.title}</h4>
                <p className="text-gray-400 text-[10px] leading-tight">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 5, 6, 7 & 8: ENTERPRISE PILLARS (SECURITY, GOV, FINOPS) */}
        {/* ============================================================ */}
        <section className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {/* Security */}
          <div className="p-6 rounded-2xl border border-panelBorder bg-panel/60 space-y-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 w-fit">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Zero-Secret Redaction</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              Regex scrubbing removes bearer tokens, Stripe keys, and passwords before any payload enters AI prompts or logs.
            </p>
          </div>

          {/* Governance */}
          <div className="p-6 rounded-2xl border border-panelBorder bg-panel/60 space-y-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 w-fit">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">Multi-Reviewer Approvals</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              Configurable policies enforce developer/admin approval workflows for high-risk routes and production deployments.
            </p>
          </div>

          {/* FinOps */}
          <div className="p-6 rounded-2xl border border-panelBorder bg-panel/60 space-y-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 w-fit">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white">FinOps Cost Transparency</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              Sub-cent cost attribution per repair attempt, budget threshold alerts (80%, 90%, 100%), and credit caps.
            </p>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 9: TRANSPARENT 4-TIER PRICING */}
        {/* ============================================================ */}
        <section className="w-full space-y-8" id="pricing">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 font-bold">
              <Zap className="w-3.5 h-3.5" />
              <span>TRANSPARENT PRICING</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Scale Reliability as Your API Grows
            </h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Predictable credit-based billing with zero surprise overages.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {pricingTiers.map((tier, idx) => (
              <div
                key={idx}
                className={`p-6 rounded-2xl border flex flex-col justify-between space-y-6 transition-all ${
                  tier.highlighted
                    ? 'border-indigo-500 bg-panel shadow-xl shadow-indigo-500/10 scale-105'
                    : 'border-panelBorder bg-panel/60 hover:border-panelBorder/80'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-white">{tier.name}</h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-panelBorder text-gray-300">
                      {tier.badge}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white font-mono">{tier.price}</span>
                    <span className="text-xs text-gray-400">{tier.period}</span>
                  </div>

                  <p className="text-xs text-gray-400 min-h-[36px]">{tier.desc}</p>

                  <ul className="space-y-2 pt-2 border-t border-panelBorder/60 text-xs text-gray-300">
                    {tier.features.map((f, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/register"
                  className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold text-center transition-all ${
                    tier.highlighted
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-panelBorder hover:bg-panelBorder/80 text-white'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 10: FREQUENTLY ASKED QUESTIONS */}
        {/* ============================================================ */}
        <section className="w-full space-y-8 max-w-3xl mx-auto">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center justify-center gap-2">
              <HelpCircle className="w-6 h-6 text-indigo-400" />
              <span>Frequently Asked Questions</span>
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="p-5 rounded-xl border border-panelBorder bg-panel/60 space-y-2">
                <h4 className="text-sm font-bold text-white">{faq.q}</h4>
                <p className="text-xs text-gray-300 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 11: FINAL CONVERSION CTA */}
        {/* ============================================================ */}
        <section className="w-full max-w-4xl mx-auto p-8 sm:p-12 rounded-3xl border border-indigo-500/40 bg-gradient-to-br from-indigo-950/40 via-panel to-panel text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Ready to Automate Your API Reliability?
            </h2>
            <p className="text-sm text-gray-300 max-w-xl mx-auto">
              Join engineering teams deploying autonomous self-healing API architectures with zero on-call fatigue.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link
              href="/register"
              className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-sm font-bold shadow-xl shadow-indigo-600/30 flex items-center gap-2 hover:scale-[1.02] transition-all"
            >
              <span>Start Free Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/dashboard?demo=true"
              className="px-8 py-3.5 rounded-xl border border-panelBorder bg-panel hover:bg-panelBorder text-white font-mono text-sm font-bold flex items-center gap-2 transition-all"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span>Launch Demo</span>
            </Link>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-panelBorder bg-bg/80 py-8 px-6 text-xs text-gray-400 mt-12 z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-mono">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-white font-bold">APIFIX AI</span>
            <span>&copy; 2026 APIFIX AI, Inc. Enterprise Launch Certified.</span>
          </div>

          <div className="flex items-center gap-6 font-mono text-[11px]">
            <button onClick={() => setShowSupportModal(true)} className="hover:text-white transition-all">
              Support &amp; Help
            </button>
            <Link href="/developer" className="hover:text-white transition-all">
              API Docs
            </Link>
            <Link href="/operations" className="hover:text-white transition-all">
              System Status
            </Link>
            <button onClick={() => setShowSettingsModal(true)} className="hover:text-white transition-all">
              Settings
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />
      <CustomerOnboardingModal isOpen={showOnboardingModal} onClose={() => setShowOnboardingModal(false)} />
      <CustomerSupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
    </div>
  );
}
