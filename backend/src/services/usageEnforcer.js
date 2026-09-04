/**
 * APIFIX AI — Usage & Credit Enforcer Middleware / Service (Phase 13)
 * Enforces plan limits, active subscriptions, concurrent sandbox caps,
 * and pre-allocates credits before repair execution with automatic refunding on error.
 */

const { getWorkspaceBilling, consumeCredits, refundCredits } = require('./billingService');
const { getActiveRunCount } = require('./runController');
const workspaceService = require('./workspaceService');

/**
 * Validates workspace credit balance and plan limits before starting a billable repair.
 * Atomically consumes 1 credit and returns a handle to refund if needed.
 * 
 * @param {object} params
 * @param {string} params.workspaceId - ID of target workspace
 * @param {string} params.userId - ID of initiating user
 * @param {string} params.runId - Repair run ID
 * @param {string} params.operationType - Type of operation (default 'repair')
 * @returns {Promise<{ creditConsumed: boolean, refund: Function, billing: object }>}
 */
async function enforceRepairUsage({ workspaceId, userId, runId, operationType = 'repair' }) {
  if (!workspaceId) {
    // If no workspace provided, lookup or provision default workspace for user
    const defaultWs = await workspaceService.ensureDefaultWorkspace(userId, 'user@apifix.ai');
    workspaceId = defaultWs.id;
  }

  const billing = await getWorkspaceBilling(workspaceId);
  if (!billing) {
    throw new Error(`Workspace "${workspaceId}" not found for billing verification.`);
  }

  // 1. Subscription Status Check
  if (billing.plan !== 'free' && billing.subscriptionStatus === 'past_due') {
    const err = new Error('Workspace subscription is past due. Please update payment method in the Billing Portal.');
    err.code = 'SUBSCRIPTION_PAST_DUE';
    err.status = 402;
    throw err;
  }

  // 2. Concurrency Check
  const maxConcurrent = billing.maxConcurrentRepairs || 1;
  const activeRuns = getActiveRunCount ? getActiveRunCount(workspaceId) : 0;
  if (activeRuns >= maxConcurrent) {
    const err = new Error(`Workspace concurrent repair limit reached (${activeRuns}/${maxConcurrent} active). Upgrade plan for higher concurrency.`);
    err.code = 'CONCURRENCY_LIMIT_EXCEEDED';
    err.status = 429;
    throw err;
  }

  // 3. Credit Check & Atomic Deduction
  // Free scans or read-only probes may not consume credits; full autonomous repairs consume 1 credit
  const cost = operationType === 'scan' ? 0 : 1;

  if (cost > 0) {
    if (billing.credits < cost) {
      const err = new Error(`Insufficient repair credits. Required: ${cost}, Available: ${billing.credits}. Please upgrade plan or purchase credits.`);
      err.code = 'INSUFFICIENT_CREDITS';
      err.status = 402;
      err.details = { required: cost, available: billing.credits, plan: billing.plan };
      throw err;
    }

    await consumeCredits(workspaceId, cost, {
      reason: `AI Autonomous Repair Run (${runId})`,
      userId,
      runId
    });
  }

  let isRefunded = false;
  const refund = async (reason = 'Repair aborted before execution') => {
    if (cost > 0 && !isRefunded) {
      isRefunded = true;
      try {
        await refundCredits(workspaceId, cost, {
          reason: `${reason} (${runId})`,
          userId,
          runId
        });
      } catch (refundErr) {
        console.error('[UsageEnforcer] Credit refund error:', refundErr.message);
      }
    }
  };

  return {
    workspaceId,
    cost,
    creditConsumed: cost > 0,
    refund,
    billing
  };
}

module.exports = {
  enforceRepairUsage
};
