/**
 * APIFIX AI — Data Retention REST API Routes (Phase 20)
 * Retention policy configuration, dry-run previews, and safe automated purge execution.
 */

const express = require('express');
const {
  authenticate,
  requirePermission
} = require('../middleware/authMiddleware');
const dataRetentionService = require('../services/dataRetentionService');

const router = express.Router();

/**
 * GET /api/retention/policy
 * Get retention policy
 */
router.get('/policy', authenticate, async (req, res) => {
  try {
    const orgId = req.query.orgId || 'org_enterprise_primary';
    const policy = dataRetentionService.getRetentionPolicy(orgId);
    return res.json({ orgId, policy });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'RETENTION_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PUT /api/retention/policy
 * Update retention policy
 */
router.put('/policy', authenticate, requirePermission('governance.manage'), async (req, res) => {
  try {
    const orgId = req.body.orgId || req.query.orgId || 'org_enterprise_primary';
    const policyUpdates = req.body.policy || req.body;

    const updated = await dataRetentionService.setRetentionPolicy(
      orgId,
      policyUpdates,
      req.user
    );

    return res.json({ orgId, policy: updated });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'RETENTION_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/retention/preview
 * Dry-run preview of expired records
 */
router.post('/preview', authenticate, async (req, res) => {
  try {
    const orgId = req.body.orgId || req.query.orgId || 'org_enterprise_primary';
    const preview = dataRetentionService.evaluateExpiredRecords(orgId, true);
    return res.json({ preview });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'PREVIEW_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/retention/cleanup
 * Execute safe retention cleanup
 */
router.post('/cleanup', authenticate, requirePermission('governance.manage'), async (req, res) => {
  try {
    const orgId = req.body.orgId || req.query.orgId || 'org_enterprise_primary';
    const result = await dataRetentionService.executeRetentionCleanup(orgId, req.user);
    return res.json({ result });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'CLEANUP_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
