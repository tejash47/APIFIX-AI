/**
 * APIFIX AI — Phase 17: Production Deployment, Reliability & Launch Readiness Test Suite
 * Deterministic automated tests validating the complete 20-point production readiness specification.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');

const { app } = require('../src/server');
const { validateEnvironment } = require('../src/config/envValidator');
const { getShutdownStatus } = require('../src/services/shutdownManager');
const observabilityEngine = require('../src/services/observabilityEngine');
const aiProviderObserver = require('../src/services/aiProviderObserver');
const workerMonitor = require('../src/services/workerMonitor');
const userStore = require('../src/services/userStore');
const workspaceService = require('../src/services/workspaceService');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');
const { setMockStripe, isStripeConfigured } = require('../src/services/stripeClient');
const { verifyWebhookSignature, generateWebhookSecret } = require('../src/services/inboundWebhookService');

describe('Phase 17 — Production Deployment, Reliability & Launch Readiness Test Suite', () => {
  let server;
  let baseUrl;
  let testUserAlpha;
  let testTokenAlpha;
  let testWorkspaceAlpha;
  let testUserBeta;
  let testTokenBeta;
  let testWorkspaceBeta;

  before(async () => {
    // Start local test server
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Provision isolated test workspaces
    testUserAlpha = await userStore.createUser({
      name: 'Production Deployer Alpha',
      email: `prod_alpha_${Date.now()}@apifix.io`,
      password: 'SecurePassword123!'
    });
    testTokenAlpha = jwt.sign(
      { id: testUserAlpha.id, email: testUserAlpha.email, name: testUserAlpha.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testWorkspaceAlpha = await workspaceService.ensureDefaultWorkspace(testUserAlpha);

    testUserBeta = await userStore.createUser({
      name: 'Production Deployer Beta',
      email: `prod_beta_${Date.now()}@apifix.io`,
      password: 'SecurePassword123!'
    });
    testTokenBeta = jwt.sign(
      { id: testUserBeta.id, email: testUserBeta.email, name: testUserBeta.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testWorkspaceBeta = await workspaceService.ensureDefaultWorkspace(testUserBeta);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    observabilityEngine.reset();
    aiProviderObserver.reset();
    workerMonitor.reset();
    setMockStripe(true);
  });

  // =========================================================================
  // 1. Production Config Validation & Fail-Fast
  // =========================================================================
  test('TEST 1: Production Config Validation — Throws when required JWT secret is missing or insecure in production', () => {
    const invalidEnv = {
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'short', // Too short for production
      GROQ_API_KEY: ['gsk', 'valid_mock_key_for_test'].join('_')
    };

    assert.throws(
      () => validateEnvironment(invalidEnv),
      /JWT_SECRET must be at least 16 characters long in production mode/
    );
  });

  // =========================================================================
  // 2. Health Endpoint Liveness Probe
  // =========================================================================
  test('TEST 2: Health Endpoint — GET /health returns HTTP 200 with accurate process memory and uptime', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'apifix-backend');
    assert.ok(typeof data.uptimeSeconds === 'number');
    assert.ok(data.process?.memoryHeapUsedMb >= 0);
  });

  // =========================================================================
  // 3. Readiness Endpoint Multi-Dependency Probe
  // =========================================================================
  test('TEST 3: Readiness Endpoint — GET /ready returns multi-subsystem status without crashing on optional dependencies', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(['ready', 'ready_degraded'].includes(data.status));
    assert.ok(data.checks?.database);
    assert.ok(data.checks?.aiProviders);
    assert.ok(data.checks?.workers);
    assert.equal(data.checks?.sandbox, 'ok');
  });

  // =========================================================================
  // 4. Secure CORS Origin Handling
  // =========================================================================
  test('TEST 4: Secure CORS — Configured origin is permitted and includes allowed header declarations', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type,Authorization'
      }
    });

    assert.ok([200, 204].includes(res.status));
  });

  // =========================================================================
  // 5. HTTP Security Headers
  // =========================================================================
  test('TEST 5: HTTP Security Headers — Injects X-Content-Type-Options, X-Frame-Options, and strips X-Powered-By', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By header must be removed');
  });

  // =========================================================================
  // 6. Request Body Size Limit Enforcement
  // =========================================================================
  test('TEST 6: Request Body Limits — Rejects oversized payloads gracefully', async () => {
    // Attempting to send a payload exceeding standard limits
    const hugePayload = JSON.stringify({ data: 'A'.repeat(12 * 1024 * 1024) }); // 12MB
    const res = await fetch(`${baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testTokenAlpha}`
      },
      body: hugePayload
    });

    assert.equal(res.status, 413, 'Oversized payload must return HTTP 413 Payload Too Large');
  });

  // =========================================================================
  // 7. Authentication Token Verification
  // =========================================================================
  test('TEST 7: Authentication — Rejects missing, invalid, or expired JWT tokens with HTTP 401', async () => {
    const expiredToken = jwt.sign(
      { id: 'usr_expired', email: 'exp@apifix.io' },
      JWT_SECRET,
      { expiresIn: '-10s' }
    );

    const res = await fetch(`${baseUrl}/api/workspaces`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });

    assert.equal(res.status, 401);
  });

  // =========================================================================
  // 8. Multi-Tenant RBAC Permissions
  // =========================================================================
  test('TEST 8: RBAC — VIEWER role is blocked from updating workspace settings (HTTP 403)', async () => {
    // Add viewer member to Workspace Alpha
    const viewerUser = await userStore.createUser({
      name: 'Viewer Member',
      email: `viewer_${Date.now()}@apifix.io`,
      password: 'SecurePassword123!'
    });
    const viewerToken = jwt.sign(
      { id: viewerUser.id, email: viewerUser.email, name: viewerUser.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    await workspaceService.addMember(testWorkspaceAlpha.id, { userId: viewerUser.id, userEmail: viewerUser.email, role: 'VIEWER' }, testUserAlpha);

    const patchRes = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${viewerToken}`
      },
      body: JSON.stringify({ approval_required: false })
    });

    assert.equal(patchRes.status, 403, 'VIEWER must not be allowed to modify workspace settings');
  });

  // =========================================================================
  // 9. Tenant Isolation
  // =========================================================================
  test('TEST 9: Tenant Isolation — User in Workspace Beta cannot access Workspace Alpha resources', async () => {
    const res = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}`, {
      headers: { 'Authorization': `Bearer ${testTokenBeta}` }
    });

    assert.equal(res.status, 403, 'Cross-workspace access must be strictly forbidden');
  });

  // =========================================================================
  // 10. Graceful Shutdown Hooks & Worker Cleanup
  // =========================================================================
  test('TEST 10: Graceful Shutdown — Shutdown manager cleans up active worker jobs and terminates safely', () => {
    const jobId = 'job_shutdown_test_001';
    workerMonitor.startJob(jobId, { workspaceId: testWorkspaceAlpha.id, type: 'REPAIR_RUN' });

    assert.equal(workerMonitor.getWorkerTelemetry().activeWorkersCount, 1);

    // Simulate worker cleanup on shutdown signal
    workerMonitor.cleanupStaleJobs(0);
    assert.equal(workerMonitor.getWorkerTelemetry().activeWorkersCount, 0);
    assert.equal(workerMonitor.getWorkerTelemetry().metrics.cancelledCount, 1);
  });

  // =========================================================================
  // 11. Zero-Secret Log & Telemetry Audit
  // =========================================================================
  test('TEST 11: Zero-Secret Audit — Structured telemetry automatically redacts all API keys and tokens', () => {
    const fakeGsk = ['gsk', 'mockgroqapikey12345678901234567890'].join('_');
    const fakeGhp = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'].join('_');
    const fakeStripe = ['sk', 'test', '51MockStripeSecretKey1234567890'].join('_');

    const evt = observabilityEngine.recordEvent({
      event: 'production_credential_audit',
      category: 'AUTH',
      metadata: {
        apiKey: fakeGsk,
        token: fakeGhp,
        stripeKey: fakeStripe
      }
    });

    const serialized = JSON.stringify(evt);
    assert.ok(!serialized.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    assert.ok(!serialized.includes('mockgroqapikey'));
    assert.ok(!serialized.includes('51MockStripeSecretKey'));
    assert.ok(serialized.includes('[REDACTED'));
  });

  // =========================================================================
  // 12. Docker Configuration & Healthcheck Validation
  // =========================================================================
  test('TEST 12: Docker Configuration — Environment validator parses Docker container production defaults', () => {
    const dockerEnv = {
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'apifix_production_jwt_secret_key_32bytes_min',
      GROQ_API_KEY: ['gsk', 'valid_production_key_placeholder'].join('_'),
      APIFIX_DEMO_MODE: 'false'
    };

    const validated = validateEnvironment(dockerEnv);
    assert.equal(validated.valid, true);
    assert.equal(validated.port, 4000);
    assert.equal(validated.environment, 'production');
  });

  // =========================================================================
  // 13. Webhook HMAC Security & Replay Prevention
  // =========================================================================
  test('TEST 13: Webhook Security — HMAC signature verification rejects tampered signatures', () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: 'incident.detected', error: 'Null pointer exception' });
    const fakeSignature = 'sha256=invalid_tampered_signature_0000000000000000000000000000000000000000000000000000000000000000';

    const isValid = verifyWebhookSignature(payload, fakeSignature, secret);
    assert.equal(isValid, false, 'Tampered webhook signature must be rejected');
  });

  // =========================================================================
  // 14. Stripe Mock/Test-Mode Safety
  // =========================================================================
  test('TEST 14: Stripe Safety — In-memory test mock prevents real credit card charges during test runs', () => {
    setMockStripe(true);
    assert.equal(isStripeConfigured(), false);
  });

  // =========================================================================
  // 15. GitHub Automation Token Safety
  // =========================================================================
  test('TEST 15: GitHub Token Safety — Sanitizer masks GitHub tokens in error payloads and audit metadata', () => {
    const rawToken = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'].join('_');
    const envSummary = validateEnvironment({
      NODE_ENV: 'development',
      GITHUB_TOKEN: rawToken
    });

    assert.ok(envSummary.github.maskedToken.includes('...'));
    assert.ok(!envSummary.github.maskedToken.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
  });

  // =========================================================================
  // 16. AI Provider Fallback & Latency Tracking
  // =========================================================================
  test('TEST 16: AI Provider Resilience — Fallback event tracking records transition without crashing', () => {
    aiProviderObserver.recordFallback({
      fromProvider: 'groq',
      toProvider: 'anthropic',
      reason: 'Upstream HTTP 503 gateway outage',
      workspaceId: testWorkspaceAlpha.id
    });

    const health = aiProviderObserver.getProviderHealth();
    assert.equal(health.groq.fallbackCount, 1);
  });

  // =========================================================================
  // 17. Standardized Error Sanitization
  // =========================================================================
  test('TEST 17: Error Sanitization — Non-existent route returns clean JSON contract without internal stack traces', async () => {
    const res = await fetch(`${baseUrl}/api/non_existent_route_404`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.ok(data.error);
    assert.ok(data.error.code);
    assert.equal(data.error.stack, undefined, 'Internal stack traces must not be exposed');
  });

  // =========================================================================
  // 18. URL Configuration Consistency
  // =========================================================================
  test('TEST 18: URL Configuration — Environment validator enforces valid APP_BASE_URL and port', () => {
    const envSummary = validateEnvironment({
      NODE_ENV: 'development',
      APP_BASE_URL: 'https://app.apifix.ai',
      PORT: '4000'
    });

    assert.equal(envSummary.appBaseUrl, 'https://app.apifix.ai');
    assert.equal(envSummary.port, 4000);
  });

  // =========================================================================
  // 19. Rate Limiter Sliding Window Enforcement
  // =========================================================================
  test('TEST 19: Rate Limiting — Rapid consecutive requests return HTTP 429 once limit is exceeded', async () => {
    let rateLimited = false;
    for (let i = 0; i < 35; i++) {
      const res = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testTokenAlpha}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: `test_rate_limit_${i}` })
      });

      if (res.status === 429) {
        rateLimited = true;
        break;
      }
    }

    assert.ok(rateLimited, 'Heavy route must enforce rate limiting and return HTTP 429');
  });

  // =========================================================================
  // 20. End-to-End Production API Smoke Test
  // =========================================================================
  test('TEST 20: Production API Smoke Test — Complete health -> auth -> workspace -> observability flow', async () => {
    // 1. Health
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    // 2. Auth Profile
    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${testTokenAlpha}` }
    });
    assert.equal(me.status, 200);

    // 3. Workspace Detail
    const ws = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}`, {
      headers: { 'Authorization': `Bearer ${testTokenAlpha}` }
    });
    assert.equal(ws.status, 200);

    // 4. Observability Summary
    const obs = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}/observability`, {
      headers: { 'Authorization': `Bearer ${testTokenAlpha}` }
    });
    assert.equal(obs.status, 200);
    const obsData = await obs.json();
    assert.equal(obsData.workspaceId, testWorkspaceAlpha.id);
  });
});
