'use client';

import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Zap,
  CheckCircle,
  HardDrive,
  GitPullRequest,
  Activity,
  Layers,
  Calendar,
  Sparkles
} from 'lucide-react';

interface CostMetrics {
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  forecastedMonthlySpend: number;
  costPerRepair: number;
  costPerVerifiedRepair: number;
  costBreakdown: {
    ai: number;
    repairs: number;
    probes: number;
    webhooks: number;
    storage: number;
    github: number;
  };
  budgetUtilization: {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL_WARNING' | 'EXCEEDED';
    utilizationPct: number;
    currentMonthSpend: number;
    monthlyLimit: number;
  };
  estimateLabel: string;
}

interface CostIntelligenceViewProps {
  metrics?: CostMetrics;
  onRefresh?: () => void;
}

const DEFAULT_METRICS: CostMetrics = {
  dailyCost: 1.42,
  weeklyCost: 11.85,
  monthlyCost: 48.20,
  forecastedMonthlySpend: 82.50,
  costPerRepair: 0.05,
  costPerVerifiedRepair: 0.06,
  costBreakdown: {
    ai: 32.40,
    repairs: 8.50,
    probes: 2.10,
    webhooks: 1.20,
    storage: 0.80,
    github: 3.20
  },
  budgetUtilization: {
    status: 'HEALTHY',
    utilizationPct: 48,
    currentMonthSpend: 48.20,
    monthlyLimit: 100.00
  },
  estimateLabel: 'ESTIMATED'
};

export const CostIntelligenceView: React.FC<CostIntelligenceViewProps> = ({
  metrics = DEFAULT_METRICS,
  onRefresh
}) => {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXCEEDED':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'CRITICAL_WARNING':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'WARNING':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      default:
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Enterprise Cost Intelligence</h2>
            <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {metrics.estimateLabel}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real-time financial telemetry across AI models, sandbox executions, canary probes, and storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs">
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-3 py-1.5 rounded-md font-medium capitalize transition-all ${
                  timeframe === t
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Spend ({timeframe})</span>
            <DollarSign className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            ${timeframe === 'daily' ? metrics.dailyCost.toFixed(2) : timeframe === 'weekly' ? metrics.weeklyCost.toFixed(2) : metrics.monthlyCost.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span className="text-emerald-400 font-medium">99.4%</span> compute efficiency
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Monthly Forecast</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            ${metrics.forecastedMonthlySpend.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Budget limit: ${metrics.budgetUtilization.monthlyLimit.toFixed(2)}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Cost per Repair</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            ${metrics.costPerRepair.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Verified: ${metrics.costPerVerifiedRepair.toFixed(2)} / pass
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Budget Status</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${getStatusColor(metrics.budgetUtilization.status)}`}>
              {metrics.budgetUtilization.status}
            </span>
            <span className="text-sm font-medium text-slate-300">
              {metrics.budgetUtilization.utilizationPct}%
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Hard cap throttles non-critical runs
          </div>
        </div>
      </div>

      {/* Budget Utilization Progress Bar */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="font-semibold text-white">Monthly Budget Consumption</div>
          <div className="text-slate-400 font-mono text-xs">
            ${metrics.budgetUtilization.currentMonthSpend.toFixed(2)} / ${metrics.budgetUtilization.monthlyLimit.toFixed(2)}
          </div>
        </div>

        <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-500 ${
              metrics.budgetUtilization.utilizationPct >= 100
                ? 'bg-rose-500'
                : metrics.budgetUtilization.utilizationPct >= 80
                ? 'bg-amber-500'
                : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min(100, metrics.budgetUtilization.utilizationPct)}%` }}
          />
          {/* Threshold markers */}
          <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-yellow-400/60" title="80% Warning Threshold" />
          <div className="absolute top-0 bottom-0 left-[90%] w-0.5 bg-amber-500/60" title="90% Critical Warning" />
        </div>

        <div className="flex justify-between text-[11px] text-slate-500">
          <span>0%</span>
          <span className="text-yellow-400/80">80% Warning</span>
          <span className="text-amber-400/80">90% Critical</span>
          <span className="text-rose-400/80">100% Throttle</span>
        </div>
      </div>

      {/* Category Breakdown Matrix */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
        <h3 className="text-base font-semibold text-white mb-4">Operational Category Spend</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>AI LLMs</span>
            </div>
            <div className="text-lg font-bold text-white mt-1.5">
              ${metrics.costBreakdown.ai.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sandbox Runs</span>
            </div>
            <div className="text-lg font-bold text-white mt-1.5">
              ${metrics.costBreakdown.repairs.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Probes</span>
            </div>
            <div className="text-lg font-bold text-white mt-1.5">
              ${metrics.costBreakdown.probes.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Webhooks</span>
            </div>
            <div className="text-lg font-bold text-white mt-1.5">
              ${metrics.costBreakdown.webhooks.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
              <HardDrive className="w-3.5 h-3.5 text-violet-400" />
              <span>Artifacts</span>
            </div>
            <div className="text-lg font-bold text-white mt-1.5">
              ${metrics.costBreakdown.storage.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
              <GitPullRequest className="w-3.5 h-3.5 text-pink-400" />
              <span>GitHub PRs</span>
            </div>
            <div className="text-lg font-bold text-white mt-1.5">
              ${metrics.costBreakdown.github.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
