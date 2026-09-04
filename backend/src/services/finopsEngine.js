/**
 * APIFIX AI — Advanced FinOps & AI Cost Intelligence Engine (Phase 22)
 * 
 * Multi-dimensional cost attribution across Orgs, Workspaces, Projects, Runs,
 * AI Providers (Groq, Anthropic, OpenAI), compute, probes, webhooks, and storage.
 * Implements unit economics (cost per verified repair), provider comparisons,
 * burn rate forecasting, and statistical cost anomaly detection.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const observabilityEngine = require('./observabilityEngine');

const DATA_DIR = path.resolve(__dirname, '../../data');
const FINOPS_LEDGER_FILE = path.join(DATA_DIR, 'finops_ledger.json');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readJson(file, def = []) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return def;
}

function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

// AI Provider Unit Pricing per 1k tokens (Estimated/Standard 2026 rates)
const AI_PRICING_CATALOG = {
  groq: {
    'llama-3.3-70b-versatile': { promptCostPer1k: 0.00059, completionCostPer1k: 0.00079 },
    'mixtral-8x7b-32768': { promptCostPer1k: 0.00027, completionCostPer1k: 0.00027 },
    'default': { promptCostPer1k: 0.0005, completionCostPer1k: 0.0008 }
  },
  anthropic: {
    'claude-3-7-sonnet-20250219': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
    'claude-3-5-haiku-20241022': { promptCostPer1k: 0.0008, completionCostPer1k: 0.004 },
    'default': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 }
  },
  openai: {
    'gpt-4o': { promptCostPer1k: 0.0025, completionCostPer1k: 0.010 },
    'gpt-4o-mini': { promptCostPer1k: 0.00015, completionCostPer1k: 0.0006 },
    'default': { promptCostPer1k: 0.0025, completionCostPer1k: 0.010 }
  }
};

class FinopsEngine {
  constructor() {
    this.inMemoryEntries = [];
    this.maxInMemory = 5000;
  }

  /**
   * Records a granular cost transaction.
   */
  async recordCostTransaction({
    orgId = 'org_enterprise_primary',
    workspaceId = 'ws_default',
    projectId = null,
    runId = null,
    category = 'AI', // 'AI', 'SYNTHETIC_PROBE', 'WEBHOOK', 'SANDBOX', 'STORAGE', 'WORKER', 'API_CALL'
    provider = null,  // 'groq', 'anthropic', 'openai'
    model = null,
    tokens = { prompt: 0, completion: 0, total: 0 },
    durationMs = 0,
    amount = null,
    isVerifiedRepair = false,
    metadata = {}
  }) {
    let computedAmount = amount;

    if (computedAmount === null || computedAmount === undefined) {
      if (category === 'AI' && provider) {
        const provRates = AI_PRICING_CATALOG[provider.toLowerCase()] || AI_PRICING_CATALOG.groq;
        const modelRates = provRates[model] || provRates.default;
        const pCost = ((tokens.prompt || 0) / 1000) * modelRates.promptCostPer1k;
        const cCost = ((tokens.completion || 0) / 1000) * modelRates.completionCostPer1k;
        computedAmount = Number((pCost + cCost).toFixed(6));
      } else if (category === 'SANDBOX') {
        computedAmount = 0.05;
      } else if (category === 'SYNTHETIC_PROBE') {
        computedAmount = 0.001;
      } else if (category === 'WEBHOOK') {
        computedAmount = 0.0001;
      } else if (category === 'STORAGE') {
        computedAmount = 0.00005;
      } else {
        computedAmount = 0.01;
      }
    }

    const transaction = {
      id: `fin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orgId,
      workspaceId,
      projectId,
      runId,
      category,
      provider: provider ? provider.toLowerCase() : null,
      model,
      tokens,
      durationMs,
      amount: Number(computedAmount.toFixed(6)),
      isVerifiedRepair,
      metadata,
      timestamp: new Date().toISOString()
    };

    this.inMemoryEntries.unshift(transaction);
    if (this.inMemoryEntries.length > this.maxInMemory) this.inMemoryEntries.pop();

    const diskLedger = readJson(FINOPS_LEDGER_FILE, []);
    diskLedger.unshift(transaction);
    if (diskLedger.length > 5000) diskLedger.pop();
    writeJson(FINOPS_LEDGER_FILE, diskLedger);

    return transaction;
  }

  /**
   * Computes complete FinOps summary and operational unit economics.
   */
  getFinopsMetrics({ orgId, workspaceId, projectId } = {}) {
    const diskLedger = readJson(FINOPS_LEDGER_FILE, []);
    let entries = diskLedger.length > 0 ? diskLedger : this.inMemoryEntries;

    if (orgId) entries = entries.filter(e => e.orgId === orgId);
    if (workspaceId) entries = entries.filter(e => e.workspaceId === workspaceId);
    if (projectId) entries = entries.filter(e => e.projectId === projectId);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStr = now.toISOString().slice(0, 7);

    let dailySpend = 0;
    let weeklySpend = 0;
    let monthlySpend = 0;

    let totalRepairAiCost = 0;
    let repairCount = 0;
    let verifiedRepairCount = 0;
    let successfulRepairCount = 0;

    const providerMetrics = {
      groq: { spend: 0, requests: 0, tokens: 0, totalLatencyMs: 0, verifiedRepairs: 0 },
      anthropic: { spend: 0, requests: 0, tokens: 0, totalLatencyMs: 0, verifiedRepairs: 0 },
      openai: { spend: 0, requests: 0, tokens: 0, totalLatencyMs: 0, verifiedRepairs: 0 }
    };

    const spendByCategory = {};
    const spendByWorkspace = {};
    const spendByProject = {};
    const dailySpendSeries = {};

    entries.forEach(e => {
      const amt = e.amount || 0;
      const cat = e.category || 'OTHER';
      const ws = e.workspaceId || 'default';
      const prj = e.projectId || 'unassigned';
      const day = e.timestamp.split('T')[0];

      spendByCategory[cat] = (spendByCategory[cat] || 0) + amt;
      spendByWorkspace[ws] = (spendByWorkspace[ws] || 0) + amt;
      spendByProject[prj] = (spendByProject[prj] || 0) + amt;
      dailySpendSeries[day] = (dailySpendSeries[day] || 0) + amt;

      if (e.timestamp.startsWith(todayStr)) dailySpend += amt;
      if (new Date(e.timestamp) >= weekAgo) weeklySpend += amt;
      if (e.timestamp.startsWith(monthStr)) monthlySpend += amt;

      if (cat === 'AI' || cat === 'SANDBOX' || cat === 'REPAIR_RUN') {
        totalRepairAiCost += amt;
        repairCount++;
        if (e.isVerifiedRepair || e.metadata?.verified) verifiedRepairCount++;
        if (e.metadata?.status === 'SUCCESS' || e.metadata?.success) successfulRepairCount++;
      }

      if (e.provider && providerMetrics[e.provider]) {
        const pm = providerMetrics[e.provider];
        pm.spend += amt;
        pm.requests += 1;
        pm.tokens += (e.tokens?.total || (e.tokens?.prompt || 0) + (e.tokens?.completion || 0));
        pm.totalLatencyMs += (e.durationMs || 0);
        if (e.isVerifiedRepair || e.metadata?.verified) pm.verifiedRepairs += 1;
      }
    });

    // Provider Comparison Calculation
    const providerComparison = Object.keys(providerMetrics).map(k => {
      const pm = providerMetrics[k];
      const avgLatencyMs = pm.requests > 0 ? Math.round(pm.totalLatencyMs / pm.requests) : 0;
      const costPer1kTokens = pm.tokens > 0 ? Number(((pm.spend / pm.tokens) * 1000).toFixed(4)) : 0;
      const costPerVerifiedRepair = pm.verifiedRepairs > 0 ? Number((pm.spend / pm.verifiedRepairs).toFixed(4)) : Number(pm.spend.toFixed(4));
      return {
        provider: k,
        spend: Number(pm.spend.toFixed(4)),
        requests: pm.requests,
        tokens: pm.tokens,
        avgLatencyMs,
        costPer1kTokens,
        costPerVerifiedRepair
      };
    });

    // Unit Economics: Cost per repair, cost per verified repair
    const costPerRepair = repairCount > 0 ? Number((totalRepairAiCost / repairCount).toFixed(4)) : 0.05;
    const costPerVerifiedRepair = verifiedRepairCount > 0
      ? Number((totalRepairAiCost / verifiedRepairCount).toFixed(4))
      : Number((totalRepairAiCost / Math.max(1, repairCount)).toFixed(4));
    const costPerSuccessfulRepair = successfulRepairCount > 0
      ? Number((totalRepairAiCost / successfulRepairCount).toFixed(4))
      : costPerRepair;

    // Burn rate and projections
    const dayOfMonth = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const burnRatePerDay = Number((monthlySpend / dayOfMonth).toFixed(4));
    const burnRatePerHour = Number((burnRatePerDay / 24).toFixed(4));
    const projectedMonthlySpend = Number((burnRatePerDay * daysInMonth).toFixed(2));

    // Cost Anomaly Detection
    const dailyValues = Object.values(dailySpendSeries);
    const avgDaily = dailyValues.length > 0 ? dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length : 0;
    const variance = dailyValues.length > 0 ? dailyValues.reduce((acc, val) => acc + Math.pow(val - avgDaily, 2), 0) / dailyValues.length : 0;
    const stdDev = Math.sqrt(variance);
    const isAnomaly = dailySpend > (avgDaily + 2.5 * stdDev) && dailySpend > 5.0;

    return {
      dailySpend: Number(dailySpend.toFixed(4)),
      weeklySpend: Number(weeklySpend.toFixed(4)),
      monthlySpend: Number(monthlySpend.toFixed(4)),
      projectedMonthlySpend,
      burnRate: {
        perHour: burnRatePerHour,
        perDay: burnRatePerDay
      },
      unitEconomics: {
        costPerRepair,
        costPerVerifiedRepair,
        costPerSuccessfulRepair,
        totalRepairs: repairCount,
        verifiedRepairs: verifiedRepairCount,
        successfulRepairs: successfulRepairCount
      },
      providerComparison,
      spendByCategory,
      spendByWorkspace,
      spendByProject,
      anomalyDetection: {
        hasAnomaly: isAnomaly,
        currentDailySpend: Number(dailySpend.toFixed(4)),
        baselineAverage: Number(avgDaily.toFixed(4)),
        stdDevThreshold: Number((avgDaily + 2.5 * stdDev).toFixed(4)),
        severity: isAnomaly ? 'HIGH' : 'NORMAL'
      },
      timestamp: new Date().toISOString()
    };
  }

  recordSpend(workspaceId, amount, category = 'API_CALL') {
    this.recordCostTransaction({
      workspaceId,
      amount: Number(amount),
      category
    });
  }

  getSpend(workspaceId) {
    let sum = 0;
    for (const entry of this.inMemoryEntries) {
      if (entry.workspaceId === workspaceId) {
        sum += entry.amount || 0;
      }
    }
    return Number(sum.toFixed(4));
  }
}

const finopsEngine = new FinopsEngine();

module.exports = {
  finopsEngine,
  AI_PRICING_CATALOG
};
