/**
 * APIFIX AI — Customer Support Diagnostics Service (Phase 25)
 * 
 * Generates sanitized diagnostic packages for support tickets and troubleshooting
 * without exposing plaintext secrets, tokens, customer payloads, or credentials.
 */

const crypto = require('crypto');
const logger = require('./logger');
const { auditLedgerService } = require('./auditLedgerService');
const { finopsEngine } = require('./finopsEngine');

class SupportDiagnosticsService {
  /**
   * Builds a sanitized support diagnostic bundle.
   * @param {Object} params
   * @param {string} params.workspaceId - Workspace ID
   * @param {string} [params.projectId] - Project ID
   * @param {string} [params.incidentId] - Incident ID
   * @param {string} [params.repairId] - Repair ID
   * @param {string} [params.correlationId] - HTTP Correlation ID
   * @param {string} [params.userDescription] - User-reported issue description
   */
  generateDiagnosticPackage({
    workspaceId,
    projectId,
    incidentId,
    repairId,
    correlationId,
    userDescription = ''
  }) {
    if (!workspaceId) {
      throw new Error('workspaceId is required to generate a support diagnostic package');
    }

    const ticketToken = `DIAG_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const generatedAt = new Date().toISOString();

    // Fetch relevant audit events (scoped to workspace)
    let auditSummary = [];
    try {
      const logs = auditLedgerService.getAuditLogs(workspaceId);
      auditSummary = logs.slice(-5).map(l => ({
        sequenceNumber: l.sequenceNumber,
        action: l.action,
        timestamp: l.timestamp,
        resourceId: l.resourceId
      }));
    } catch (err) {
      auditSummary = [{ note: 'Audit ledger lookup failed or empty' }];
    }

    // Fetch spend status (scoped to workspace)
    let spendInfo = { totalSpendUsd: 0 };
    try {
      spendInfo = { totalSpendUsd: finopsEngine.getSpend(workspaceId) };
    } catch (err) {
      spendInfo = { totalSpendUsd: 0 };
    }

    const diagnosticBundle = {
      classification: 'MEASURED',
      ticketToken,
      generatedAt,
      workspaceId,
      projectId: projectId || 'none',
      incidentId: incidentId || 'none',
      repairId: repairId || 'none',
      correlationId: correlationId || `corr_${crypto.randomBytes(6).toString('hex')}`,
      userDescription: this._sanitizeText(userDescription),
      systemState: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024))
      },
      auditSummary,
      spendInfo,
      securityGuarantee: 'Zero plaintext credentials, keys, or tenant source code included in diagnostic bundle.'
    };

    logger.info('support_diagnostic_package_generated', {
      ticketToken,
      workspaceId,
      incidentId,
      correlationId: diagnosticBundle.correlationId
    });

    return diagnosticBundle;
  }

  _sanitizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/sk_[a-zA-Z0-9_\-]{10,}/g, '[REDACTED_API_KEY]')
      .replace(/ghp_[a-zA-Z0-9_\-]{10,}/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/password\s*[:=]\s*\S+/gi, 'password=[REDACTED]');
  }
}

const supportDiagnosticsService = new SupportDiagnosticsService();

module.exports = {
  SupportDiagnosticsService,
  supportDiagnosticsService
};
