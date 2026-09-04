/**
 * APIFIX AI — Public API v1: Agent Runs
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const projectStore = require('../../services/projectStore');
const { executeRun, cancelRun, getRunStatus } = require('../../services/runController');
const { evaluateGovernancePolicies } = require('../../services/governancePolicyEngine');
const { dispatchWebhookEvent } = require('../../services/webhookDeliveryService');

const router = express.Router();

/**
 * GET /api/v1/runs
 */
router.get('/', authenticate, requireApiKeyScope('runs:read'), (req, res) => {
  try {
    const history = projectStore.getRunHistory ? projectStore.getRunHistory() : [];
    return formatResponse(res, history, {
      pagination: {
        page: 1,
        limit: 50,
        totalCount: history.length,
        totalPages: 1
      }
    });
  } catch (err) {
    return formatError(res, 500, 'RUNS_FETCH_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/runs/:id
 */
router.get('/:id', authenticate, requireApiKeyScope('runs:read'), (req, res) => {
  try {
    const run = getRunStatus(req.params.id);
    if (!run) {
      return formatError(res, 404, 'RUN_NOT_FOUND', `Run ${req.params.id} not found.`, req);
    }
    return formatResponse(res, run);
  } catch (err) {
    return formatError(res, 500, 'RUN_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/runs
 */
router.post('/', authenticate, requireApiKeyScope('runs:create'), async (req, res) => {
  try {
    const { projectId, findingId, targetEndpoint, mode = 'repair', branch = 'main', isProduction = false, severity = 'MEDIUM' } = req.body || {};
    if (!projectId) {
      return formatError(res, 400, 'MISSING_PROJECT_ID', 'projectId is required to trigger a run.', req);
    }

    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.workspaceId || (req.user && req.user.workspaceId) || 'ws_demo_primary';

    // Evaluate Phase 20 Governance Policies
    const policyResult = await evaluateGovernancePolicies({
      organizationId,
      workspaceId,
      branch,
      isProduction,
      severity,
      actor: req.user
    });

    if (policyResult.status === 'BLOCKED') {
      return formatError(res, 403, 'POLICY_VIOLATION_BLOCKED', policyResult.message || 'Run blocked by enterprise governance policy.', req, {
        details: policyResult.violations
      });
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    // Asynchronously dispatch run started webhook
    dispatchWebhookEvent({
      eventType: 'repair.started',
      organizationId,
      workspaceId,
      data: { runId, projectId, findingId, targetEndpoint, mode }
    }).catch(() => {});

    return formatResponse(res, {
      runId,
      projectId,
      status: 'QUEUED',
      mode,
      targetEndpoint: targetEndpoint || 'Auto-Detected Faulty Endpoint',
      policyDecision: policyResult.status,
      createdAt: new Date().toISOString()
    }, { statusCode: 201 });
  } catch (err) {
    return formatError(res, 500, 'RUN_TRIGGER_FAILED', err.message, req);
  }
});

/**
 * DELETE /api/v1/runs/:id (Cancel Run)
 */
router.delete('/:id', authenticate, requireApiKeyScope('runs:create'), async (req, res) => {
  try {
    const cancelled = await cancelRun(req.params.id);
    return formatResponse(res, { success: true, runId: req.params.id, status: 'CANCELLED' });
  } catch (err) {
    return formatError(res, 500, 'RUN_CANCEL_FAILED', err.message, req);
  }
});

module.exports = router;
