/**
 * APIFIX AI — Production Readiness API v1 Routes (Phase 22)
 * Protected with RBAC (Admin/Owner) and zero secret leakage.
 */

const express = require('express');
const router = express.Router();
const { productionReadinessAuditor } = require('../../services/productionReadinessAuditor');
const { authenticate } = require('../../middleware/authMiddleware');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');

// GET /api/v1/admin/production-readiness
router.get('/production-readiness', authenticate, async (req, res) => {
  try {
    const role = (req.user?.role || req.apiKey?.role || 'VIEWER').toUpperCase();
    if (!['OWNER', 'ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      return res.status(403).json(formatError(req, 'FORBIDDEN', 'Only Admins or Owners can access production readiness diagnostics', 403));
    }

    const result = await productionReadinessAuditor.assessReadiness(process.env);
    res.status(200).json(formatResponse(req, result));
  } catch (err) {
    res.status(500).json(formatError(req, 'READINESS_ASSESSMENT_ERROR', err.message, 500));
  }
});

module.exports = router;
