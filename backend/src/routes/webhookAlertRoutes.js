const express = require('express');
const { authenticate, requireWorkspaceAccess } = require('../middleware/authMiddleware');
const inboundWebhookService = require('../services/inboundWebhookService');
const syntheticProberService = require('../services/syntheticProberService');
const alertDispatcher = require('../services/alertDispatcher');
const remediationPolicyEngine = require('../services/remediationPolicyEngine');
const logger = require('../services/logger');

const router = express.Router({ mergeParams: true });

// =========================================================================
// 1. INBOUND WEBHOOK CONFIGURATION & INGESTION
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/webhooks/inbound/config
 * Retrieves inbound webhook config, URL and masked secret
 */
router.get('/webhooks/inbound/config', authenticate, requireWorkspaceAccess(), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const config = await inboundWebhookService.getWebhookConfig(workspaceId);
    return res.json({ config });
  } catch (err) {
    logger.error('get_webhook_config_error', { workspaceId, error: err.message });
    return res.status(500).json({ error: { code: 'CONFIG_ERROR', message: err.message } });
  }
});

/**
 * POST /api/workspaces/:workspaceId/webhooks/inbound/rotate-secret
 * Rotates the HMAC webhook secret (requires OWNER or ADMIN)
 */
router.post('/webhooks/inbound/rotate-secret', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const config = await inboundWebhookService.rotateWebhookSecret(workspaceId, req.user.id);
    return res.json({ config, message: 'Webhook secret successfully rotated.' });
  } catch (err) {
    logger.error('rotate_webhook_secret_error', { workspaceId, error: err.message });
    return res.status(500).json({ error: { code: 'ROTATION_ERROR', message: err.message } });
  }
});

/**
 * POST /api/workspaces/:workspaceId/webhooks/inbound
 * Public endpoint for receiving external monitoring alert webhooks (DataDog, Sentry, PagerDuty, generic)
 * Requires cryptographic HMAC SHA-256 signature in X-APIFIX-Signature or X-Hub-Signature-256 header.
 */
router.post('/webhooks/inbound', async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const signature = req.headers['x-apifix-signature'] ||
    req.headers['x-hub-signature-256'] ||
    req.headers['x-signature-256'] ||
    req.headers['x-signature'];

  try {
    const config = await inboundWebhookService.getWebhookConfig(workspaceId);

    // If signature header is provided, strictly verify HMAC
    if (signature) {
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const isValid = inboundWebhookService.verifyWebhookSignature(rawBody, signature, config.secret);

      if (!isValid) {
        logger.warn('inbound_webhook_invalid_signature', { workspaceId, signature });
        return res.status(401).json({
          error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed.' }
        });
      }
    } else {
      // Allow unauthenticated local test simulations if configured, else require signature
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({
          error: { code: 'MISSING_SIGNATURE', message: 'X-APIFIX-Signature header is required in production.' }
        });
      }
    }

    const result = await inboundWebhookService.processInboundAlert(workspaceId, req.body);

    // Dispatch outbound alert to configured workspace channels
    alertDispatcher.dispatchWorkspaceAlert(workspaceId, 'incident.created', {
      incidentId: result.incident.id,
      targetEndpoint: result.normalized.targetEndpoint,
      severity: result.normalized.severity,
      message: result.normalized.title,
      summary: result.normalized.errorSignature
    }).catch(err => logger.error('alert_dispatch_failed', { error: err.message }));

    return res.status(202).json({
      received: true,
      incidentId: result.incident.id,
      targetEndpoint: result.normalized.targetEndpoint,
      severity: result.normalized.severity,
      status: 'TRIAGED'
    });
  } catch (err) {
    logger.error('inbound_webhook_processing_failed', { workspaceId, error: err.message });
    return res.status(500).json({ error: { code: 'PROCESSING_ERROR', message: err.message } });
  }
});

// =========================================================================
// 2. MULTI-CHANNEL ALERT NOTIFICATION CHANNELS
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/alerts/channels
 * Lists configured alert channels
 */
