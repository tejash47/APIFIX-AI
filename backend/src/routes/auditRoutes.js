/**
 * APIFIX AI — Enterprise Immutable Audit Ledger REST API Routes (Phase 20)
 * Read-only cryptographic ledger access and full chain integrity verification.
 */

const express = require('express');
const {
  authenticate,
  requirePermission
} = require('../middleware/authMiddleware');
const auditLedgerService = require('../services/auditLedgerService');

const router = express.Router();

/**
 * GET /api/audit/ledger
 * Query immutable audit ledger
 */
router.get('/ledger', authenticate, requirePermission('audit.read'), async (req, res) => {
  try {
    const { orgId, workspaceId, action, actorId, page, limit } = req.query;
    const result = auditLedgerService.listLedgerEvents({
      orgId,
      workspaceId,
      action,
      actorId,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'AUDIT_LEDGER_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/audit/verify
 * Run SHA-256 chain verification and detect any tampering
 */
router.post('/verify', authenticate, requirePermission('audit.read'), async (req, res) => {
  try {
    const { orgId, workspaceId } = req.body || {};
    const result = auditLedgerService.verifyAuditChain({ orgId, workspaceId });
    return res.json({ verification: result });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'AUDIT_VERIFY_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * DELETE /api/audit/ledger/:eventId
 * Explicitly rejects deletion attempts to preserve immutability
 */
router.delete('/ledger/:eventId', authenticate, async (req, res) => {
  return res.status(405).json({
    error: {
      code: 'AUDIT_IMMUTABLE_ERROR',
      message: 'Method Not Allowed: Audit ledger records are cryptographically immutable and cannot be deleted.',
      requestId: req.id
    }
  });
});

module.exports = router;
