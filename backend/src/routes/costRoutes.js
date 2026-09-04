/**
 * APIFIX AI — Enterprise Cost Intelligence REST API Routes (Phase 20)
 * Multi-dimensional operational cost analytics, AI provider breakdown, and budget limits.
 */

const express = require('express');
const {
  authenticate,
  requirePermission
} = require('../middleware/authMiddleware');
const costIntelligenceService = require('../services/costIntelligenceService');
const aiGovernanceService = require('../services/aiGovernanceService');

const router = express.Router();

/**
 * GET /api/costs/intelligence
 * Get aggregated cost metrics and forecast
 */
router.get('/intelligence', authenticate, async (req, res) => {
  try {
    const { orgId, workspaceId } = req.query;
    const metrics = costIntelligenceService.getCostIntelligenceMetrics({ orgId, workspaceId });
    const aiSummary = aiGovernanceService.getAiUsageSummary({ orgId, workspaceId, timeframe: 'all' });

    return res.json({
      metrics,
      aiSummary
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'COST_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/costs/budgets
 * Get budget thresholds and utilization
 */
router.get('/budgets', authenticate, async (req, res) => {
  try {
    const scopeId = req.query.workspaceId || req.query.orgId || 'org_enterprise_primary';
    const budget = costIntelligenceService.getBudget(scopeId);
    const evaluation = costIntelligenceService.evaluateBudget({
      orgId: req.query.orgId,
      workspaceId: req.query.workspaceId
    });

    return res.json({
      scopeId,
      budget,
      evaluation
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'BUDGET_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PUT /api/costs/budgets
 * Update budget thresholds
 */
router.put('/budgets', authenticate, requirePermission('billing.manage'), async (req, res) => {
  try {
    const scopeId = req.body.workspaceId || req.body.orgId || req.query.scopeId || 'org_enterprise_primary';
    const budgetUpdates = req.body.budget || req.body;

    const updated = await costIntelligenceService.setBudget(
      scopeId,
      budgetUpdates,
      req.user
    );

    return res.json({ scopeId, budget: updated });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'BUDGET_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/costs/ai-usage
 * Granular AI usage and cost breakdown
 */
router.get('/ai-usage', authenticate, async (req, res) => {
  try {
    const { orgId, workspaceId, timeframe } = req.query;
    const summary = aiGovernanceService.getAiUsageSummary({ orgId, workspaceId, timeframe });
    return res.json({ summary });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'AI_USAGE_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
