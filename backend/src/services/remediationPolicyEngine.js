const billingService = require('./billingService');
const auditLogger = require('./auditLogger');
const logger = require('./logger');

/**
 * Workspace remediation policy registry
 */
const workspacePolicies = new Map();

/**
 * Valid remediation strategies
 */
const VALID_STRATEGIES = ['MANUAL_APPROVAL', 'AUTO_REPAIR_AND_PR', 'DIAGNOSE_ONLY'];

/**
 * Gets the current remediation policy for a workspace
 * @param {string} workspaceId
 * @returns {object} Remediation policy
 */
function getRemediationPolicy(workspaceId) {
  let policy = workspacePolicies.get(workspaceId);
  const today = new Date().toISOString().split('T')[0];

  if (!policy) {
    policy = {
      workspaceId,
      strategy: 'MANUAL_APPROVAL',
      maxDailyAutoRepairs: 5,
      requireCleanSandboxPass: true,
      autoCreatePrBranchPrefix: 'apifix/auto-fix-',
      alertOnAutoFix: true,
      dailyRepairsExecuted: 0,
      lastExecutionDate: today,
      updatedAt: new Date().toISOString()
    };
    workspacePolicies.set(workspaceId, policy);
  }

  // Daily quota reset on new calendar day
  if (policy.lastExecutionDate !== today) {
    policy.dailyRepairsExecuted = 0;
    policy.lastExecutionDate = today;
  }

  return {
    workspaceId: policy.workspaceId,
    strategy: policy.strategy,
    maxDailyAutoRepairs: policy.maxDailyAutoRepairs,
    requireCleanSandboxPass: policy.requireCleanSandboxPass,
    autoCreatePrBranchPrefix: policy.autoCreatePrBranchPrefix,
    alertOnAutoFix: policy.alertOnAutoFix,
    dailyRepairsExecuted: policy.dailyRepairsExecuted,
    dailyRepairsRemaining: Math.max(0, policy.maxDailyAutoRepairs - policy.dailyRepairsExecuted),
    lastExecutionDate: policy.lastExecutionDate,
    updatedAt: policy.updatedAt
  };
}

/**
 * Updates the remediation policy for a workspace
 * @param {string} workspaceId
 * @param {object} updates
 * @param {string} [actorId]
 */
function updateRemediationPolicy(workspaceId, updates = {}, actorId = 'system') {
  const current = getRemediationPolicy(workspaceId);

  if (updates.strategy && !VALID_STRATEGIES.includes(updates.strategy)) {
    throw new Error(`Invalid strategy. Must be one of: ${VALID_STRATEGIES.join(', ')}`);
  }

  const updated = {
    ...current,
    strategy: updates.strategy || current.strategy,
    maxDailyAutoRepairs: updates.maxDailyAutoRepairs !== undefined ? Number(updates.maxDailyAutoRepairs) : current.maxDailyAutoRepairs,
    requireCleanSandboxPass: typeof updates.requireCleanSandboxPass === 'boolean' ? updates.requireCleanSandboxPass : current.requireCleanSandboxPass,
    autoCreatePrBranchPrefix: updates.autoCreatePrBranchPrefix ? String(updates.autoCreatePrBranchPrefix).trim() : current.autoCreatePrBranchPrefix,
    alertOnAutoFix: typeof updates.alertOnAutoFix === 'boolean' ? updates.alertOnAutoFix : current.alertOnAutoFix,
    lastExecutionDate: current.lastExecutionDate || new Date().toISOString().split('T')[0],
    updatedAt: new Date().toISOString()
  };

  workspacePolicies.set(workspaceId, updated);

  auditLogger.recordAuditEvent({
    workspaceId,
    actorId,
    action: 'REMEDIATION_POLICY_UPDATED',
    resourceType: 'policy',
    resourceId: workspaceId,
    details: { strategy: updated.strategy, maxDailyAutoRepairs: updated.maxDailyAutoRepairs }
  });

  return getRemediationPolicy(workspaceId);
}

/**
 * Evaluates whether an automated repair run can proceed under the workspace policy
 * @param {string} workspaceId
 * @returns {Promise<object>} { canAutoRepair, reason, strategy }
 */
async function evaluateAutoRepairPermission(workspaceId) {
  const policy = getRemediationPolicy(workspaceId);

  if (policy.strategy === 'MANUAL_APPROVAL') {
    return {
      canAutoRepair: false,
      reason: 'Workspace policy requires manual approval for patches (MANUAL_APPROVAL).',
      strategy: policy.strategy
    };
  }

  if (policy.strategy === 'DIAGNOSE_ONLY') {
    return {
      canAutoRepair: false,
      reason: 'Workspace policy is set to diagnosis only (DIAGNOSE_ONLY).',
      strategy: policy.strategy
    };
  }

  if (policy.dailyRepairsRemaining <= 0) {
    return {
      canAutoRepair: false,
      reason: `Daily auto-repair quota reached (${policy.maxDailyAutoRepairs}/${policy.maxDailyAutoRepairs}).`,
      strategy: policy.strategy
    };
  }

  // Verify credit availability
  try {
    const credits = typeof billingService.getCreditBalance === 'function'
      ? await billingService.getCreditBalance(workspaceId)
      : 10;
    if (credits < 1) {
      return {
        canAutoRepair: false,
        reason: 'Insufficient workspace credits to initiate auto-repair.',
        strategy: policy.strategy
      };
    }
  } catch (err) {
    logger.warn('credit_check_failed_during_policy_eval', { workspaceId, error: err.message });
  }

  return {
    canAutoRepair: true,
    reason: 'Auto-repair authorized under AUTO_REPAIR_AND_PR policy.',
    strategy: policy.strategy
  };
}

/**
 * Records an auto-repair execution against the daily policy quota
 * @param {string} workspaceId
 */
function recordAutoRepairExecution(workspaceId) {
  const policy = getRemediationPolicy(workspaceId);
  const updated = {
    ...policy,
    dailyRepairsExecuted: policy.dailyRepairsExecuted + 1
  };
  workspacePolicies.set(workspaceId, updated);
}

module.exports = {
  VALID_STRATEGIES,
  getRemediationPolicy,
  updateRemediationPolicy,
  evaluateAutoRepairPermission,
  recordAutoRepairExecution,
  _workspacePolicies: workspacePolicies
};
