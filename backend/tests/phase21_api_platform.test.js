/**
 * APIFIX AI — Phase 21: Versioned Public API Platform & Envelope Contracts Test Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');

const { app } = require('../src/server');
const apiKeyService = require('../src/services/apiKeyService');
const apiEnvelopeService = require('../src/services/apiEnvelopeService');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

let testServer = null;
let baseUrl = '';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'developer' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function api(method, endpointPath, { body, token, apiKey, headers = {} } = {}) {
  const reqHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
  if (apiKey) reqHeaders['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}${endpointPath}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return { status: res.status, headers: res.headers, data };
}

describe('Phase 21 — Versioned Public API Platform & Envelopes', () => {
  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  describe('1. Universal Response & Error Envelopes', () => {
    test('1.1 Should serialize success responses in uniform { data, meta } structure', () => {
      const payload = { id: 'item_1', name: 'Test Resource' };
      const envelope = apiEnvelopeService.wrapSuccess(payload, { durationMs: 12 });

      assert.equal(envelope.data.id, 'item_1');
      assert.ok(envelope.meta.requestId.startsWith('req_'));
      assert.ok(envelope.meta.timestamp);
      assert.equal(envelope.meta.version, '1.0.0');
      assert.equal(envelope.meta.durationMs, 12);
    });

    test('1.2 Should sanitize sensitive credentials inside response envelopes', () => {
      const payload = {
        serviceName: 'Titan Gateway',
        password: 'super_secret_password',
        githubToken: ['ghp', 'abcdef1234567890abcdef1234567890'].join('_')
      };
      const envelope = apiEnvelopeService.wrapSuccess(payload);

      assert.equal(envelope.data.serviceName, 'Titan Gateway');
      assert.ok(envelope.data.password.includes('REDACTED'));
      assert.ok(envelope.data.githubToken.includes('[REDACTED'));
    });

    test('1.3 Should serialize errors in uniform { error } structure', () => {
      const envelope = apiEnvelopeService.wrapError('RESOURCE_NOT_FOUND', 'The requested resource does not exist', {
        status: 404,
        details: { resourceId: 'res_123' },
        retryable: false
      });

      assert.equal(envelope.error.code, 'RESOURCE_NOT_FOUND');
      assert.equal(envelope.error.message, 'The requested resource does not exist');
      assert.equal(envelope.error.details.resourceId, 'res_123');
      assert.equal(envelope.error.retryable, false);
      assert.ok(envelope.error.requestId.startsWith('req_'));
    });

    test('1.4 Should support pagination metadata in success envelopes', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const envelope = apiEnvelopeService.wrapPaginated(items, {
        page: 2,
        limit: 10,
        totalItems: 50
      });

      assert.equal(envelope.data.length, 2);
      assert.equal(envelope.meta.page, 2);
      assert.equal(envelope.meta.limit, 10);
      assert.equal(envelope.meta.totalItems, 50);
      assert.equal(envelope.meta.totalPages, 5);
      assert.equal(envelope.meta.hasNextPage, true);
      assert.equal(envelope.meta.hasPrevPage, true);
    });
  });

  describe('2. Enterprise API Key Lifecycle & Scopes', () => {
    let createdKey = null;

    test('2.1 Should generate scoped live API key and return raw secret once', async () => {
      const result = await apiKeyService.createApiKey({
        name: 'Automated CI Key',
        orgId: 'org_enterprise_primary',
        workspaceId: 'ws_default',
        userId: 'usr_admin',
        scopes: ['read:projects', 'write:runs', 'verify:all'],
        environment: 'live'
      });

      assert.ok(result.keyId.startsWith('key_'));
      assert.ok(result.rawKey.startsWith('apifix_live_'));
      assert.ok(result.prefix.startsWith(result.rawKey.substring(0, 12)));
      assert.ok(result.scopes.includes('read:projects') || result.scopes.includes('projects:read'));
      assert.ok(result.scopes.includes('verify:all') || result.scopes.includes('repairs:execute'));
      assert.equal(result.status, 'ACTIVE');

      createdKey = result;
    });

    test('2.2 Should validate valid API key and return tenant context', async () => {
      const validation = await apiKeyService.validateApiKey(createdKey.rawKey);

      assert.equal(validation.valid, true);
      assert.equal(validation.keyRecord.id, createdKey.keyId);
      assert.equal(validation.keyRecord.orgId, 'org_enterprise_primary');
      assert.ok(validation.keyRecord.scopes.includes('write:runs'));
    });

    test('2.3 Should reject invalid / spoofed API key', async () => {
      const validation = await apiKeyService.validateApiKey('apifix_live_invalidkey1234567890');
      assert.equal(validation.valid, false);
      assert.equal(validation.reason, 'KEY_NOT_FOUND');
    });

    test('2.4 Should enforce required scopes on API key authentication', async () => {
      const hasRead = apiKeyService.hasRequiredScopes(createdKey.scopes, ['read:projects']);
      const hasAdmin = apiKeyService.hasRequiredScopes(createdKey.scopes, ['admin:all']);

      assert.equal(hasRead, true);
      assert.equal(hasAdmin, false);
    });

    test('2.5 Should revoke API key and reject future authentication', async () => {
      const revoked = await apiKeyService.revokeApiKey(createdKey.keyId, 'usr_admin');
      assert.equal(revoked.status, 'REVOKED');

      const validation = await apiKeyService.validateApiKey(createdKey.rawKey);
      assert.equal(validation.valid, false);
      assert.equal(validation.reason, 'KEY_REVOKED');
    });

    test('2.6 Should rotate API key, generating new secret and revoking old', async () => {
      const key2 = await apiKeyService.createApiKey({
        name: 'Rotation Target',
        orgId: 'org_enterprise_primary',
        workspaceId: 'ws_default',
        userId: 'usr_admin',
        scopes: ['read:all']
      });

      const rotated = await apiKeyService.rotateApiKey(key2.keyId, 'usr_admin');
      assert.ok(rotated.newKey.rawKey.startsWith('apifix_live_'));
      assert.notEqual(rotated.newKey.rawKey, key2.rawKey);

      // Old key should be revoked
      const oldValidation = await apiKeyService.validateApiKey(key2.rawKey);
      assert.equal(oldValidation.valid, false);
      assert.equal(oldValidation.reason, 'KEY_REVOKED');

      // New key should be valid
      const newValidation = await apiKeyService.validateApiKey(rotated.newKey.rawKey);
      assert.equal(newValidation.valid, true);
    });
  });

  describe('3. Public API v1 Endpoints & OpenAPI Documentation', () => {
    let authHeaderKey = null;

    before(async () => {
      const key = await apiKeyService.createApiKey({
        name: 'V1 Test Key',
        orgId: 'org_enterprise_primary',
        workspaceId: 'ws_default',
        userId: 'usr_admin',
        scopes: ['admin:all', 'read:all', 'write:all', 'verify:all']
      });
      authHeaderKey = key.rawKey;
    });

    test('3.1 Should return public system health at /status', async () => {
      const res = await api('GET', '/status');
      assert.equal(res.status, 200);
      assert.ok(['OPERATIONAL', 'DEGRADED'].includes(res.data?.data?.status || res.data?.status));
      assert.ok(res.data.data.components.api_engine);
    });

    test('3.2 Should return OpenAPI 3.1 schema at /openapi.json', async () => {
      const res = await api('GET', '/openapi.json');
      assert.equal(res.status, 200);
      assert.equal(res.data.openapi, '3.1.0');
      assert.equal(res.data.info.title, 'APIFIX AI Enterprise API');
      assert.ok(res.data.paths['/api/v1/projects']);
      assert.ok(res.data.paths['/api/v1/verification/verify']);
    });

    test('3.3 Should query /api/v1/projects with API key auth and get uniform envelope', async () => {
      const res = await api('GET', '/api/v1/projects', { apiKey: authHeaderKey });
      assert.equal(res.status, 200);
      assert.ok(res.data.data);
      assert.ok(Array.isArray(res.data.data.items || res.data.data));
      assert.ok(res.data.meta.requestId);
    });

    test('3.4 Should execute continuous verification gate via /api/v1/verification/verify', async () => {
      const res = await api('POST', '/api/v1/verification/verify', {
        apiKey: authHeaderKey,
        body: { projectId: 'proj_enterprise_api_gateway' }
      });
      assert.equal(res.status, 200);
      assert.ok(res.data.data.projectId);
      assert.equal(res.data.data.passed, true);
    });

    test('3.5 Should return uniform 401 envelope when API key is missing on protected endpoint', async () => {
      const res = await api('GET', '/api/v1/projects');
      assert.equal(res.status, 401);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
      assert.ok(res.data.error.requestId);
    });

    test('3.6 Should return uniform 403 envelope when API key lacks required scope', async () => {
      const limitedKey = await apiKeyService.createApiKey({
        name: 'Limited Scope Key',
        orgId: 'org_enterprise_primary',
        workspaceId: 'ws_default',
        userId: 'usr_admin',
        scopes: ['read:projects']
      });

      // Attempt to invoke repair apply (which requires write:repairs)
      const res = await api('POST', '/api/v1/repairs/apply', {
        apiKey: limitedKey.rawKey,
        body: { projectId: 'proj_1', patchId: 'patch_1' }
      });

      assert.equal(res.status, 403);
      assert.ok(res.data.error.code.includes('SCOPE'));
    });
  });
});
