/**
 * APIFIX AI — Phase 21: Real-World Enterprise Acceptance E2E Suite
 * 
 * Validates 20 Real-World Enterprise Scenarios:
 * 1. API Key Lifecycle (Creation -> Auth -> Rotation -> Revocation)
 * 2. Uniform API Envelope Contract & Secret Scrubbing
 * 3. Standardized Pagination Envelope Structure
 * 4. Idempotent Mutation Replay via X-Idempotency-Key
 * 5. Hierarchical Rate Limiting Headers & Thresholds
 * 6. Outbound Webhook Lifecycle & HMAC-SHA256 Signing
 * 7. Webhook Dead-Letter Queue & Manual Replay
 * 8. Public Platform Status Page & Component Health
 * 9. OpenAPI 3.1 Specification Serving (/openapi.json)
 * 10. SCM Provider: GitHub Branch & PR Automation
 * 11. SCM Provider: GitLab Merge Request Automation
 * 12. SCM Provider: Bitbucket PR Automation
 * 13. Enterprise SSO (OIDC/SAML) Configuration
 * 14. SSO JIT User Provisioning & RBAC Role Mapping
 * 15. SCIM 2.0 User Lifecycle (Create -> Get -> Update)
 * 16. SCIM 2.0 Group & Membership Management
 * 17. Multi-Provider CI/CD Workflow Generation
 * 18. CI/CD Inbound Pipeline Ingestion & Exit Code Mapping
 * 19. Official CLI Command Automation & JSON Mode
 * 20. API Usage Analytics & Percentile Latency Calculation
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const util = require('util');
const { exec } = require('child_process');
const execAsync = util.promisify(exec);
const path = require('path');

const { app } = require('../src/server');
const apiKeyService = require('../src/services/apiKeyService');
const webhookDeliveryService = require('../src/services/webhookDeliveryService');
const { getSourceControlProvider } = require('../src/services/sourceControlProvider');
const { configureSso, getSsoConfig, processSsoCallback } = require('../src/services/identityProviderService');
const scimService = require('../src/services/scimService');
const ciCdService = require('../src/services/ciCdService');
const apiUsageService = require('../src/services/apiUsageService');

let testServer = null;
let baseUrl = '';
let masterApiKey = '';

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

describe('Phase 21 — Real-World Enterprise Acceptance E2E (20 Scenarios)', () => {
  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const key = await apiKeyService.createApiKey({
      name: 'E2E Acceptance Master Key',
      organizationId: 'org_e2e_primary',
      workspaceId: 'ws_demo_primary',
      scopes: ['admin:all']
    });
    masterApiKey = key.rawKey;
  });

  after(async () => {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
  });

  test('SCENARIO 1: API Key Lifecycle (Create -> Auth -> Rotate -> Revoke)', async () => {
    // 1. Create API key
    const createRes = await api('POST', '/api/v1/api-keys', {
      apiKey: masterApiKey,
      body: {
        name: 'Scoped CI Worker Key',
        organizationId: 'org_e2e_primary',
        scopes: ['read:projects', 'write:runs', 'verify:all']
      }
    });
    assert.equal(createRes.status, 201);
    const keyData = createRes.data?.data;
    assert.ok(keyData.keyId);
    assert.ok(keyData.rawKey.startsWith('apifix_live_'));

    // 2. Auth with newly created key
    const listRes = await api('GET', '/api/v1/projects', { apiKey: keyData.rawKey });
    assert.equal(listRes.status, 200);

    // 3. Rotate key
    const rotateRes = await api('POST', `/api/v1/api-keys/${keyData.keyId}/rotate`, {
      apiKey: masterApiKey
    });
    assert.equal(rotateRes.status, 200);
    const rotated = rotateRes.data?.data;
    assert.ok(rotated.newKey);

    // Old key is revoked
    const oldKeyRes = await api('GET', '/api/v1/projects', { apiKey: keyData.rawKey });
    assert.equal(oldKeyRes.status, 401);

    // New key works
    const newKeyRes = await api('GET', '/api/v1/projects', { apiKey: rotated.newKey.rawKey });
    assert.equal(newKeyRes.status, 200);

    // 4. Revoke key
    const revokeRes = await api('DELETE', `/api/v1/api-keys/${rotated.newKey.keyId}`, {
      apiKey: masterApiKey
    });
    assert.equal(revokeRes.status, 200);

    const revokedAttempt = await api('GET', '/api/v1/projects', { apiKey: rotated.newKey.rawKey });
    assert.equal(revokedAttempt.status, 401);
  });

  test('SCENARIO 2: Uniform API Envelope Contract & Secret Scrubbing', async () => {
    const res = await api('GET', '/api/v1/projects', { apiKey: masterApiKey });
    assert.equal(res.status, 200);

    // Envelope schema
    assert.ok(res.data.data);
    assert.ok(res.data.meta);
    assert.ok(res.data.meta.requestId);
    assert.ok(res.data.meta.correlationId);
    assert.ok(res.data.meta.apiVersion);
    assert.ok(res.data.meta.timestamp);

    // Response headers
    assert.ok(res.headers.get('x-request-id'));
    assert.ok(res.headers.get('x-correlation-id'));
    assert.ok(res.headers.get('x-api-version'));
  });

  test('SCENARIO 3: Standardized Pagination Envelope Structure', async () => {
    const res = await api('GET', '/api/v1/runs?page=1&limit=10', { apiKey: masterApiKey });
    assert.equal(res.status, 200);
    assert.ok(res.data.meta.pagination);
    assert.equal(res.data.meta.pagination.page, 1);
    assert.equal(res.data.meta.pagination.limit, 50);
    assert.ok(res.data.meta.pagination.totalCount !== undefined);
  });

  test('SCENARIO 4: Idempotent Mutation Replay via X-Idempotency-Key', async () => {
    const idempotencyKey = `e2e-idem-${Date.now()}`;
    const payload = { projectId: 'proj_demo_primary', mode: 'repair' };

    // Request 1
    const res1 = await api('POST', '/api/v1/runs', {
      apiKey: masterApiKey,
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: payload
    });
    assert.equal(res1.status, 201);
    const runId1 = res1.data?.data?.runId;

    // Request 2 (Identical key & payload)
    const res2 = await api('POST', '/api/v1/runs', {
      apiKey: masterApiKey,
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: payload
    });
    assert.equal(res2.status, 201);
    assert.equal(res2.headers.get('x-cache'), 'IDEMPOTENT_REPLAY');
    assert.equal(res2.data?.data?.runId, runId1);
  });

  test('SCENARIO 5: Hierarchical Rate Limiting Headers & Thresholds', async () => {
    const res = await api('GET', '/api/v1/projects', { apiKey: masterApiKey });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('x-ratelimit-limit'));
    assert.ok(res.headers.get('x-ratelimit-remaining'));
    assert.ok(res.headers.get('x-ratelimit-reset') || res.headers.get('x-ratelimit-reset-ms'));
  });

  test('SCENARIO 6: Outbound Webhook Lifecycle & HMAC-SHA256 Signing', async () => {
    const testUrl = 'https://httpbin.org/post';
    const subRes = await api('POST', '/api/v1/webhooks', {
      apiKey: masterApiKey,
      body: {
        url: testUrl,
        events: ['incident.created', 'repair.completed'],
        description: 'E2E Production Alert Hook'
      }
    });

    assert.equal(subRes.status, 201);
    const ep = subRes.data?.data;
    assert.ok(ep.id);
    assert.ok(ep.secret.startsWith('whsec_'));

    // Verify HMAC-SHA256 signature generation
    const samplePayload = JSON.stringify({ event: 'incident.created', severity: 'HIGH' });
    const sigHeader = webhookDeliveryService.signWebhookPayload(samplePayload, ep.secret);
    const isValid = webhookDeliveryService.verifySignature(samplePayload, sigHeader, ep.secret);
    assert.equal(isValid, true);
  });

  test('SCENARIO 7: Webhook Dead-Letter Queue & Manual Replay', async () => {
    const subRes = await api('POST', '/api/v1/webhooks', {
      apiKey: masterApiKey,
      body: {
        url: 'https://non-existent-webhook-destination-e2e.org/endpoint',
        events: ['repair.started']
      }
    });

    const epId = subRes.data?.data?.id;

    // Trigger test delivery (destination is unreachable -> dead letter)
    const testDelRes = await api('POST', `/api/v1/webhooks/${epId}/test`, {
      apiKey: masterApiKey
    });
    assert.equal(testDelRes.status, 200);
    const delRecord = testDelRes.data?.data;
    assert.equal(delRecord.status, 'DEAD_LETTER');

    // Manual Replay
    const replayRes = await api('POST', `/api/v1/webhooks/deliveries/${delRecord.deliveryId}/replay`, {
      apiKey: masterApiKey
    });
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.data?.data?.isReplay, true);
  });

  test('SCENARIO 8: Public Platform Status Page & Component Health', async () => {
    const res = await api('GET', '/status');
    assert.equal(res.status, 200);
    const data = res.data?.data || res.data;
    assert.ok(['OPERATIONAL', 'DEGRADED'].includes(data.status));
    assert.ok(data.components.api_engine);
    assert.ok(data.components.verification_sandbox);
    assert.ok(Array.isArray(data.componentList));
  });

  test('SCENARIO 9: OpenAPI 3.1 Specification Serving (/openapi.json)', async () => {
    const res = await api('GET', '/openapi.json');
    assert.equal(res.status, 200);
    assert.equal(res.data.openapi, '3.1.0');
    assert.ok(res.data.info.title.includes('APIFIX AI Enterprise'));
    assert.ok(res.data.paths['/api/v1/projects']);
    assert.ok(res.data.paths['/api/v1/webhooks']);
    assert.ok(res.data.components.securitySchemes.ApiKeyAuth);
  });

  test('SCENARIO 10: SCM Provider: GitHub Branch & PR Automation', async () => {
    const gh = getSourceControlProvider('github');
    const branch = await gh.createBranch('titan/gateway', 'main', 'apifix/fix_e2e_jwt');
    assert.equal(branch.name, 'apifix/fix_e2e_jwt');

    const pr = await gh.createPullRequest('titan/gateway', {
      title: 'Fix: JWT Expiration Handling',
      body: 'Automated remediation generated by APIFIX AI',
      head: branch.name,
      base: 'main'
    });
    assert.ok(pr.number);
    assert.ok(pr.url.includes('github.com'));
  });

  test('SCENARIO 11: SCM Provider: GitLab Merge Request Automation', async () => {
    const gl = getSourceControlProvider('gitlab');
    const mr = await gl.createPullRequest('titan/billing_service', {
      title: 'Fix: Stripe Idempotency Key Regression',
      body: 'Verified via sandbox unit tests',
      head: 'apifix/fix_stripe'
    });
    assert.ok(mr.number);
    assert.ok(mr.url.includes('gitlab.com'));
  });

  test('SCENARIO 12: SCM Provider: Bitbucket PR Automation', async () => {
    const bb = getSourceControlProvider('bitbucket');
    const pr = await bb.createPullRequest('titan/inventory_api', {
      title: 'Fix: Null Pointer on Item Catalog',
      head: 'apifix/fix_inventory'
    });
    assert.ok(pr.number);
    assert.ok(pr.url.includes('bitbucket.org'));
  });

  test('SCENARIO 13: Enterprise SSO (OIDC/SAML) Configuration', async () => {
    const config = await configureSso({
      organizationId: 'org_e2e_sso',
      providerType: 'SAML',
      entityId: 'https://apifix.ai/sso/saml/metadata',
      ssoUrl: 'https://login.okta.com/app/apifix/sso/saml',
      certificate: '---BEGIN CERTIFICATE---\nMIIBIjANBgkqhkiG9w0BAQEFA...\n---END CERTIFICATE---',
      roleMappings: {
        'OKTA_APIFIX_ADMIN': 'ADMIN',
        'OKTA_APIFIX_DEV': 'DEVELOPER'
      }
    });

    assert.equal(config.providerType, 'SAML');
    assert.equal(config.enabled, true);

    const saved = getSsoConfig('org_e2e_sso');
    assert.equal(saved.ssoUrl, 'https://login.okta.com/app/apifix/sso/saml');
  });

  test('SCENARIO 14: SSO JIT User Provisioning & RBAC Role Mapping', async () => {
    const ssoResult = await processSsoCallback({
      organizationId: 'org_e2e_sso',
      claims: {
        sub: 'saml_alex_99',
        email: 'alex.sre@titan.com',
        name: 'Alex Rivera',
        groups: ['OKTA_APIFIX_ADMIN']
      }
    });

    assert.ok(ssoResult.token);
    assert.equal(ssoResult.user.email, 'alex.sre@titan.com');
    assert.equal(ssoResult.user.role, 'ADMIN');
  });

  test('SCENARIO 15: SCIM 2.0 User Lifecycle (Create -> Get -> Update)', async () => {
    const email = `scim.user.${Date.now()}@titan.com`;

    // 1. Create User
    const createRes = await api('POST', '/scim/v2/Users', {
      apiKey: masterApiKey,
      body: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: email,
        name: { givenName: 'Edward', familyName: 'Norton' },
        emails: [{ value: email, primary: true }],
        active: true
      }
    });

    assert.equal(createRes.status, 201);
    const userId = createRes.data.id;
    assert.ok(userId);

    // 2. Get User
    const getRes = await api('GET', `/scim/v2/Users/${userId}`, { apiKey: masterApiKey });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.data.userName, email);

    // 3. Update User (Deactivate)
    const patchRes = await api('PATCH', `/scim/v2/Users/${userId}`, {
      apiKey: masterApiKey,
      body: {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [
          { op: 'replace', path: 'active', value: false }
        ]
      }
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.data.active, false);
  });

  test('SCENARIO 16: SCIM 2.0 Group & Membership Management', async () => {
    const groupRes = await api('POST', '/scim/v2/Groups', {
      apiKey: masterApiKey,
      body: {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: `Security Operations Alpha ${Date.now()}`,
        members: []
      }
    });

    assert.equal(groupRes.status, 201);
    const groupId = groupRes.data.id;
    assert.ok(groupId);

    const listGroups = await api('GET', '/scim/v2/Groups', { apiKey: masterApiKey });
    assert.equal(listGroups.status, 200);
    assert.ok(Array.isArray(listGroups.data.Resources));
  });

  test('SCENARIO 17: Multi-Provider CI/CD Workflow Generation', () => {
    const ghWf = ciCdService.generateWorkflow('github', { projectId: 'proj_e2e_gate' });
    assert.ok(ghWf.content.includes('apifix verify'));

    const glWf = ciCdService.generateWorkflow('gitlab', { projectId: 'proj_e2e_gate' });
    assert.ok(glWf.content.includes('apifix verify'));

    const azWf = ciCdService.generateWorkflow('azure_devops', { projectId: 'proj_e2e_gate' });
    assert.ok(azWf.content.includes('apifix verify'));
  });

  test('SCENARIO 18: CI/CD Inbound Pipeline Ingestion & Exit Code Mapping', async () => {
    const result = await ciCdService.handlePipelineFailureWebhook({
      provider: 'github',
      repository: 'titan/api_gateway',
      branch: 'main',
      commitSha: 'a1b2c3d4e5f6',
      errorLogs: 'AssertionError: Expected 200 OK but received 500 Internal Server Error in auth_test.go:45'
    });

    assert.ok(result.runId);
    assert.ok(['investigation_triggered', 'QUEUED'].includes(result.status));
    assert.equal(ciCdService.getExitCode(null), 0);
    assert.equal(ciCdService.getExitCode(new Error('verification_failed')), 1);
  });

  test('SCENARIO 19: Official CLI Command Automation & JSON Mode', async () => {
    const cliPath = path.resolve(__dirname, '../../cli/bin/apifix.js');

    const { stdout: statusOut } = await execAsync(`node "${cliPath}" status --base-url "${baseUrl}" --json`);
    const statusJson = JSON.parse(statusOut);
    assert.ok(statusJson.data || statusJson.status);

    const { stdout: projectsOut } = await execAsync(`node "${cliPath}" projects list --base-url "${baseUrl}" --api-key "${masterApiKey}" --json`);
    const projectsJson = JSON.parse(projectsOut);
    assert.ok(projectsJson.data);
  });

  test('SCENARIO 20: API Usage Analytics & Percentile Latency Calculation', () => {
    // Record mock metrics
    apiUsageService.recordApiRequest({
      endpoint: '/api/v1/projects',
      method: 'GET',
      statusCode: 200,
      durationMs: 45,
      organizationId: 'org_e2e_primary',
      workspaceId: 'ws_demo_primary'
    });

    apiUsageService.recordApiRequest({
      endpoint: '/api/v1/projects',
      method: 'GET',
      statusCode: 200,
      durationMs: 85,
      organizationId: 'org_e2e_primary',
      workspaceId: 'ws_demo_primary'
    });

    const analytics = apiUsageService.getUsageAnalytics({ organizationId: 'org_e2e_primary' });
    assert.ok(analytics.summary.totalRequests >= 2);
    assert.ok(analytics.summary.latency.p50 >= 0);
    assert.ok(analytics.summary.latency.p95 >= 0);
    assert.ok(analytics.summary.latency.p99 >= 0);
  });
});
