/**
 * APIFIX AI — Public API v1: Audit Ledger
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const auditLedgerService = require('../../services/auditLedgerService');

const router = express.Router();

/**
 * GET /api/v1/audit
 */
router.get('/', authenticate, requireApiKeyScope('audit:read'), (req, res) => {
  try {
    const { action, limit = 50 } = req.query;
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';

    const records = auditLedgerService.queryAuditLedger({
      organizationId,
      action,
      limit: parseInt(limit, 10)
    });

    return formatResponse(res, records, {
      pagination: {
        page: 1,
        limit: parseInt(limit, 10),
        totalCount: records.length,
        totalPages: 1
      }
    });
  } catch (err) {
    return formatError(res, 500, 'AUDIT_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/audit/verify
 */
router.post('/verify', authenticate, requireApiKeyScope('audit:read'), (req, res) => {
  try {
    const verification = auditLedgerService.verifyLedgerIntegrity();
    return formatResponse(res, verification);
  } catch (err) {
    return formatError(res, 500, 'AUDIT_VERIFY_FAILED', err.message, req);
  }
});

module.exports = router;
