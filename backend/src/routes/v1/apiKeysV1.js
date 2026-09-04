/**
 * APIFIX AI — Public API v1: API Key Management
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const apiKeyService = require('../../services/apiKeyService');

const router = express.Router();

/**
 * GET /api/v1/api-keys
 */
router.get('/', authenticate, requireApiKeyScope('admin:all'), (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.query.workspaceId || req.workspaceId || 'ws_demo_primary';

    const keys = apiKeyService.listApiKeys({ organizationId, workspaceId });
    return formatResponse(res, keys);
  } catch (err) {
    return formatError(res, 500, 'API_KEYS_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/api-keys
 */
router.post('/', authenticate, requireApiKeyScope('admin:all'), async (req, res) => {
  try {
    const { name, scopes, role, expiresInDays, isTest } = req.body || {};
    const organizationId = req.body.organizationId || req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const workspaceId = req.body.workspaceId || req.workspaceId || (req.user && req.user.workspaceId) || 'ws_demo_primary';

    const result = await apiKeyService.createApiKey({
      name,
      organizationId,
      workspaceId,
      scopes,
      role,
      expiresInDays,
      isTest,
      actor: req.user
    });

    return formatResponse(res, result, { statusCode: 201, skipSecretScrub: true });
  } catch (err) {
    return formatError(res, 400, 'API_KEY_CREATION_FAILED', err.message, req);
  }
});

/**
 * DELETE /api/v1/api-keys/:id
 */
router.delete('/:id', authenticate, requireApiKeyScope('admin:all'), async (req, res) => {
  try {
    const result = await apiKeyService.revokeApiKey(req.params.id, req.user);
    return formatResponse(res, result);
  } catch (err) {
    return formatError(res, 400, 'API_KEY_REVOCATION_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/api-keys/:id/revoke
 */
router.post('/:id/revoke', authenticate, requireApiKeyScope('admin:all'), async (req, res) => {
  try {
    const result = await apiKeyService.revokeApiKey(req.params.id, req.user);
    return formatResponse(res, result);
  } catch (err) {
    return formatError(res, 400, 'API_KEY_REVOCATION_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/api-keys/:id/rotate
 */
router.post('/:id/rotate', authenticate, requireApiKeyScope('admin:all'), async (req, res) => {
  try {
    const result = await apiKeyService.rotateApiKey(req.params.id, req.user);
    return formatResponse(res, result, { skipSecretScrub: true });
  } catch (err) {
    return formatError(res, 400, 'API_KEY_ROTATION_FAILED', err.message, req);
  }
});

module.exports = router;
