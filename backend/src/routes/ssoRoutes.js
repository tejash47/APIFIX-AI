/**
 * APIFIX AI — Enterprise SSO Routes
 * 
 * Handles SSO configuration, provider setup, and callback authentication / JIT provisioning.
 */

const express = require('express');
const identityProviderService = require('../services/identityProviderService');
const { authenticate, requirePermission } = require('../middleware/authMiddleware');
const { formatResponse, formatError } = require('../services/apiEnvelopeService');

const router = express.Router();

/**
 * Configure SSO for Organization
 * POST /api/sso/configure
 */
router.post('/configure', authenticate, requirePermission('org:write'), async (req, res) => {
  try {
    const { providerType, issuerUrl, clientId, clientSecret, roleMappings, defaultRole, enabled } = req.body || {};
    const organizationId = req.body.organizationId || req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';

    const config = await identityProviderService.configureSso({
      organizationId,
      providerType,
      issuerUrl,
      clientId,
      clientSecret,
      roleMappings,
      defaultRole,
      enabled,
      actor: req.user
    });

    return formatResponse(res, config, { statusCode: 200 });
  } catch (err) {
    return formatError(res, 400, 'SSO_CONFIG_ERROR', err.message, req);
  }
});

/**
 * Get SSO Configuration for Organization
 * GET /api/sso/config
 */
router.get('/config', authenticate, async (req, res) => {
  try {
    const organizationId = req.query.organizationId || req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const config = identityProviderService.getSsoConfig(organizationId);

    if (!config) {
      return formatResponse(res, { enabled: false, message: 'SSO not configured for organization.' });
    }

    return formatResponse(res, config);
  } catch (err) {
    return formatError(res, 500, 'SSO_FETCH_ERROR', err.message, req);
  }
});

/**
 * Process SSO Login / Callback Assertion
 * POST /api/sso/callback
 */
router.post('/callback', async (req, res) => {
  try {
    const { organizationId, idpUserId, email, name, groups } = req.body || {};
    if (!organizationId || !email) {
      return formatError(res, 400, 'INVALID_SSO_CALLBACK', 'organizationId and email claims are required.', req);
    }

    const result = await identityProviderService.processSsoCallback({
      organizationId,
      idpUserId,
      email,
      name,
      groups: groups || []
    });

    return formatResponse(res, result, { statusCode: 200 });
  } catch (err) {
    return formatError(res, 401, 'SSO_AUTH_FAILED', err.message, req);
  }
});

module.exports = router;
