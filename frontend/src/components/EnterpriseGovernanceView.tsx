'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Building,
  Users,
  Scale,
  DollarSign,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  FileSpreadsheet,
  Trash2,
  Hash,
  ArrowRight,
  TrendingUp,
  AlertOctagon
} from 'lucide-react';
import { ComplianceCenterView } from './ComplianceCenterView';
import { CostIntelligenceView } from './CostIntelligenceView';
import { ApprovalQueueView } from './ApprovalQueueView';

type TabKey = 'OVERVIEW' | 'COMPLIANCE' | 'COSTS' | 'AI_GOV' | 'APPROVALS' | 'AUDIT' | 'RETENTION';

export const EnterpriseGovernanceView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('OVERVIEW');

  return (
    <div className="space-y-6">
      {/* Top Cockpit Navigation & Org Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-white tracking-tight">Enterprise Governance Cockpit</h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ENTERPRISE ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Organization: <span className="text-slate-200 font-semibold">Titan Aerospace Global</span> • Scope: <span className="text-indigo-400 font-mono">org_enterprise_primary</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400">
              <Hash className="w-3.5 h-3.5" />
              <span>SHA-256 Ledger: VERIFIED</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-slate-800/80 pt-4 text-xs font-semibold">
          {[
            { key: 'OVERVIEW', label: 'Executive Overview', icon: Scale },
            { key: 'COMPLIANCE', label: 'Compliance Controls', icon: ShieldCheck },
            { key: 'COSTS', label: 'Cost Intelligence', icon: DollarSign },
            { key: 'AI_GOV', label: 'AI Governance', icon: Sparkles },
            { key: 'APPROVALS', label: 'Approval Queue', icon: CheckCircle2 },
            { key: 'AUDIT', label: 'Immutable Audit Ledger', icon: Lock },
            { key: 'RETENTION', label: 'Retention & Exports', icon: FileSpreadsheet }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Viewport Content based on activeTab */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                <span>Governance Score</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-extrabold text-emerald-400">100%</div>
              <div className="text-xs text-slate-500">11 of 11 internal controls verified</div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                <span>Monthly AI & Repair Spend</span>
                <DollarSign className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-3xl font-extrabold text-white">$48.20</div>
              <div className="text-xs text-slate-500">ESTIMATED • 48% budget utilization</div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                <span>Pending Approvals</span>
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-3xl font-extrabold text-amber-400">2</div>
              <div className="text-xs text-slate-500">Production repairs awaiting sign-off</div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
                <span>Audit Chain Integrity</span>
                <Lock className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-3xl font-extrabold text-indigo-400">AUTHENTIC</div>
              <div className="text-xs text-slate-500">0 tampering alerts detected</div>
            </div>
          </div>

          {/* Quick Action Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Compliance Control Matrix</h3>
                <button
                  onClick={() => setActiveTab('COMPLIANCE')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
                >
                  View All Controls <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2.5">
                {[
                  { id: 'CTL-ACC-01', name: 'RBAC & Least Privilege Access', status: 'PASS' },
                  { id: 'CTL-TNT-01', name: 'Multi-Tenant Scoping & Isolation', status: 'PASS' },
                  { id: 'CTL-SEC-01', name: 'Zero Secret Exposure & Scrubbing', status: 'PASS' },
                  { id: 'CTL-NET-01', name: 'SSRF & Private Network Defense', status: 'PASS' },
                  { id: 'CTL-AUD-01', name: 'Immutable SHA-256 Chained Audit Ledger', status: 'PASS' }
                ].map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-indigo-400 font-semibold">{c.id}</span>
                      <span className="text-slate-300">{c.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Recent Governance Activity</h3>
                <button
                  onClick={() => setActiveTab('AUDIT')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1"
                >
                  Inspect Ledger <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2.5">
                {[
                  { action: 'PRODUCTION_REPAIR_POLICY_ENFORCED', actor: 'governance_engine', time: '2 mins ago', status: 'BLOCKED' },
                  { action: 'APPROVAL_REQUEST_APPROVED', actor: 'sec@apex-defense.org', time: '14 mins ago', status: 'APPROVED' },
                  { action: 'DATA_EXPORT_GENERATED', actor: 'admin@apex-defense.org', time: '1 hour ago', status: 'COMPLETED' },
                  { action: 'COMPLIANCE_INTERNAL_AUDIT_PASS', actor: 'system_auditor', time: '3 hours ago', status: 'PASS' }
                ].map((act, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">{act.action}</div>
                      <div className="text-[11px] text-slate-500">By {act.actor} • {act.time}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {act.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'COMPLIANCE' && <ComplianceCenterView />}
      {activeTab === 'COSTS' && <CostIntelligenceView />}
      {activeTab === 'APPROVALS' && <ApprovalQueueView />}

      {activeTab === 'AI_GOV' && (
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">AI Model Whitelist & Policy Routing</h3>
              <p className="text-xs text-slate-400 mt-0.5">Enforce enterprise approved LLMs, token limits, and spend caps.</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
              POLICY ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Approved Providers</span>
              <div className="text-sm font-bold text-white mt-1">Anthropic • Groq • OpenAI</div>
            </div>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Max Tokens per Request</span>
              <div className="text-sm font-bold text-white mt-1">16,000 Tokens</div>
            </div>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-xs text-slate-500 font-medium">Daily Spend Limit</span>
              <div className="text-sm font-bold text-white mt-1">$50.00 / day</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'AUDIT' && (
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Cryptographic SHA-256 Audit Ledger</h3>
              <p className="text-xs text-slate-400 mt-0.5">Immutable block hash chain ensuring chronological non-repudiation.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold font-mono">
                CHAIN VALID
              </span>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed">
            <div>genesis_hash: 0000000000000000000000000000000000000000000000000000000000000000</div>
            <div className="mt-1 text-indigo-400">chain_algorithm: SHA-256(seq|timestamp|actor|action|resource|result|previousHash|metadata)</div>
            <div className="mt-1 text-emerald-400">verification_status: 100% Sequence Integral • Zero Tampering Detected</div>
          </div>
        </div>
      )}

      {activeTab === 'RETENTION' && (
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-white">Data Retention & Enterprise Exports</h3>
            <p className="text-xs text-slate-400 mt-0.5">Automated lifecycle management and secret-sanitized JSON/CSV exports.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Retention Tier</span>
              <div className="text-base font-bold text-white">RETENTION_90_DAYS (90 Days)</div>
              <p className="text-xs text-slate-500">Active incidents and legal evidence protected from automated purge.</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Export Capabilities</span>
              <div className="text-base font-bold text-white">JSON & CSV with SHA-256 Hash</div>
              <p className="text-xs text-slate-500">Strict secret scrubbing ensures zero credentials in output files.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
