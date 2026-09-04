/**
 * APIFIX AI — Enterprise Governance Policy Engine (Phase 20)
 * Evaluates pre-execution compliance, autonomous repair constraints,
 * branch policies, approval thresholds, and records auditable policy decisions.
 */

const fs = require('fs');
const path = require('path');
const { recordAuditEvent } = require('./auditLogger');
const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const GOVERNANCE_POLICIES_FILE = path.join(DATA_DIR, 'governance_policies.json');
const POLICY_DECISIONS_FILE = path.join(DATA_DIR, 'policy_decisions.json');

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

const DEFAULT_POLICY = {
  maxDailyAutoRepairs: 10,
  maxDailyCredits: 100,
  allowedAiProviders: ['anthropic', 'groq', 'openai'],
  allowedAiModels: ['claude-3-5-sonnet-20241022', 'openai/gpt-oss-120b', 'gpt-4o'],
  requiredApprovalLevel: 'NONE',
  productionRepairRestrictions: {
    autoRepairBlocked: true,
    requireSecurityScan: true,
    requireTestPass: true,
    requireReviewers: 2
  },
  branchRestrictions: ['main', 'master', 'production', 'release/*'],
  requiredTestsBeforePr: true,
  requiredSecurityScanBeforePr: true,
  requiredReviewerCount: 1,
  incidentSeverityThresholds: {
    autoRepairCritical: false,
    autoRepairHigh: true,
    autoRepairMedium: true,
    autoRepairLow: true
  },
  webhookRestrictions: {
    allowExternalDispatch: true,
    allowedDomains: []
  },
  externalNotificationRestrictions: {
    blockSlackInDev: false
  }
};

/**
 * Gets governance policy for an organization or workspace
 */
function getGovernancePolicy(scopeId) {
  const policies = readJson(GOVERNANCE_POLICIES_FILE, []);
  const found = policies.find(p => p.scopeId === scopeId);
  if (found) return found.policy;
  return { ...DEFAULT_POLICY };
}

/**
 * Sets governance policy for an organization or workspace
 */
