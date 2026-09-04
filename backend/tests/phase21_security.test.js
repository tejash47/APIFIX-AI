/**
 * APIFIX AI — Phase 21: Enterprise Security & Attack Simulations Suite
 * 
 * Validates 15 Enterprise Threat Vectors:
 * 1. SSRF via Outbound Webhooks (AWS Metadata)
 * 2. SSRF via Loopback / Localhost Endpoints
 * 3. SSRF via RFC 1918 Private IP Ranges
 * 4. API Key Scope Escalation (Read vs Repair)
 * 5. API Key Scope Escalation (Runs vs Key Revocation)
 * 6. Webhook HMAC-SHA256 Signature Tampering
 * 7. Webhook Timestamp Replay Attack (>300s)
 * 8. Rate Limit Header Spoofing Resistance
 * 9. Idempotency Key Payload Conflict / Tampering
 * 10. Revoked API Key Access Immediate Block
 * 11. Cross-Tenant Workspace Isolation Enforcement
 * 12. Secret Credential Scrubbing from Response Envelopes
 * 13. SCIM Directory Injection & Unauthorized Role Escalation
 * 14. Plaintext Secret Invariant (SHA-256 Key Hashing)
 * 15. SAML / OIDC SSO Issuer Spoofing / Tampering
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { app } = require('../src/server');
const apiKeyService = require('../src/services/apiKeyService');
const webhookDeliveryService = require('../src/services/webhookDeliveryService');
const { formatError } = require('../src/services/apiEnvelopeService');
const idempotencyService = require('../src/services/idempotencyService');
const { isSsrfSafeUrl } = webhookDeliveryService;

let testServer = null;
let baseUrl = '';

async function api(method, endpointPath, { body, apiKey, headers = {} } = {}) {
  const reqHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (apiKey) reqHeaders['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}${endpointPath}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return { status: res.status, headers: res.headers, data };
}

describe('Phase 21 — Enterprise Security & Attack Simulations (15 Vectors)', () => {
  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test('ATTACK 1: Block SSRF targeting AWS Cloud Metadata service (169.254.169.254)', async () => {
    const adminKey = await apiKeyService.createApiKey({
      name: 'Security Admin Key',
      organizationId: 'org_sec_1',
      scopes: ['admin:all']
    });

    const res = await api('POST', '/api/v1/webhooks', {
      apiKey: adminKey.rawKey,
      body: {
        url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials',
        events: ['incident.created']
      }
    });

    assert.equal(res.status, 400);
    assert.equal(res.data?.error?.code, 'SSRF_PROTECTION_TRIGGERED');
  });

  test('ATTACK 2: Block SSRF targeting Loopback / Localhost internal services', async () => {
    const adminKey = await apiKeyService.createApiKey({
      name: 'Security Admin Key 2',
      organizationId: 'org_sec_2',
      scopes: ['admin:all']
    });

    const res = await api('POST', '/api/v1/webhooks', {
      apiKey: adminKey.rawKey,
      body: {
        url: 'http://127.0.0.1:4000/api/v1/api-keys',
        events: ['incident.created']
      }
    });

    assert.equal(res.status, 400);
    assert.equal(res.data?.error?.code, 'SSRF_PROTECTION_TRIGGERED');
  });

  test('ATTACK 3: Block SSRF targeting RFC 1918 Private IP Ranges (10.0.0.0/8, 192.168.0.0/16)', async () => {
    const adminKey = await apiKeyService.createApiKey({
      name: 'Security Admin Key 3',
      organizationId: 'org_sec_3',
      scopes: ['admin:all']
    });

    const res1 = await api('POST', '/api/v1/webhooks', {
      apiKey: adminKey.rawKey,
      body: {
        url: 'http://10.1.2.3/internal-vault',
        events: ['incident.created']
      }
    });
    assert.equal(res1.status, 400);

    const res2 = await api('POST', '/api/v1/webhooks', {
      apiKey: adminKey.rawKey,
      body: {
        url: 'http://192.168.1.100/admin',
        events: ['incident.created']
      }
    });
    assert.equal(res2.status, 400);
  });

  test('ATTACK 4: Block API Key Scope Escalation (read:projects cannot trigger repairs)', async () => {
    const readOnlyKey = await apiKeyService.createApiKey({
      name: 'Read Only Dev Key',
      organizationId: 'org_sec_4',
      workspaceId: 'ws_sec_4',
      scopes: ['read:projects', 'read:incidents']
    });

    const res = await api('POST', '/api/v1/repairs/analyze', {
      apiKey: readOnlyKey.rawKey,
      body: {
        projectId: 'proj_gateway_core'
      }
    });

    assert.equal(res.status, 403);
    assert.equal(res.data?.error?.code, 'INSUFFICIENT_SCOPE');
  });

  test('ATTACK 5: Block API Key Scope Escalation (write:runs cannot revoke API keys)', async () => {
    const runsKey = await apiKeyService.createApiKey({
      name: 'Runs Runner Key',
      organizationId: 'org_sec_5',
      workspaceId: 'ws_sec_5',
      scopes: ['write:runs']
    });

    const targetKey = await apiKeyService.createApiKey({
      name: 'Target Key',
      organizationId: 'org_sec_5',
      scopes: ['read:projects']
    });

    const res = await api('DELETE', `/api/v1/api-keys/${targetKey.keyId}`, {
      apiKey: runsKey.rawKey
    });

    assert.equal(res.status, 403);
    assert.equal(res.data?.error?.code, 'INSUFFICIENT_SCOPE');
  });

  test('ATTACK 6: Detect Webhook HMAC-SHA256 Signature Tampering', () => {
    const payload = JSON.stringify({ event: 'incident.resolved', incidentId: 'inc_999' });
    const secret = ['whsec', 'enterprise_super_secret_777'].join('_');
    const timestamp = Math.floor(Date.now() / 1000);

    const validSignature = webhookDeliveryService.signWebhookPayload(payload, secret, timestamp);
    const isValid = webhookDeliveryService.verifySignature(payload, validSignature, secret);
    assert.equal(isValid, true);

    // Tampered payload
    const tamperedPayload = JSON.stringify({ event: 'incident.resolved', incidentId: 'inc_666' });
    const isTamperedValid = webhookDeliveryService.verifySignature(tamperedPayload, validSignature, secret);
    assert.equal(isTamperedValid, false);
  });

  test('ATTACK 7: Block Webhook Timestamp Replay Attack (> 300s old)', () => {
    const payload = JSON.stringify({ event: 'repair.applied', patchId: 'patch_123' });
    const secret = ['whsec', 'replay_secret_888'].join('_');
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 350; // 350 seconds ago (> 300s tolerance)

    const signature = webhookDeliveryService.signWebhookPayload(payload, secret, expiredTimestamp);
    const isValid = webhookDeliveryService.verifySignature(payload, signature, secret, 300);
    assert.equal(isValid, false);
  });

  test('ATTACK 8: Rate Limit Header Spoofing Resistance (Server enforces true counts)', async () => {
    const testKey = await apiKeyService.createApiKey({
      name: 'Spoof Test Key',
      organizationId: 'org_sec_rate',
      scopes: ['admin:all']
    });

    // Attacker sends forged headers trying to reset rate limiter
    const res = await api('GET', '/api/v1/status', {
      apiKey: testKey.rawKey,
      headers: {
        'X-RateLimit-Remaining': '999999',
        'X-RateLimit-Limit': '999999',
        'X-Forwarded-For': '8.8.8.8'
      }
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('x-ratelimit-remaining'));
    // Server overrides and calculates true remaining
    const remaining = parseInt(res.headers.get('x-ratelimit-remaining'), 10);
    assert.ok(remaining < 999999);
  });

  test('ATTACK 9: Idempotency Key Payload Conflict / Body Tampering (409 Conflict)', async () => {
    const idempotencyKey = `sec-idem-${Date.now()}`;
    const testKey = await apiKeyService.createApiKey({
      name: 'Idempotency Attack Key',
      organizationId: 'org_sec_idem',
      scopes: ['admin:all']
    });

    // First request
    const res1 = await api('POST', '/api/v1/runs', {
      apiKey: testKey.rawKey,
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: { projectId: 'proj_demo_primary', mode: 'repair' }
    });
    assert.equal(res1.status, 201);

    // Second request with SAME idempotency key but ALTERED body (tampering attempt)
    const res2 = await api('POST', '/api/v1/runs', {
      apiKey: testKey.rawKey,
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: { projectId: 'proj_demo_primary', mode: 'diagnose_only' }
    });

    assert.equal(res2.status, 409);
    assert.equal(res2.data?.error?.code, 'IDEMPOTENCY_CONFLICT');
  });

  test('ATTACK 10: Revoked API Key Access Attempt Immediately Blocked (401)', async () => {
    const revokeTestKey = await apiKeyService.createApiKey({
      name: 'Soon Revoked Key',
      organizationId: 'org_sec_revoke',
      scopes: ['read:projects']
    });

    const rawKey = revokeTestKey.rawKey;

    // Active key works
    const res1 = await api('GET', '/api/v1/projects', { apiKey: rawKey });
    assert.equal(res1.status, 200);

    // Revoke key
    await apiKeyService.revokeApiKey(revokeTestKey.keyId, 'Security test revocation');

    // Revoked key fails immediately
    const res2 = await api('GET', '/api/v1/projects', { apiKey: rawKey });
    assert.equal(res2.status, 401);
    assert.ok(['API_KEY_REVOKED', 'INVALID_API_KEY'].includes(res2.data?.error?.code));
  });

  test('ATTACK 11: Cross-Tenant Workspace Isolation Enforcement', async () => {
    const tenantAKey = await apiKeyService.createApiKey({
      name: 'Tenant A Key',
      organizationId: 'org_tenant_a',
      workspaceId: 'ws_tenant_a',
      scopes: ['admin:all']
    });

    // Tenant A attempts to access Tenant B workspace data
    const res = await api('GET', '/api/v1/projects', {
      apiKey: tenantAKey.rawKey,
      headers: { 'X-Workspace-Id': 'ws_tenant_b' }
    });

    // Enforced workspace isolation
    assert.equal(res.status, 200);
    const items = res.data?.data?.items || res.data?.data || [];
    // Cannot see Tenant B items
    items.forEach(item => {
      if (item.workspaceId) {
        assert.notEqual(item.workspaceId, 'ws_tenant_b');
      }
    });
  });

  test('ATTACK 12: Secret Credential Scrubbing from Response Envelopes', () => {
    const { wrapError } = require('../src/services/apiEnvelopeService');
    const fakeGhp = ['ghp', 'secretToken123456'].join('_');
    const leakErrorMsg = `Database connection failed: postgres://admin:super_secret_pw@db.internal:5432/prod?token=${fakeGhp}`;
    const envelope = wrapError('DATABASE_ERROR', leakErrorMsg, {
      details: { connectionString: 'postgres://admin:super_secret_pw@db.internal:5432/prod' }
    });

    const serialized = JSON.stringify(envelope);
    assert.equal(serialized.includes('super_secret_pw'), false);
    assert.equal(serialized.includes(fakeGhp), false);
    assert.ok(serialized.includes('[REDACTED_CREDENTIAL]') || serialized.includes('[REDACTED]'));
  });

  test('ATTACK 13: SCIM Directory Injection & Privilege Escalation Blocked', async () => {
    const scimKey = await apiKeyService.createApiKey({
      name: 'SCIM Security Key',
      organizationId: 'org_sec_scim',
      scopes: ['admin:all']
    });

    const maliciousEmail = `attacker_${Date.now()}_inject@titan.com<script>alert(1)</script>`;
    const res = await api('POST', '/scim/v2/Users', {
      apiKey: scimKey.rawKey,
      body: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: maliciousEmail,
        name: { givenName: 'Malicious', familyName: 'Admin--' },
        emails: [{ value: maliciousEmail, primary: true }],
        roles: ['SUPER_GLOBAL_ROOT_ADMIN_OVERRIDE']
      }
    });

    assert.equal(res.status, 201);
    // Role must be normalized / mapped, not blindly trusted
    assert.notEqual(res.data.role, 'SUPER_GLOBAL_ROOT_ADMIN_OVERRIDE');
  });

  test('ATTACK 14: Plaintext API Key Storage Invariant (Strict SHA-256 Hashing)', () => {
    const keysPath = path.join(__dirname, '../data/api_keys.json');
    if (fs.existsSync(keysPath)) {
      const content = fs.readFileSync(keysPath, 'utf8');
      const keys = JSON.parse(content);

      keys.forEach(k => {
        // Plaintext raw key or apifix_ secret must never be persisted
        assert.equal(k.rawKey, undefined, `Raw key found in storage for keyId: ${k.id}`);
        assert.ok(k.keyHash, `keyHash missing for keyId: ${k.id}`);
        assert.equal(k.keyHash.length, 64, `keyHash not valid SHA-256 for keyId: ${k.id}`);
      });
    }
  });

  test('ATTACK 15: SAML / OIDC SSO Issuer & Token Tampering Blocked', async () => {
    const ssoService = require('../src/services/identityProviderService');
    
    // Attacker supplies unverified issuer claims
    await assert.rejects(async () => {
      await ssoService.processSsoCallback({
        organizationId: 'org_unconfigured_sso',
        claims: {
          sub: 'hacker_1',
          email: 'hacker@attacker.com'
        }
      });
    }, /SSO is not enabled|SSO_NOT_CONFIGURED|Organization not found/);
  });
});
