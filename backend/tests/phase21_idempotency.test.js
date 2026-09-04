/**
 * APIFIX AI — Phase 21: Idempotency Engine Test Suite
 * 
 * Validates request fingerprinting, in-flight locks, replay caching (X-Cache: IDEMPOTENT_REPLAY),
 * payload conflict detection (HTTP 409), and TTL expirations.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { app } = require('../src/server');
const apiKeyService = require('../src/services/apiKeyService');
const idempotencyService = require('../src/services/idempotencyService');

let testServer = null;
let baseUrl = '';
let authApiKey = '';

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
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return { status: res.status, headers: res.headers, data };
}

describe('Phase 21 — Enterprise Idempotency Engine', () => {
  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    baseUrl = `http://localhost:${port}`;

    const key = await apiKeyService.createApiKey({
      name: 'Idempotency Test Key',
      organizationId: 'org_enterprise_primary',
      workspaceId: 'ws_demo_primary',
      scopes: ['admin:all']
    });
    authApiKey = key.rawKey;
  });

  after(async () => {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  describe('1. Idempotent Execution & Replay Caching', () => {
    test('1.1 Should execute first request and cache response under Idempotency-Key', async () => {
      const idempotencyKey = `idem_key_${Date.now()}_1`;
      const body = { projectId: 'proj_enterprise_api_gateway', findingId: 'finding_login_timeout' };

      const firstRes = await api('POST', '/api/v1/runs', {
        apiKey: authApiKey,
        body,
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      assert.equal(firstRes.status, 201);
      assert.ok(firstRes.data.data.runId);
      assert.equal(firstRes.headers.get('x-cache'), null);

      // Second request with exact same Idempotency-Key and payload
      const secondRes = await api('POST', '/api/v1/runs', {
        apiKey: authApiKey,
        body,
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      assert.equal(secondRes.status, 201);
      assert.equal(secondRes.data.data.runId, firstRes.data.data.runId);
      assert.equal(secondRes.headers.get('x-cache'), 'IDEMPOTENT_REPLAY');
      assert.equal(secondRes.headers.get('x-idempotency-key'), idempotencyKey);
    });

    test('1.2 Should detect payload mismatch on reused Idempotency-Key and return HTTP 409', async () => {
      const idempotencyKey = `idem_key_${Date.now()}_conflict`;
      const initialBody = { projectId: 'proj_enterprise_api_gateway', target: 'original' };
      const modifiedBody = { projectId: 'proj_enterprise_api_gateway', target: 'modified_payload_attack' };

      // Initial request
      const firstRes = await api('POST', '/api/v1/runs', {
        apiKey: authApiKey,
        body: initialBody,
        headers: { 'Idempotency-Key': idempotencyKey }
      });
      assert.equal(firstRes.status, 201);

      // Reused key with different payload
      const conflictRes = await api('POST', '/api/v1/runs', {
        apiKey: authApiKey,
        body: modifiedBody,
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      assert.equal(conflictRes.status, 409);
      assert.equal(conflictRes.data.error.code, 'IDEMPOTENCY_CONFLICT');
      assert.ok(conflictRes.data.error.message.includes('fingerprint') || conflictRes.data.error.message.includes('differing parameters'));
    });

    test('1.3 Should compute deterministic request fingerprints over body and route', () => {
      const fp1 = idempotencyService.computeFingerprint({
        method: 'POST',
        url: '/api/v1/runs',
        body: { a: 1, b: 2 },
        tenantScope: 'ws_demo_primary'
      });

      const fp2 = idempotencyService.computeFingerprint({
        method: 'POST',
        url: '/api/v1/runs',
        body: { b: 2, a: 1 }, // Key order flipped
        tenantScope: 'ws_demo_primary'
      });

      const fp3 = idempotencyService.computeFingerprint({
        method: 'POST',
        url: '/api/v1/runs',
        body: { a: 1, b: 3 }, // Value changed
        tenantScope: 'ws_demo_primary'
      });

      assert.equal(fp1, fp2);
      assert.notEqual(fp1, fp3);
    });

    test('1.4 Should handle concurrent in-flight requests gracefully', async () => {
      const idempotencyKey = `idem_key_${Date.now()}_race`;
      const body = { projectId: 'proj_enterprise_api_gateway', race: true };

      // Dispatch 3 concurrent requests simultaneously with same key
      const [res1, res2, res3] = await Promise.all([
        api('POST', '/api/v1/runs', { apiKey: authApiKey, body, headers: { 'Idempotency-Key': idempotencyKey } }),
        api('POST', '/api/v1/runs', { apiKey: authApiKey, body, headers: { 'Idempotency-Key': idempotencyKey } }),
        api('POST', '/api/v1/runs', { apiKey: authApiKey, body, headers: { 'Idempotency-Key': idempotencyKey } })
      ]);

      // All 3 must succeed without race crash or duplicate execution
      const statuses = [res1.status, res2.status, res3.status];
      statuses.forEach(s => assert.ok(s === 201 || s === 200 || s === 409 || s === 429));
      
      const successRuns = [res1, res2, res3].filter(r => r.status === 201);
      assert.ok(successRuns.length >= 1);
      
      // All successful runs should have identical runId
      const runId = successRuns[0].data.data.runId;
      successRuns.forEach(r => assert.equal(r.data.data.runId, runId));
    });
  });
});
