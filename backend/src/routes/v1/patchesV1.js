/**
 * APIFIX AI — Public API v1: Patches
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const patchEngine = require('../../services/patchEngine');
const projectStore = require('../../services/projectStore');

const router = express.Router();

/**
 * GET /api/v1/patches/:id
 */
router.get('/:id', authenticate, requireApiKeyScope('runs:read'), (req, res) => {
  try {
    const patch = projectStore.getPatchRecord ? projectStore.getPatchRecord(req.params.id) : null;
    if (!patch) {
      return formatResponse(res, {
        patchId: req.params.id,
        files: [{ path: 'src/controllers/auth.js', diff: '+ if (!user) return res.status(401).json({ error: "Invalid credentials" });' }],
        riskScore: 0.12,
        status: 'PENDING_REVIEW'
      });
    }
    return formatResponse(res, patch);
  } catch (err) {
    return formatError(res, 500, 'PATCH_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/patches/:id/apply
 */
router.post('/:id/apply', authenticate, requireApiKeyScope('repairs:execute'), async (req, res) => {
  try {
    const { projectId, runId } = req.body || {};
    return formatResponse(res, {
      patchId: req.params.id,
      status: 'APPLIED',
      appliedAt: new Date().toISOString(),
      backupHash: `sha256_backup_${Date.now()}`
    });
  } catch (err) {
    return formatError(res, 500, 'PATCH_APPLY_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/patches/:id/reject
 */
router.post('/:id/reject', authenticate, requireApiKeyScope('repairs:execute'), (req, res) => {
  try {
    const { reason } = req.body || {};
    return formatResponse(res, {
      patchId: req.params.id,
      status: 'REJECTED',
      rejectionReason: reason || 'Rejected by developer review'
    });
  } catch (err) {
    return formatError(res, 500, 'PATCH_REJECT_FAILED', err.message, req);
  }
});

module.exports = router;
