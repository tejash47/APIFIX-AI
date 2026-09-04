/**
 * APIFIX AI — Data Retention & Lifecycle Engine (Phase 20)
 * Configurable retention policies, safe dry-run previews, automated
 * purging with legal hold protection and immutable audit logging.
 */

const fs = require('fs');
const path = require('path');
const { recordAuditEvent } = require('./auditLogger');
const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const RETENTION_POLICY_FILE = path.join(DATA_DIR, 'retention_policies.json');

const RETENTION_PERIODS = {
  RETENTION_DISABLED: 0,
  RETENTION_30_DAYS: 30,
  RETENTION_90_DAYS: 90,
  RETENTION_180_DAYS: 180,
  RETENTION_1_YEAR: 365,
  RETENTION_CUSTOM: null
};

const DEFAULT_RETENTION_POLICY = {
  retentionTier: 'RETENTION_90_DAYS',
  days: 90,
  enabledDataClasses: {
    auditEvents: true,
    telemetry: true,
    incidents: true,
    repairRuns: true,
    artifacts: true,
    aiUsage: true,
    webhookEvents: true
  },
  legalHoldActive: false,
  updatedAt: new Date().toISOString()
};

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

/**
 * Gets retention policy for organization
 */
function getRetentionPolicy(orgId = 'org_enterprise_primary') {
  const policies = readJson(RETENTION_POLICY_FILE, []);
  const found = policies.find(p => p.orgId === orgId);
  return found ? found.policy : { ...DEFAULT_RETENTION_POLICY };
}

/**
 * Sets retention policy for organization
 */
async function setRetentionPolicy(orgId = 'org_enterprise_primary', policyUpdates = {}, actor = {}) {
  const policies = readJson(RETENTION_POLICY_FILE, []);
  const index = policies.findIndex(p => p.orgId === orgId);
  const current = index !== -1 ? policies[index].policy : { ...DEFAULT_RETENTION_POLICY };

  let days = current.days;
  if (policyUpdates.retentionTier && RETENTION_PERIODS[policyUpdates.retentionTier] !== undefined) {
    days = RETENTION_PERIODS[policyUpdates.retentionTier];
  } else if (policyUpdates.days !== undefined) {
    days = Number(policyUpdates.days);
  }

  const updated = {
    ...current,
    ...policyUpdates,
    days,
    updatedAt: new Date().toISOString()
  };

  if (index !== -1) {
    policies[index].policy = updated;
  } else {
    policies.push({ orgId, policy: updated });
  }

  writeJson(RETENTION_POLICY_FILE, policies);

  await recordAuditEvent({
    workspaceId: 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'DATA_RETENTION_POLICY_UPDATED',
    resourceType: 'RETENTION_POLICY',
    resourceId: orgId,
    metadata: { updated }
  });

  return updated;
}

/**
 * Evaluates expired records across all data classes
 * @param {string} orgId
 * @param {boolean} dryRun
 * @returns {object} Summary of expired records
 */
