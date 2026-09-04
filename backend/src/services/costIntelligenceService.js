/**
 * APIFIX AI — Cost Intelligence & Operational Financial Engine (Phase 20)
 * Aggregates multi-dimensional operational costs (AI, Probes, Webhooks, Reps, Storage),
 * calculates budget utilization percentiles, forecasts spend, and enforces thresholds.
 */

const fs = require('fs');
const path = require('path');
const { recordAuditEvent } = require('./auditLogger');
const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const COST_LEDGER_FILE = path.join(DATA_DIR, 'cost_ledger.json');
const BUDGETS_FILE = path.join(DATA_DIR, 'budgets.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readJson(file, def = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return def;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

// Unit Cost Baseline Catalog (ESTIMATED)
const UNIT_COSTS = {
  REPAIR_RUN_SANDBOX: 0.05,        // $0.05 per verification sandbox run
  SYNTHETIC_CANARY_PROBE: 0.001,   // $0.001 per canary HTTP ping
  WEBHOOK_DELIVERY: 0.0001,        // $0.0001 per webhook dispatch
  GITHUB_PR_AUTOMATION: 0.01,      // $0.01 per branch/PR creation
  STORAGE_PER_KB_MONTH: 0.00001    // $0.00001 per KB stored per month
};

const DEFAULT_BUDGET = {
  monthlyBudget: 250.00,
  warningThresholdPct: 80,
  criticalThresholdPct: 90,
  hardLimitPct: 100,
  currency: 'USD',
  updatedAt: new Date().toISOString()
};

/**
 * Records an operational cost item into the ledger
 */
async function recordCostEvent({
  orgId = 'org_enterprise_primary',
  workspaceId = 'ws_default',
  category, // 'AI', 'REPAIR_RUN', 'SYNTHETIC_PROBE', 'WEBHOOK', 'GITHUB_AUTOMATION', 'STORAGE'
  amount,
  units = 1,
  metadata = {}
}) {
  const finalAmount = typeof amount === 'number'
    ? amount
    : ((UNIT_COSTS[category] || 0.01) * units);

  const entry = {
    id: `cst_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    orgId,
    workspaceId,
    category,
    amount: Number(finalAmount.toFixed(6)),
    units,
    metadata,
    timestamp: new Date().toISOString()
  };

  const ledger = readJson(COST_LEDGER_FILE, []);
  ledger.unshift(entry);
  if (ledger.length > 10000) ledger.pop();
  writeJson(COST_LEDGER_FILE, ledger);

  return entry;
}

/**
 * Gets budget configuration for a workspace or organization
 */
function getBudget(scopeId) {
  if (!scopeId) return null;
  const budgets = readJson(BUDGETS_FILE, []);
  const found = budgets.find(b => b.scopeId === scopeId);
  return found ? found.budget : null;
}

/**
 * Sets budget configuration
 */
async function setBudget(scopeId, budgetUpdates = {}, actor = {}) {
  const budgets = readJson(BUDGETS_FILE, []);
  const index = budgets.findIndex(b => b.scopeId === scopeId);
  const current = index !== -1 ? budgets[index].budget : { ...DEFAULT_BUDGET };

  const updated = {
    ...current,
    ...budgetUpdates,
    updatedAt: new Date().toISOString()
  };

  if (index !== -1) {
    budgets[index].budget = updated;
  } else {
    budgets.push({ scopeId, budget: updated });
  }

  writeJson(BUDGETS_FILE, budgets);

  await recordAuditEvent({
    workspaceId: scopeId.startsWith('ws_') ? scopeId : 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'BUDGET_CONFIG_UPDATED',
    resourceType: 'BUDGET',
    resourceId: scopeId,
    metadata: { budgetUpdates }
  });

  return updated;
}

/**
 * Evaluates budget status and checks if non-essential execution should be throttled
 */
function evaluateBudget({
  orgId = 'org_enterprise_primary',
  workspaceId = null,
  isSecurityCritical = false
}) {
  const budget = (workspaceId && getBudget(workspaceId)) || (orgId && getBudget(orgId)) || { ...DEFAULT_BUDGET };
  const ledger = readJson(COST_LEDGER_FILE, []);

  // Compute monthly spend (current month)
  const currentYearMonth = new Date().toISOString().slice(0, 7);
  const monthItems = ledger.filter(item => {
    if (workspaceId) return item.workspaceId === workspaceId;
    if (orgId) return item.orgId === orgId;
    return true;
  }).filter(item => item.timestamp.startsWith(currentYearMonth));

  const currentMonthSpend = monthItems.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const monthlyLimit = budget.monthlyBudget || 250;
  const utilizationPct = Math.round((currentMonthSpend / monthlyLimit) * 100);

  let status = 'HEALTHY'; // HEALTHY, WARNING, CRITICAL_WARNING, EXCEEDED
  let allowed = true;

  if (utilizationPct >= budget.hardLimitPct) {
    status = 'EXCEEDED';
    // Invariant: Never block security-critical incidents
    if (!isSecurityCritical) {
      allowed = false;
    }
    observabilityEngine.recordEvent({
      workspaceId,
      category: 'BILLING',
      event: 'budget_exceeded',
      status: 'FAILURE',
      metadata: { utilizationPct, currentMonthSpend, monthlyLimit, isSecurityCritical, allowed }
    });
  } else if (utilizationPct >= budget.criticalThresholdPct) {
    status = 'CRITICAL_WARNING';
    observabilityEngine.recordEvent({
      workspaceId,
      category: 'BILLING',
      event: 'budget_warning',
      status: 'FAILURE',
      metadata: { severity: 'CRITICAL', utilizationPct, currentMonthSpend, monthlyLimit }
    });
  } else if (utilizationPct >= budget.warningThresholdPct) {
    status = 'WARNING';
    observabilityEngine.recordEvent({
      workspaceId,
      category: 'BILLING',
      event: 'budget_warning',
      status: 'SUCCESS',
      metadata: { severity: 'WARNING', utilizationPct, currentMonthSpend, monthlyLimit }
    });
  }

  return {
    status,
    allowed,
    utilizationPct,
    currentMonthSpend: Number(currentMonthSpend.toFixed(4)),
    monthlyLimit,
    isSecurityCritical,
    currency: budget.currency || 'USD'
  };
}

/**
 * Calculates complete Cost Intelligence summary metrics
 */
function getCostIntelligenceMetrics({ orgId, workspaceId }) {
  const ledger = readJson(COST_LEDGER_FILE, []);
  let filtered = ledger;

  if (workspaceId) {
    filtered = filtered.filter(i => i.workspaceId === workspaceId);
  } else if (orgId) {
    filtered = filtered.filter(i => i.orgId === orgId);
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const currentMonthStr = now.toISOString().slice(0, 7);

  let dailyCost = 0;
  let weeklyCost = 0;
  let monthlyCost = 0;
  let repairCount = 0;
  let verifiedRepairCount = 0;
  let repairCost = 0;
  let aiCost = 0;
  let probeCost = 0;
  let webhookCost = 0;
  let storageCost = 0;
  let githubCost = 0;

  const costByWorkspace = {};
  const costByCategory = {};

  filtered.forEach(item => {
    const amt = item.amount || 0;
    const cat = item.category || 'OTHER';
    const ws = item.workspaceId || 'ws_default';

    costByCategory[cat] = (costByCategory[cat] || 0) + amt;
    costByWorkspace[ws] = (costByWorkspace[ws] || 0) + amt;

    if (item.timestamp.startsWith(todayStr)) {
      dailyCost += amt;
    }
    if (new Date(item.timestamp) >= weekAgo) {
      weeklyCost += amt;
    }
    if (item.timestamp.startsWith(currentMonthStr)) {
      monthlyCost += amt;
    }

    if (cat === 'AI') aiCost += amt;
    if (cat === 'REPAIR_RUN') {
      repairCost += amt;
      repairCount++;
      if (item.metadata?.verified) verifiedRepairCount++;
    }
    if (cat === 'SYNTHETIC_PROBE') probeCost += amt;
    if (cat === 'WEBHOOK') webhookCost += amt;
    if (cat === 'STORAGE') storageCost += amt;
    if (cat === 'GITHUB_AUTOMATION') githubCost += amt;
  });

  // Calculate averages
  const costPerRepair = repairCount > 0 ? Number((repairCost / repairCount).toFixed(4)) : 0.05;
  const costPerVerifiedRepair = verifiedRepairCount > 0 ? Number((repairCost / verifiedRepairCount).toFixed(4)) : 0.06;

  // Forecast spend based on day of month
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const forecastedMonthlySpend = dayOfMonth > 0
    ? Number(((monthlyCost / dayOfMonth) * daysInMonth).toFixed(2))
    : monthlyCost;

  const budgetEval = evaluateBudget({ orgId, workspaceId });

  return {
    dailyCost: Number(dailyCost.toFixed(4)),
    weeklyCost: Number(weeklyCost.toFixed(4)),
    monthlyCost: Number(monthlyCost.toFixed(4)),
    forecastedMonthlySpend,
    costPerRepair,
    costPerVerifiedRepair,
    costBreakdown: {
      ai: Number(aiCost.toFixed(4)),
      repairs: Number(repairCost.toFixed(4)),
      probes: Number(probeCost.toFixed(4)),
      webhooks: Number(webhookCost.toFixed(4)),
      storage: Number(storageCost.toFixed(4)),
      github: Number(githubCost.toFixed(4))
    },
    costByCategory,
    costByWorkspace,
    budgetUtilization: budgetEval,
    estimateLabel: 'ESTIMATED',
    calculatedAt: new Date().toISOString()
  };
}

module.exports = {
  UNIT_COSTS,
  DEFAULT_BUDGET,
  recordCostEvent,
  getBudget,
  setBudget,
  evaluateBudget,
  getCostIntelligenceMetrics
};
