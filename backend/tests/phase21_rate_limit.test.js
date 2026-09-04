/**
 * APIFIX AI — Phase 21: Hierarchical Rate Limiting & Quota Test Suite
 * 
 * Validates 4-tier limits (Org -> Workspace -> Key -> Endpoint),
 * X-RateLimit headers, 429 RATE_LIMIT_EXCEEDED, and sliding window resets.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { app } = require('../src/server');
const apiKeyService = require('../src/services/apiKeyService');
const {
  checkWindowLimit,
  evaluateHierarchicalRateLimit,
  resetRateLimiter,
  DEFAULT_TIER_LIMITS
} = require('../src/services/hierarchicalRateLimiter');

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

describe('Phase 21 — Hierarchical Rate Limiting & Quotas', () => {
  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    baseUrl = `http://localhost:${port}`;

    const key = await apiKeyService.createApiKey({
      name: 'Rate Limit Test Key',
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

  beforeEach(() => {
    resetRateLimiter();
  });

  describe('1. Sliding Window Unit Rate Limiting', () => {
    test('1.1 Should decrement remaining counts within sliding window', () => {
      const key = 'test_unit_counter';
      const limit = 5;

      for (let i = 1; i <= 5; i++) {
        const check = checkWindowLimit(key, limit, 10000);
        assert.equal(check.allowed, true);
        assert.equal(check.remaining, limit - i);
      }

      // 6th request exceeds limit
      const blockedCheck = checkWindowLimit(key, limit, 10000);
      assert.equal(blockedCheck.allowed, false);
      assert.equal(blockedCheck.remaining, 0);
      assert.ok(blockedCheck.retryAfterSeconds > 0);
    });

    test('1.2 Should evaluate hierarchical chain (Org -> Workspace -> Key -> Endpoint)', () => {
      // Consume endpoint mutation limit (limit: 30)
      for (let i = 0; i < DEFAULT_TIER_LIMITS.ENDPOINT_MUTATION; i++) {
        const check = evaluateHierarchicalRateLimit({
          organizationId: 'org_1',
          workspaceId: 'ws_1',
          apiKeyId: 'key_1',
          method: 'POST',
          pathUrl: '/api/v1/runs'
        });
        assert.equal(check.allowed, true);
      }

      // Next mutation should be blocked at ENDPOINT tier
      const blocked = evaluateHierarchicalRateLimit({
        organizationId: 'org_1',
        workspaceId: 'ws_1',
        apiKeyId: 'key_1',
        method: 'POST',
        pathUrl: '/api/v1/runs'
      });

      assert.equal(blocked.allowed, false);
      assert.equal(blocked.level, 'ENDPOINT');
    });
  });

  describe('2. HTTP Rate Limiting Headers & 429 Enforcement', () => {
    test('2.1 Should attach X-RateLimit headers to responses', async () => {
      const res = await api('GET', '/api/v1/projects', { apiKey: authApiKey });
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('x-ratelimit-limit'));
      assert.ok(res.headers.get('x-ratelimit-remaining'));
    });

    test('2.2 Should return HTTP 429 and Retry-After when rate limit is exceeded', async () => {
      // Artificially trigger limit on key
      const keyRecord = await apiKeyService.validateApiKey(authApiKey);
      const keyId = keyRecord.key.id;

      // Exhaust limit
      for (let i = 0; i < DEFAULT_TIER_LIMITS.API_KEY + 2; i++) {
        checkWindowLimit(`key:${keyId}`, DEFAULT_TIER_LIMITS.API_KEY);
      }

      const res = await api('GET', '/api/v1/projects', { apiKey: authApiKey });
      assert.equal(res.status, 429);
      assert.ok(res.headers.get('retry-after'));
      assert.equal(res.data.error.code, 'RATE_LIMIT_EXCEEDED');
      assert.equal(res.data.error.retryable, true);
    });
  });
});