function evaluateExpiredRecords(orgId = 'org_enterprise_primary', dryRun = true) {
  const policy = getRetentionPolicy(orgId);

  if (policy.legalHoldActive || policy.retentionTier === 'RETENTION_DISABLED' || policy.days === 0) {
    return {
      dryRun,
      retentionTier: policy.retentionTier,
      totalExpired: 0,
      breakdown: {},
      reason: policy.legalHoldActive ? 'Legal Hold is Active — Purging suspended' : 'Retention is Disabled'
    };
  }

  const cutoffDate = new Date(Date.now() - (policy.days * 24 * 60 * 60 * 1000));
  const breakdown = {
    aiUsageExpired: 0,
    repairRunsExpired: 0,
    incidentsExpired: 0,
    costLedgerExpired: 0,
    protectedIncidentsPreserved: 0
  };

  // 1. AI Usage Ledger
  const aiFile = path.join(DATA_DIR, 'ai_usage_ledger.json');
  const aiRecords = readJson(aiFile, []);
  breakdown.aiUsageExpired = aiRecords.filter(r => new Date(r.timestamp) < cutoffDate).length;

  // 2. Repair Runs
  const runsFile = path.join(DATA_DIR, 'repair_runs.json');
  const runs = readJson(runsFile, []);
  breakdown.repairRunsExpired = runs.filter(r => new Date(r.createdAt || r.timestamp) < cutoffDate).length;

  // 3. Incidents (Safety rule: Never delete active incidents)
  const incFile = path.join(DATA_DIR, 'incidents.json');
  const incidents = readJson(incFile, []);
  incidents.forEach(inc => {
    const isOld = new Date(inc.createdAt || inc.timestamp) < cutoffDate;
    const isActive = inc.state === 'OPEN' || inc.state === 'INVESTIGATING' || inc.status === 'OPEN';
    if (isOld) {
      if (isActive) {
        breakdown.protectedIncidentsPreserved++;
      } else {
        breakdown.incidentsExpired++;
      }
    }
  });

  // 4. Cost Ledger
  const costFile = path.join(DATA_DIR, 'cost_ledger.json');
  const costRecords = readJson(costFile, []);
  breakdown.costLedgerExpired = costRecords.filter(r => new Date(r.timestamp) < cutoffDate).length;

  const totalExpired = breakdown.aiUsageExpired + breakdown.repairRunsExpired + breakdown.incidentsExpired + breakdown.costLedgerExpired;

  return {
    dryRun,
    retentionDays: policy.days,
    cutoffDate: cutoffDate.toISOString(),
    totalExpired,
    breakdown,
    status: totalExpired > 0 ? 'PURGE_ELIGIBLE' : 'CLEAN'
  };
}

/**
 * Executes safe retention cleanup
 */
async function executeRetentionCleanup(orgId = 'org_enterprise_primary', actor = {}) {
  const preview = evaluateExpiredRecords(orgId, false);
  const policy = getRetentionPolicy(orgId);

  if (policy.legalHoldActive || policy.days === 0) {
    throw new Error('Cleanup aborted: Retention disabled or Legal Hold active.');
  }

  const cutoffDate = new Date(Date.now() - (policy.days * 24 * 60 * 60 * 1000));

  // 1. Purge AI Usage Ledger
  const aiFile = path.join(DATA_DIR, 'ai_usage_ledger.json');
  const aiRecords = readJson(aiFile, []);
  const remainingAi = aiRecords.filter(r => new Date(r.timestamp) >= cutoffDate);
  writeJson(aiFile, remainingAi);

  // 2. Purge Repair Runs
  const runsFile = path.join(DATA_DIR, 'repair_runs.json');
  const runs = readJson(runsFile, []);
  const remainingRuns = runs.filter(r => new Date(r.createdAt || r.timestamp) >= cutoffDate);
  writeJson(runsFile, remainingRuns);

  // 3. Purge Resolved/Closed Incidents Only
  const incFile = path.join(DATA_DIR, 'incidents.json');
  const incidents = readJson(incFile, []);
  const remainingIncidents = incidents.filter(inc => {
    const isOld = new Date(inc.createdAt || inc.timestamp) < cutoffDate;
    const isActive = inc.state === 'OPEN' || inc.state === 'INVESTIGATING' || inc.status === 'OPEN';
    return !isOld || isActive; // preserve active or fresh
  });
  writeJson(incFile, remainingIncidents);

  observabilityEngine.recordEvent({
    category: 'GOVERNANCE',
    event: 'retention_cleanup_completed',
    status: 'SUCCESS',
    metadata: { orgId, itemsPurged: preview.totalExpired, breakdown: preview.breakdown }
  });

  await recordAuditEvent({
    workspaceId: 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'RETENTION_CLEANUP_EXECUTED',
    resourceType: 'RETENTION',
    resourceId: orgId,
    metadata: { itemsPurged: preview.totalExpired, cutoffDate: preview.cutoffDate }
  });

  return {
    success: true,
    purgedCount: preview.totalExpired,
    breakdown: preview.breakdown,
    cutoffDate: preview.cutoffDate,
    executedAt: new Date().toISOString()
  };
}

module.exports = {
  RETENTION_PERIODS,
  DEFAULT_RETENTION_POLICY,
  getRetentionPolicy,
  setRetentionPolicy,
  evaluateExpiredRecords,
  executeRetentionCleanup
};