router.get('/alerts/channels', authenticate, requireWorkspaceAccess(), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const channels = alertDispatcher.listAlertChannels(workspaceId);
    return res.json({ channels });
  } catch (err) {
    return res.status(500).json({ error: { code: 'CHANNEL_LIST_ERROR', message: err.message } });
  }
});

/**
 * POST /api/workspaces/:workspaceId/alerts/channels
 * Adds a new alert channel (requires OWNER or ADMIN)
 */
router.post('/alerts/channels', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const channel = alertDispatcher.addAlertChannel(workspaceId, {
      ...req.body,
      actorId: req.user.id
    });
    return res.status(201).json({ channel });
  } catch (err) {
    return res.status(400).json({ error: { code: 'CHANNEL_CREATE_ERROR', message: err.message } });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/alerts/channels/:channelId
 * Deletes an alert channel (requires OWNER or ADMIN)
 */
router.delete('/alerts/channels/:channelId', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const result = alertDispatcher.removeAlertChannel(workspaceId, req.params.channelId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: { code: 'CHANNEL_DELETE_ERROR', message: err.message } });
  }
});

/**
 * POST /api/workspaces/:workspaceId/alerts/test
 * Sends an immediate test alert to a channel
 */
router.post('/alerts/test', authenticate, requireWorkspaceAccess(), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const { channelId } = req.body || {};
    if (!channelId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'channelId is required.' } });
    }

    const result = await alertDispatcher.sendTestAlert(workspaceId, channelId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: { code: 'TEST_ALERT_FAILED', message: err.message } });
  }
});

// =========================================================================
// 3. PROACTIVE SYNTHETIC CANARY PROBER
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/synthetic-prober
 * Gets synthetic canary prober configuration and uptime telemetry
 */
router.get('/synthetic-prober', authenticate, requireWorkspaceAccess(), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const config = syntheticProberService.getProberConfig(workspaceId);
    return res.json({ prober: config });
  } catch (err) {
    return res.status(500).json({ error: { code: 'PROBER_ERROR', message: err.message } });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId/synthetic-prober
 * Updates synthetic canary prober configuration (requires OWNER or ADMIN)
 */
router.patch('/synthetic-prober', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const updated = syntheticProberService.updateProberConfig(workspaceId, req.body);
    return res.json({ prober: updated });
  } catch (err) {
    return res.status(400).json({ error: { code: 'PROBER_UPDATE_ERROR', message: err.message } });
  }
});

/**
 * POST /api/workspaces/:workspaceId/synthetic-prober/probe-now
 * Runs an on-demand synthetic canary probe cycle immediately
 */
router.post('/synthetic-prober/probe-now', authenticate, requireWorkspaceAccess(), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const { baseUrl } = req.body || {};
    const result = await syntheticProberService.runProbeCycle(workspaceId, baseUrl);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: { code: 'PROBE_CYCLE_FAILED', message: err.message } });
  }
});

// =========================================================================
// 4. AUTONOMOUS REMEDIATION POLICY
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/remediation-policy
 * Gets the self-healing remediation policy for a workspace
 */
router.get('/remediation-policy', authenticate, requireWorkspaceAccess(), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const policy = remediationPolicyEngine.getRemediationPolicy(workspaceId);
    return res.json({ policy });
  } catch (err) {
    return res.status(500).json({ error: { code: 'POLICY_ERROR', message: err.message } });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId/remediation-policy
 * Updates remediation policy (requires OWNER or ADMIN)
 */
router.patch('/remediation-policy', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  const workspaceId = req.workspace?.id || req.params.workspaceId;
  try {
    const updated = remediationPolicyEngine.updateRemediationPolicy(workspaceId, req.body, req.user.id);
    return res.json({ policy: updated });
  } catch (err) {
    return res.status(400).json({ error: { code: 'POLICY_UPDATE_ERROR', message: err.message } });
  }
});

module.exports = router;
