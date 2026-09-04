/**
 * APIFIX AI — Enterprise Compliance Control Center REST API Routes (Phase 20)
 * Internal control framework, on-demand verification audits, and evidence trails.
 */

const express = require('express');
const {
  authenticate,
  requirePermission
} = require('../middleware/authMiddleware');
const complianceService = require('../services/complianceService');
const complianceEvidenceService = require('../services/complianceEvidenceService');

const router = express.Router();

/**
 * GET /api/compliance/controls
 * List internal controls and status
 */
router.get('/controls', authenticate, async (req, res) => {
  try {
    const orgId = req.query.orgId || 'org_enterprise_primary';
    const controls = complianceService.getComplianceFramework(orgId);
    const summary = complianceService.getComplianceSummary(orgId);

    return res.json({
      summary,
      controls
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'COMPLIANCE_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/compliance/verify
 * Run on-demand compliance audit & live verification
 */
router.post('/verify', authenticate, requirePermission('compliance.read'), async (req, res) => {
  try {
    const { controlId, orgId = 'org_enterprise_primary' } = req.body || {};

    if (controlId) {
      const verified = await complianceService.verifyComplianceControl(controlId, orgId, req.user.email);
      return res.json({ control: verified });
    }

    const allVerified = await complianceService.verifyAllComplianceControls(orgId, req.user.email);
    const updatedSummary = complianceService.getComplianceSummary(orgId);

    return res.json({
      summary: updatedSummary,
      controls: allVerified
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'COMPLIANCE_VERIFY_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/compliance/evidence
 * Query cryptographic compliance evidence trail
 */
router.get('/evidence', authenticate, async (req, res) => {
  try {
    const { orgId, controlId, page, limit } = req.query;
    const result = complianceEvidenceService.listEvidence({
      orgId,
      controlId,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'EVIDENCE_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/compliance/evidence/:evidenceId/verify
 * Verify SHA-256 integrity hash of a specific evidence record
 */
router.get('/evidence/:evidenceId/verify', authenticate, async (req, res) => {
  try {
    const result = complianceEvidenceService.verifyEvidenceIntegrity(req.params.evidenceId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'EVIDENCE_VERIFY_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/compliance/summary
 * High-level executive compliance summary and governance score
 */
router.get('/summary', authenticate, async (req, res) => {
  try {
    const orgId = req.query.orgId || 'org_enterprise_primary';
    const summary = complianceService.getComplianceSummary(orgId);
    return res.json({ summary });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'SUMMARY_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