async function setGovernancePolicy(scopeId, policyUpdates = {}, actor = {}) {
  const policies = readJson(GOVERNANCE_POLICIES_FILE, []);
  const index = policies.findIndex(p => p.scopeId === scopeId);
  const current = index !== -1 ? policies[index].policy : { ...DEFAULT_POLICY };

  const updatedPolicy = {
    ...current,
    ...policyUpdates,
    productionRepairRestrictions: {
      ...current.productionRepairRestrictions,
      ...(policyUpdates.productionRepairRestrictions || {})
    },
    incidentSeverityThresholds: {
      ...current.incidentSeverityThresholds,
      ...(policyUpdates.incidentSeverityThresholds || {})
    },
    webhookRestrictions: {
      ...current.webhookRestrictions,
      ...(policyUpdates.webhookRestrictions || {})
    },
    externalNotificationRestrictions: {
      ...current.externalNotificationRestrictions,
      ...(policyUpdates.externalNotificationRestrictions || {})
    },
    updatedAt: new Date().toISOString()
  };

  if (index !== -1) {
    policies[index].policy = updatedPolicy;
    policies[index].updatedAt = new Date().toISOString();
  } else {
    policies.push({
      scopeId,
      policy: updatedPolicy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  writeJson(GOVERNANCE_POLICIES_FILE, policies);

  await recordAuditEvent({
    workspaceId: scopeId.startsWith('ws_') ? scopeId : 'org_global',
    actorId: actor.id || 'system',
    actorEmail: actor.email || '',
    action: 'GOVERNANCE_POLICY_UPDATED',
    resourceType: 'POLICY',
    resourceId: scopeId,
    metadata: { policyUpdates }
  });

  return updatedPolicy;
}

/**
 * Evaluates whether a repair execution is permitted under active governance policies.
 * Evaluates BEFORE execution.
 */
async function evaluateRepairPolicy({
  orgId = 'org_enterprise_primary',
  workspaceId = 'ws_default',
  repoName = '',
  branch = 'main',
  environment = 'development',
  severity = 'MEDIUM',
  requestedBy = 'user'
}) {
  const policy = getGovernancePolicy(workspaceId) || getGovernancePolicy(orgId) || DEFAULT_POLICY;
  const decisionId = `dec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();

  const isProductionEnv = environment.toLowerCase() === 'production' ||
    branch === 'main' ||
    branch === 'master' ||
    branch.startsWith('prod') ||
    branch.startsWith('release');

  const blockedRules = [];
  let requiresApproval = false;
  let requiredApprovals = 0;

  // Rule 1: Production auto-repair restrictions
  if (isProductionEnv && policy.productionRepairRestrictions?.autoRepairBlocked) {
    requiresApproval = true;
    requiredApprovals = Math.max(requiredApprovals, policy.productionRepairRestrictions.requireReviewers || 2);
    blockedRules.push('PRODUCTION_AUTO_REPAIR_RESTRICTED');
  }

  // Rule 2: Critical Severity restrictions
  const sevUpper = String(severity).toUpperCase();
  if (sevUpper === 'CRITICAL' && policy.incidentSeverityThresholds?.autoRepairCritical === false) {
    requiresApproval = true;
    requiredApprovals = Math.max(requiredApprovals, 1);
    blockedRules.push('CRITICAL_INCIDENT_REQUIRES_APPROVAL');
  }

  // Rule 3: Protected branch restrictions
  const isProtectedBranch = (policy.branchRestrictions || []).some(pattern => {
    if (pattern.endsWith('*')) {
      return branch.startsWith(pattern.slice(0, -1));
    }
    return branch === pattern;
  });

  if (isProtectedBranch && policy.requiredApprovalLevel !== 'NONE') {
    requiresApproval = true;
    requiredApprovals = Math.max(
      requiredApprovals,
      policy.requiredApprovalLevel === 'TWO_REVIEWERS' ? 2 : 1
    );
    blockedRules.push('PROTECTED_BRANCH_APPROVAL_REQUIRED');
  }

  const allowed = blockedRules.length === 0 && !requiresApproval;
  const reason = allowed
    ? 'Autonomous repair authorized under active governance policy.'
    : `Repair requires human approval due to policy constraints: ${blockedRules.join(', ')}`;

  const decision = {
    decisionId,
    orgId,
    workspaceId,
    repoName,
    branch,
    environment,
    severity: sevUpper,
    allowed,
    requiresApproval,
    requiredApprovals,
    blockedRules,
    reason,
    timestamp: now
  };

  // Record decision ledger
  const decisions = readJson(POLICY_DECISIONS_FILE, []);
  decisions.unshift(decision);
  if (decisions.length > 1000) decisions.pop();
  writeJson(POLICY_DECISIONS_FILE, decisions);

  // Emit observability & audit
  observabilityEngine.recordEvent({
    workspaceId,
    category: 'GOVERNANCE',
    event: allowed ? 'governance_policy_evaluated' : 'governance_policy_blocked',
    status: allowed ? 'SUCCESS' : 'FAILURE',
    metadata: { decisionId, blockedRules, requiresApproval, requiredApprovals }
  });

  await recordAuditEvent({
    workspaceId,
    actorId: requestedBy,
    action: allowed ? 'GOVERNANCE_POLICY_ALLOWED' : 'GOVERNANCE_POLICY_BLOCKED',
    resourceType: 'POLICY_DECISION',
    resourceId: decisionId,
    metadata: { decision }
  });

  return decision;
}

/**
 * Lists recent policy decisions
 */
function listPolicyDecisions({ orgId, workspaceId, limit = 50 }) {
  const decisions = readJson(POLICY_DECISIONS_FILE, []);
  let filtered = decisions;
  if (workspaceId) {
    filtered = filtered.filter(d => d.workspaceId === workspaceId);
  } else if (orgId) {
    filtered = filtered.filter(d => d.orgId === orgId);
  }
  return filtered.slice(0, limit);
}

async function evaluatePolicy(opts = {}) {
  const res = await evaluateRepairPolicy({
    workspaceId: opts.workspaceId || 'default',
    repoName: opts.repoName || 'main-repo',
    branch: opts.branch || (opts.environment === 'production' ? 'main' : 'feature/fix'),
    environment: opts.environment || 'development',
    severity: opts.severity || 'MEDIUM',
    isAutoRepair: opts.isAutoRepair !== false,
    requestedBy: opts.requestedBy || 'system'
  });

  return {
    ...res,
    status: res.allowed ? 'ALLOWED' : (res.requiresApproval ? 'REQUIRES_APPROVAL' : 'BLOCKED')
  };
}

const governancePolicyEngine = {
  getGovernancePolicy,
  setGovernancePolicy,
  evaluateRepairPolicy,
  evaluateGovernancePolicies: evaluateRepairPolicy,
  evaluatePolicy,
  listPolicyDecisions
};

module.exports = {
  DEFAULT_POLICY,
  getGovernancePolicy,
  setGovernancePolicy,
  evaluateRepairPolicy,
  evaluateGovernancePolicies: evaluateRepairPolicy,
  evaluatePolicy,
  listPolicyDecisions,
  governancePolicyEngine
};
