/**
 * APIFIX AI — Public API v1: Outbound Webhooks & Delivery Management
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const webhookDeliveryService = require('../../services/webhookDeliveryService');

const router = express.Router();

/**
 * GET /api/v1/webhooks
 */
router.get('/', authenticate, requireApiKeyScope('webhooks:manage'), (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.query.workspaceId || req.workspaceId || 'ws_demo_primary';

    const endpoints = webhookDeliveryService.listWebhookEndpoints({ organizationId, workspaceId });
    return formatResponse(res, endpoints);
  } catch (err) {
    return formatError(res, 500, 'WEBHOOKS_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/webhooks
 */
router.post('/', authenticate, requireApiKeyScope('webhooks:manage'), async (req, res) => {
  try {
    const { url, events, description } = req.body || {};
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.workspaceId || (req.user && req.user.workspaceId) || 'ws_demo_primary';

    const result = await webhookDeliveryService.registerWebhookEndpoint({
      url,
      events,
      organizationId,
      workspaceId,
      description,
      actor: req.user
    });

    return formatResponse(res, result, { statusCode: 201, skipSecretScrub: true });
  } catch (err) {
    const isSsrf = err.message && err.message.includes('SSRF_PROTECTION_VIOLATION');
    return formatError(res, 400, isSsrf ? 'SSRF_PROTECTION_TRIGGERED' : 'WEBHOOK_REGISTRATION_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/webhooks/metrics
 */
router.get('/metrics', authenticate, requireApiKeyScope('webhooks:manage'), (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.workspaceId || (req.user && req.user.workspaceId) || 'ws_demo_primary';

    const metrics = webhookDeliveryService.getWebhookDeliveryMetrics({ organizationId, workspaceId });
    return formatResponse(res, metrics);
  } catch (err) {
    return formatError(res, 500, 'WEBHOOK_METRICS_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/webhooks/deliveries
 */
router.get('/deliveries', authenticate, requireApiKeyScope('webhooks:manage'), (req, res) => {
  try {
    const { endpointId, status, limit = 50 } = req.query;
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.workspaceId || (req.user && req.user.workspaceId) || 'ws_demo_primary';

    const deliveries = webhookDeliveryService.listWebhookDeliveries({
      organizationId,
      workspaceId,
      endpointId,
      status,
      limit: parseInt(limit, 10)
    });

    return formatResponse(res, deliveries);
  } catch (err) {
    return formatError(res, 500, 'DELIVERIES_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/webhooks/deliveries/:id/replay
 */
router.post('/deliveries/:id/replay', authenticate, requireApiKeyScope('webhooks:manage'), async (req, res) => {
  try {
    const replayResult = await webhookDeliveryService.replayWebhookDelivery(req.params.id, req.user);
    return formatResponse(res, replayResult);
  } catch (err) {
    return formatError(res, 400, 'WEBHOOK_REPLAY_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/webhooks/:id
 */
router.get('/:id', authenticate, requireApiKeyScope('webhooks:manage'), (req, res) => {
  try {
    const ep = webhookDeliveryService.getWebhookEndpoint(req.params.id);
    if (!ep) {
      return formatError(res, 404, 'WEBHOOK_NOT_FOUND', `Webhook ${req.params.id} not found.`, req);
    }
    return formatResponse(res, ep);
  } catch (err) {
    return formatError(res, 500, 'WEBHOOK_FETCH_FAILED', err.message, req);
  }
});

/**
 * PUT /api/v1/webhooks/:id
 */
router.put('/:id', authenticate, requireApiKeyScope('webhooks:manage'), async (req, res) => {
  try {
    const updated = await webhookDeliveryService.updateWebhookEndpoint(req.params.id, req.body, req.user);
    return formatResponse(res, updated);
  } catch (err) {
    return formatError(res, 400, 'WEBHOOK_UPDATE_FAILED', err.message, req);
  }
});

/**
 * DELETE /api/v1/webhooks/:id
 */
router.delete('/:id', authenticate, requireApiKeyScope('webhooks:manage'), async (req, res) => {
  try {
    const result = await webhookDeliveryService.deleteWebhookEndpoint(req.params.id, req.user);
    return formatResponse(res, result);
  } catch (err) {
    return formatError(res, 400, 'WEBHOOK_DELETE_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/webhooks/:id/test (Trigger Ping Test Delivery)
 */
router.post('/:id/test', authenticate, requireApiKeyScope('webhooks:manage'), async (req, res) => {
  try {
    const ep = webhookDeliveryService.getWebhookEndpoint(req.params.id);
    if (!ep) {
      return formatError(res, 404, 'WEBHOOK_NOT_FOUND', `Webhook ${req.params.id} not found.`, req);
    }

    const testDelivery = await webhookDeliveryService.executeDelivery(
      ep,
      'security.alert',
      ep.organizationId,
      ep.workspaceId,
      { testPing: true, message: 'APIFIX AI Webhook Verification Ping' }
    );

    return formatResponse(res, testDelivery);
  } catch (err) {
    return formatError(res, 500, 'WEBHOOK_TEST_FAILED', err.message, req);
  }
});

module.exports = router;
