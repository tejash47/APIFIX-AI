/**
 * APIFIX AI — Public API v1: Usage & Analytics
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const { getApiUsageAnalytics } = require('../../services/apiUsageService');
const { getCostMetrics } = require('../../services/costIntelligenceService');

const router = express.Router();

/**
 * GET /api/v1/usage
 */
router.get('/', authenticate, requireApiKeyScope('billing:read'), (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.workspaceId || (req.user && req.user.workspaceId) || 'ws_demo_primary';

    const analytics = getApiUsageAnalytics({ organizationId, workspaceId });
    const costSummary = getCostMetrics({ organizationId, workspaceId });

    return formatResponse(res, {
      analytics,
      costSummary
    });
  } catch (err) {
    return formatError(res, 500, 'USAGE_FETCH_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/usage/analytics
 */
router.get('/analytics', authenticate, requireApiKeyScope('billing:read'), (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.workspaceId || (req.user && req.user.workspaceId) || 'ws_demo_primary';

    const analytics = getApiUsageAnalytics({ organizationId, workspaceId });
    return formatResponse(res, analytics);
  } catch (err) {
    return formatError(res, 500, 'ANALYTICS_FETCH_FAILED', err.message, req);
  }
});

module.exports = router;
