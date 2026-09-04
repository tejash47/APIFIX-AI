/**
 * APIFIX AI — SCIM 2.0 Provisioning Router
 * 
 * Implements RFC 7644 SCIM 2.0 endpoints for Users, Groups, and Schema Discovery.
 */

const express = require('express');
const scimService = require('../services/scimService');
const { authenticate, requirePermission } = require('../middleware/authMiddleware');

const router = express.Router();

function scimError(res, status, detail, scimType = null) {
  res.setHeader('Content-Type', 'application/scim+json');
  return res.status(status).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: String(status),
    scimType,
    detail
  });
}

// Set SCIM Content-Type header for all responses
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/scim+json');
  next();
});

// Service Provider Config
router.get('/ServiceProviderConfig', (req, res) => {
  return res.status(200).json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: 'https://apifix.ai/docs/scim',
    patch: { supported: true },
    bulk: { supported: false },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        name: 'OAuth Bearer Token',
        description: 'Authentication Scheme using Bearer Token or API Key',
        specUri: 'http://www.rfc-editor.org/info/rfc6750',
        type: 'oauthbearertoken',
        primary: true
      }
    ]
  });
});

// Resource Schemas
router.get('/Schemas', (req, res) => {
  return res.status(200).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    Resources: [
      { id: 'urn:ietf:params:scim:schemas:core:2.0:User', name: 'User' },
      { id: 'urn:ietf:params:scim:schemas:core:2.0:Group', name: 'Group' }
    ]
  });
});

// List Users
router.get('/Users', authenticate, (req, res) => {
  try {
    const { startIndex, count, filter } = req.query;
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const result = scimService.listScimUsers({ startIndex, count, filter, organizationId });
    return res.status(200).json(result);
  } catch (err) {
    return scimError(res, 500, err.message);
  }
});

// Get User by ID
router.get('/Users/:id', authenticate, (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const user = scimService.getScimUser(req.params.id, organizationId);
    if (!user) return scimError(res, 404, `User ${req.params.id} not found.`);
    return res.status(200).json(user);
  } catch (err) {
    return scimError(res, 500, err.message);
  }
});

// Create User
router.post('/Users', authenticate, async (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const created = await scimService.createScimUser(req.body, organizationId, req.user);
    return res.status(201).json(created);
  } catch (err) {
    const status = err.message.includes('already exists') ? 409 : 400;
    return scimError(res, status, err.message, status === 409 ? 'uniqueness' : 'invalidValue');
  }
});

// Update User (PUT)
router.put('/Users/:id', authenticate, async (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const updated = await scimService.updateScimUser(req.params.id, req.body, organizationId, req.user);
    return res.status(200).json(updated);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    return scimError(res, status, err.message);
  }
});

// Patch User (PATCH)
router.patch('/Users/:id', authenticate, async (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const updates = {};
    if (req.body && Array.isArray(req.body.Operations)) {
      req.body.Operations.forEach(op => {
        if (op.path === 'active') updates.active = op.value;
        if (op.path === 'name') updates.name = op.value;
      });
    }
    const updated = await scimService.updateScimUser(req.params.id, updates, organizationId, req.user);
    return res.status(200).json(updated);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    return scimError(res, status, err.message);
  }
});

// Delete User (DELETE)
router.delete('/Users/:id', authenticate, async (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    await scimService.deleteScimUser(req.params.id, organizationId, req.user);
    return res.status(204).send();
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    return scimError(res, status, err.message);
  }
});

// List Groups
router.get('/Groups', authenticate, (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const groups = scimService.listScimGroups({ organizationId });
    return res.status(200).json(groups);
  } catch (err) {
    return scimError(res, 500, err.message);
  }
});

// Get Group by ID
router.get('/Groups/:id', authenticate, (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const group = scimService.getScimGroup(req.params.id, organizationId);
    if (!group) return scimError(res, 404, `Group ${req.params.id} not found.`);
    return res.status(200).json(group);
  } catch (err) {
    return scimError(res, 500, err.message);
  }
});

// Create Group
router.post('/Groups', authenticate, async (req, res) => {
  try {
    const organizationId = req.organizationId || (req.user && req.user.organizationId) || 'org_enterprise_primary';
    const created = await scimService.createScimGroup(req.body, organizationId, req.user);
    return res.status(201).json(created);
  } catch (err) {
    return scimError(res, 400, err.message);
  }
});

module.exports = router;
