/**
 * APIFIX AI — Enterprise Governance Policy REST API Routes (Phase 20)
 * Scoped governance policies, pre-execution evaluations, and decision logs.
 */

const express = require('express');
const {
  authenticate,
  requirePermission
} = require('../middleware/authMiddleware');
const governancePolicyEngine = require('../services/governancePolicyEngine');

const router = express.Router();

/**
 * GET /api/governance/policies
 * Get governance policy for a workspace or organization
 */
router.get('/policies', authenticate, async (req, res) => {
  try {
    const scopeId = req.query.workspaceId || req.query.orgId || 'org_enterprise_primary';
    const policy = governancePolicyEngine.getGovernancePolicy(scopeId);
    return res.json({ scopeId, policy });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'POLICY_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PUT /api/governance/policies
 * Update governance policy (requires policy.manage permission)
 */
router.put('/policies', authenticate, requirePermission('policy.manage'), async (req, res) => {
  try {
    const scopeId = req.body.workspaceId || req.body.orgId || req.query.scopeId || 'org_enterprise_primary';
    const policyUpdates = req.body.policy || req.body;

    const updated = await governancePolicyEngine.setGovernancePolicy(
      scopeId,
      policyUpdates,
      req.user
    );

    return res.json({ scopeId, policy: updated });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'POLICY_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/governance/evaluate
 * Pre-execution policy evaluation endpoint
 */
router.post('/evaluate', authenticate, async (req, res) => {
  try {
    const {
      orgId,
      workspaceId,
      repoName,
      branch,
      environment,
      severity
    } = req.body || {};

    const decision = await governancePolicyEngine.evaluateRepairPolicy({
      orgId,
      workspaceId,
      repoName,
      branch,
      environment,
      severity,
      requestedBy: req.user.id
    });

    return res.json({ decision });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'POLICY_EVALUATION_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/governance/decisions
 * List recent auditable policy decisions
 */
router.get('/decisions', authenticate, async (req, res) => {
  try {
    const { orgId, workspaceId, limit } = req.query;
    const decisions = governancePolicyEngine.listPolicyDecisions({
      orgId,
      workspaceId,
      limit: parseInt(limit, 10) || 50
    });
    return res.json({ decisions });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'DECISIONS_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
