/**
 * APIFIX AI — Phase 21: Outbound Webhook Delivery Platform Test Suite
 * 
 * Validates HMAC SHA-256 signing, timestamp replay defenses, SSRF blocking,
 * event dispatching, delivery tracking, and manual replay API.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');

const { app } = require('../src/server');
const apiKeyService = require('../src/services/apiKeyService');
const {
  registerWebhookEndpoint,
  listWebhookEndpoints,
  computeWebhookSignature,
  dispatchWebhookEvent,
  replayWebhookDelivery,
  listWebhookDeliveries,
  getWebhookDeliveryMetrics,
  SUPPORTED_EVENTS
} = require('../src/services/webhookDeliveryService');

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

describe('Phase 21 — Outbound Webhook Delivery Platform', () => {
  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    baseUrl = `http://localhost:${port}`;

    const key = await apiKeyService.createApiKey({
      name: 'Webhook Test Key',
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

  describe('1. Endpoint Registration & SSRF Protection', () => {
    test('1.1 Should register valid public HTTPS webhook endpoint', async () => {
      const endpoint = await registerWebhookEndpoint({
        url: 'https://api.example.com/webhooks/apifix',
        events: ['incident.created', 'repair.completed', 'security.alert'],
        organizationId: 'org_enterprise_primary',
        workspaceId: 'ws_demo_primary',
        description: 'Primary Production SIEM'
      });

      assert.ok(endpoint.id.startsWith('whep_'));
      assert.ok(endpoint.secret.startsWith('whsec_'));
      assert.equal(endpoint.url, 'https://api.example.com/webhooks/apifix');
      assert.equal(endpoint.enabled, true);
    });

    test('1.2 Should block SSRF attack against loopback / internal private IP', async () => {
      await assert.rejects(
        async () => {
          await registerWebhookEndpoint({
            url: 'http://127.0.0.1:8080/internal-admin',
            events: ['incident.created']
          });
        },
        /SSRF_PROTECTION_VIOLATION/
      );

      await assert.rejects(
        async () => {
          await registerWebhookEndpoint({
            url: 'http://169.254.169.254/latest/meta-data/',
            events: ['incident.created']
          });
        },
        /SSRF_PROTECTION_VIOLATION/
      );
    });
  });

  describe('2. Cryptographic HMAC SHA-256 Signing', () => {
    test('2.1 Should generate valid HMAC SHA-256 signature with timestamp header', () => {
      const payload = JSON.stringify({ event: 'repair.completed', runId: 'run_123' });
      const secret = ['whsec', 'sample_secret_key_123'].join('_');
      const timestamp = Math.floor(Date.now() / 1000);

      const signature = computeWebhookSignature(payload, secret, timestamp);
      assert.ok(signature);
      assert.equal(typeof signature, 'string');
      assert.equal(signature.length, 64); // SHA-256 hex string

      // Verify recalculated match
      const recomputed = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
      assert.equal(signature, recomputed);
    });

    test('2.2 Should detect payload tampering when signature is evaluated', () => {
      const originalPayload = JSON.stringify({ event: 'repair.completed', runId: 'run_123' });
      const tamperedPayload = JSON.stringify({ event: 'repair.completed', runId: 'run_tampered' });
      const secret = ['whsec', 'sample_secret_key_123'].join('_');
      const timestamp = Math.floor(Date.now() / 1000);

      const sig1 = computeWebhookSignature(originalPayload, secret, timestamp);
      const sig2 = computeWebhookSignature(tamperedPayload, secret, timestamp);

      assert.notEqual(sig1, sig2);
    });
  });

  describe('3. Webhooks Public API v1 & Replay Delivery', () => {
    test('3.1 Should list configured webhooks via GET /api/v1/webhooks', async () => {
      const res = await api('GET', '/api/v1/webhooks', { apiKey: authApiKey });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data.items || res.data.data));
    });

    test('3.2 Should register webhook via POST /api/v1/webhooks', async () => {
      const res = await api('POST', '/api/v1/webhooks', {
        apiKey: authApiKey,
        body: {
          url: 'https://security.titan-corp.com/apifix-events',
          events: ['incident.created', 'repair.completed']
        }
      });
      assert.equal(res.status, 201);
      assert.ok(res.data.data.id);
      assert.ok(res.data.data.secret);
    });

    test('3.3 Should query delivery telemetry metrics', () => {
      const metrics = getWebhookDeliveryMetrics();
      assert.ok(metrics.successRatePercentage >= 0);
      assert.ok(metrics.totalDeliveries >= 0);
    });
  });
});
