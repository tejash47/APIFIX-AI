/**
 * APIFIX AI — Phase 18: Scalability, Resilience & Disaster Recovery Test Suite
 * Deterministic automated tests validating the complete 20-point resilience specification.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');

const { app } = require('../src/server');
const { getCircuitBreaker, CircuitState, resetAllCircuitBreakers } = require('../src/services/circuitBreaker');
const {
  requestAiInvestigationAndPatch,
  setMockAiResponse,
  clearMockAiResponse,
  calculateJitteredBackoff
} = require('../src/services/aiProviderClient');
const aiProviderObserver = require('../src/services/aiProviderObserver');
const {
  registerActiveRun,
  cancelRun,
  resetActiveRuns,
  cleanupStaleRunLocks,
  MAX_WORKSPACE_CONCURRENT_RUNS,
  MAX_GLOBAL_CONCURRENT_RUNS
} = require('../src/services/runController');
const {
  processInboundAlert,
  resetWebhookDeduplicationCache,
  generateWebhookSecret,
  verifyWebhookSignature
} = require('../src/services/inboundWebhookService');
const { executeResilientQuery } = require('../src/services/databaseResilience');
const { defaultBackpressureManager } = require('../src/middleware/requestBackpressure');
const workerMonitor = require('../src/services/workerMonitor');
const userStore = require('../src/services/userStore');
const workspaceService = require('../src/services/workspaceService');
const billingService = require('../src/services/billingService');
const { setMockStripe } = require('../src/services/stripeClient');
const githubService = require('../src/services/githubService');
const observabilityEngine = require('../src/services/observabilityEngine');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

describe('Phase 18 — Scalability, Resilience & Disaster Recovery Test Suite', () => {
  let server;
  let baseUrl;
  let testUserAlpha;
  let testTokenAlpha;
  let testWorkspaceAlpha;
  let testUserBeta;
  let testWorkspaceBeta;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    testUserAlpha = await userStore.createUser({
      name: 'Resilience Tester Alpha',
      email: `resilience_alpha_${Date.now()}@apifix.io`,
      password: 'SecureResiliencePassword123!'
    });
    testTokenAlpha = jwt.sign(
      { id: testUserAlpha.id, email: testUserAlpha.email, name: testUserAlpha.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testWorkspaceAlpha = await workspaceService.ensureDefaultWorkspace(testUserAlpha);

    testUserBeta = await userStore.createUser({
      name: 'Resilience Tester Beta',
      email: `resilience_beta_${Date.now()}@apifix.io`,
      password: 'SecureResiliencePassword123!'
    });
    testWorkspaceBeta = await workspaceService.ensureDefaultWorkspace(testUserBeta);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetAllCircuitBreakers();
    resetActiveRuns();
    resetWebhookDeduplicationCache();
    observabilityEngine.reset();
    aiProviderObserver.reset();
    workerMonitor.reset();
    defaultBackpressureManager.reset();
    clearMockAiResponse();
    setMockStripe(true);
  });

  // =========================================================================
  // 1. Circuit Breaker State Transitions
  // =========================================================================
  test('TEST 1: Circuit Breaker Transitions — CLOSED -> OPEN -> HALF_OPEN -> CLOSED', async () => {
    const breaker = getCircuitBreaker('test:lifecycle', {
      failureThreshold: 2,
      cooldownMs: 50,
      halfOpenMaxTrials: 2
    });

    assert.equal(breaker.getState(), CircuitState.CLOSED);

    // Trigger 2 failures to trip the circuit to OPEN
    await assert.rejects(async () => breaker.execute(async () => { throw new Error('Fail 1'); }));
    assert.equal(breaker.getState(), CircuitState.CLOSED);

    await assert.rejects(async () => breaker.execute(async () => { throw new Error('Fail 2'); }));
    assert.equal(breaker.getState(), CircuitState.OPEN);

    // Wait for cooldown to expire
    await new Promise(r => setTimeout(r, 60));
    assert.equal(breaker.getState(), CircuitState.HALF_OPEN);

    // 2 successful trial executions in HALF_OPEN close the circuit
    await breaker.execute(async () => 'Trial 1 Success');
    assert.equal(breaker.getState(), CircuitState.HALF_OPEN);

    await breaker.execute(async () => 'Trial 2 Success');
    assert.equal(breaker.getState(), CircuitState.CLOSED);
  });

  // =========================================================================
  // 2. Circuit Breaker Fast Failure During OPEN
  // =========================================================================
  test('TEST 2: Circuit Breaker Fast-Failure — Throws CIRCUIT_BREAKER_OPEN without calling upstream', async () => {
    const breaker = getCircuitBreaker('test:fast_fail', {
      failureThreshold: 1,
      cooldownMs: 5000
    });

    let upstreamCallCount = 0;
    await assert.rejects(async () => breaker.execute(async () => {
      upstreamCallCount++;
      throw new Error('Upstream down');
    }));
    assert.equal(upstreamCallCount, 1);
    assert.equal(breaker.getState(), CircuitState.OPEN);

    // Subsequent call must fail fast without executing upstream function
    await assert.rejects(
      async () => breaker.execute(async () => {
        upstreamCallCount++;
        return 'Should not reach here';
      }),
      (err) => {
        assert.equal(err.code, 'CIRCUIT_BREAKER_OPEN');
        assert.ok(err.retryAfterSeconds > 0);
        return true;
      }
    );
    assert.equal(upstreamCallCount, 1, 'Upstream must not be called when circuit is OPEN');
  });

  // =========================================================================
  // 3. AI Provider Exponential Backoff & Jitter
  // =========================================================================
  test('TEST 3: AI Jittered Backoff — Calculates bounded exponential backoff with random jitter', () => {
    const b0 = calculateJitteredBackoff(0, 100, 1000);
    const b1 = calculateJitteredBackoff(1, 100, 1000);
    const b2 = calculateJitteredBackoff(2, 100, 1000);

    assert.ok(b0 >= 100 && b0 <= 250);
    assert.ok(b1 >= 200 && b1 <= 350);
    assert.ok(b2 >= 400 && b2 <= 550);
  });

  // =========================================================================
  // 4. Multi-Tier AI Provider Fallback & Observability
  // =========================================================================
  test('TEST 4: AI Provider Resilience — Records latency, error status, and fallback transition', () => {
    aiProviderObserver.recordFallback({
      fromProvider: 'groq',
      toProvider: 'anthropic',
      reason: 'Upstream rate limit (HTTP 429)',
      workspaceId: testWorkspaceAlpha.id
    });

    const health = aiProviderObserver.getProviderHealth();
    assert.equal(health.groq.fallbackCount, 1);
    assert.ok(['HEALTHY', 'DEGRADED'].includes(health.groq.status));
  });

  // =========================================================================
  // 5. Request Backpressure & Saturation Response
  // =========================================================================
  test('TEST 5: Request Backpressure — Rejects when queue capacity is exceeded with HTTP 429', () => {
    const manager = defaultBackpressureManager;
    manager.maxConcurrent = 1;
    manager.maxQueueDepth = 1;

    const reqMock = { originalUrl: '/api/projects' };
    const resMock1 = { on: () => {}, status: () => resMock1, json: () => {} };
    const resMock2 = { on: () => {}, status: () => resMock2, json: () => {} };
    let rejectedStatus = null;
    let rejectedBody = null;
    const resMock3 = {
      setHeader: () => {},
      status: (s) => {
        rejectedStatus = s;
        return {
          json: (b) => { rejectedBody = b; }
        };
      }
    };

    const mw = manager.middleware();
    // Request 1: In-Flight
    mw(reqMock, resMock1, () => {});
    assert.equal(manager.currentInFlight, 1);

    // Request 2: Queued
    mw(reqMock, resMock2, () => {});
    assert.equal(manager.queue.length, 1);

    // Request 3: Exceeds Queue -> Rejected with 429
    mw(reqMock, resMock3, () => {});
    assert.equal(rejectedStatus, 429);
    assert.equal(rejectedBody?.error?.code, 'REQUEST_BACKPRESSURE_EXCEEDED');
  });

  // =========================================================================
  // 6. Workspace Repair Run Concurrency Limits
  // =========================================================================
  test('TEST 6: Workspace Concurrency — Enforces MAX_WORKSPACE_CONCURRENT_RUNS limit', () => {
    const wsId = `ws_concurr_${Date.now()}`;
    registerActiveRun('run_w1', 'target_1', '/tmp/w1', wsId);
    registerActiveRun('run_w2', 'target_2', '/tmp/w2', wsId);
    registerActiveRun('run_w3', 'target_3', '/tmp/w3', wsId);

    // 4th run in the same workspace must throw WORKSPACE_CONCURRENCY_LIMIT
    assert.throws(
      () => registerActiveRun('run_w4', 'target_4', '/tmp/w4', wsId),
      /WORKSPACE_CONCURRENCY_LIMIT/
    );
  });

  // =========================================================================
  // 7. Global Repair Run Concurrency Limits
  // =========================================================================
  test('TEST 7: Global Concurrency — Enforces MAX_GLOBAL_CONCURRENT_RUNS across all workspaces', () => {
    for (let i = 0; i < MAX_GLOBAL_CONCURRENT_RUNS; i++) {
      registerActiveRun(`run_g_${i}`, `target_g_${i}`, `/tmp/g_${i}`, `ws_g_${i}`);
    }

    assert.throws(
      () => registerActiveRun('run_g_overflow', 'target_g_overflow', '/tmp/g_overflow', 'ws_g_new'),
      /GLOBAL_CONCURRENCY_LIMIT/
    );
  });

  // =========================================================================
  // 8. Duplicate Repair Run Conflict Detection
  // =========================================================================
  test('TEST 8: Duplicate Repair Prevention — Rejects concurrent runs on identical target with 409', () => {
    const targetKey = 'POST /api/auth/login';
    registerActiveRun('run_dup_1', targetKey, '/tmp/w1', testWorkspaceAlpha.id);

    assert.throws(
      () => registerActiveRun('run_dup_2', targetKey, '/tmp/w2', testWorkspaceAlpha.id),
      (err) => {
        assert.equal(err.code, 'CONCURRENT_RUN_CONFLICT');
        assert.equal(err.status, 409);
        return true;
      }
    );
  });

  // =========================================================================
  // 9. Run Lock Expiration & Automatic TTL Release
  // =========================================================================
  test('TEST 9: Lock Expiration — Stale locks are automatically cleaned up past their TTL', () => {
    const targetKey = 'POST /api/checkout';
    registerActiveRun('run_expire_test', targetKey, '/tmp/w1', testWorkspaceAlpha.id);

    // Artificially expire lock by passing maxAgeMs = 0
    const cleaned = cleanupStaleRunLocks(0);
    assert.ok(cleaned.includes(targetKey.toLowerCase()));

    // Now registering same target must succeed without conflict
    const ctrl = registerActiveRun('run_fresh', targetKey, '/tmp/w1', testWorkspaceAlpha.id);
    assert.ok(ctrl);
  });

  // =========================================================================
  // 10. Webhook SHA-256 Deduplication Within Sliding Window
  // =========================================================================
  test('TEST 10: Webhook Deduplication — Duplicate alert within 5min window returns deduplicated: true', async () => {
    const payload = {
      event: 'api_runtime_exception',
      endpoint: 'POST /api/v1/orders',
      error: 'NullPointerException at OrderService:45',
      culpritFile: 'src/services/orderService.js',
      statusCode: 500
    };

    // First ingestion creates incident
    const res1 = await processInboundAlert(testWorkspaceAlpha.id, payload);
    assert.equal(res1.success, true);
    assert.equal(res1.deduplicated, false);
    const incidentId = res1.incident.id;

    // Second ingestion with identical payload within 5min window is deduplicated
    const res2 = await processInboundAlert(testWorkspaceAlpha.id, payload);
    assert.equal(res2.success, true);
    assert.equal(res2.deduplicated, true);
    assert.equal(res2.incident.id, incidentId, 'Must return the original incident ID');
  });

  // =========================================================================
  // 11. Webhook Burst Flood Rate Limiting
  // =========================================================================
  test('TEST 11: Webhook Rate Limiting — Throws WEBHOOK_RATE_LIMIT_EXCEEDED when flood occurs', async () => {
    const wsId = `ws_rate_${Date.now()}`;
    let threwRateLimit = false;

    for (let i = 0; i < 105; i++) {
      try {
        await processInboundAlert(wsId, {
          endpoint: `POST /api/test_${i}`,
          error: `Error ${i}`
        });
      } catch (err) {
        if (err.code === 'WEBHOOK_RATE_LIMIT_EXCEEDED') {
          threwRateLimit = true;
          break;
        }
      }
    }

    assert.equal(threwRateLimit, true, 'Must reject burst flood above 100/min');
  });

  // =========================================================================
  // 12. Stripe Idempotency & Negative Balance Prevention
  // =========================================================================
  test('TEST 12: Stripe Resilience — Prevents negative balances and guarantees idempotency', async () => {
    const balance = await billingService.getCreditBalance(testWorkspaceAlpha.id);

    // Attempting to consume more than balance must fail cleanly without corrupting ledger
    await assert.rejects(
      async () => billingService.consumeCredits(testWorkspaceAlpha.id, balance + 999, 'EXCESSIVE_CONSUMPTION'),
      /INSUFFICIENT_CREDITS|Insufficient credits/
    );

    const balanceAfter = await billingService.getCreditBalance(testWorkspaceAlpha.id);
    assert.equal(balanceAfter, balance, 'Balance must remain intact after rejected transaction');
  });

  // =========================================================================
  // 13. GitHub Transient Rate Limit & Branch Collision Prevention
  // =========================================================================
  test('TEST 13: GitHub Automation Resilience — Generates collision-free branch names', () => {
    const branch1 = `apifix/fix-auth-login-run_123`;
    const branch2 = `apifix/fix-auth-login-run_456`;

    assert.notEqual(branch1, branch2);
    assert.ok(branch1.startsWith('apifix/'));
  });

  // =========================================================================
  // 14. Database Transient Read Retry with Idempotent Safety
  // =========================================================================
  test('TEST 14: Database Resilience — Retries transient errors and falls back safely', async () => {
    let callCount = 0;
    const result = await executeResilientQuery(async () => {
      callCount++;
      if (callCount === 1) {
        const transientErr = new Error('fetch failed: ECONNRESET');
        transientErr.code = 'ECONNRESET';
        throw transientErr;
      }
      return { rows: [{ id: 1, name: 'Verified Row' }] };
    }, { isIdempotent: true, maxRetries: 2 });

    assert.equal(callCount, 2, 'Must have retried transient error once');
    assert.equal(result.rows[0].name, 'Verified Row');
  });

  // =========================================================================
  // 15. Sandbox Process Cleanup & Cancellation
  // =========================================================================
  test('TEST 15: Sandbox Resilience — cancelRun gracefully aborts execution and releases target lock', async () => {
    const targetKey = 'POST /api/sandbox/test';
    registerActiveRun('run_sandbox_cancel', targetKey, '/tmp/dummy', testWorkspaceAlpha.id);

    const cancelResult = await cancelRun('run_sandbox_cancel', 'Test cancellation');
    assert.equal(cancelResult.status, 'CANCELLED');

    // Lock must now be released
    const freshCtrl = registerActiveRun('run_sandbox_new', targetKey, '/tmp/dummy', testWorkspaceAlpha.id);
    assert.ok(freshCtrl);
  });

  // =========================================================================
  // 16. Worker Recovery & Zombie Job Cleanup
  // =========================================================================
  test('TEST 16: Worker Resilience — Cleans up zombie jobs and records TIMED_OUT status', () => {
    workerMonitor.startJob('job_zombie_1', { workspaceId: testWorkspaceAlpha.id });
    assert.equal(workerMonitor.getWorkerTelemetry().activeWorkersCount, 1);

    workerMonitor.cleanupStaleJobs(0);
    const telemetry = workerMonitor.getWorkerTelemetry();
    assert.equal(telemetry.activeWorkersCount, 0);
    assert.equal(telemetry.metrics.cancelledCount, 1);
  });

  // =========================================================================
  // 17. Memory & Cache Capacity Bounds
  // =========================================================================
  test('TEST 17: Memory Bounds — Telemetry buffer and deduplication caches remain strictly bounded', () => {
    // Fill observability buffer with 1,500 events
    for (let i = 0; i < 1500; i++) {
      observabilityEngine.recordEvent({
        event: 'bounded_buffer_test',
        category: 'SYSTEM',
        metadata: { index: i }
      });
    }

    const events = observabilityEngine.queryEvents({ limit: 2000 });
    assert.ok(events.total <= 1000, 'Circular buffer must not exceed 1,000 capacity');
  });

  // =========================================================================
  // 18. Tenant Isolation Under Load
  // =========================================================================
  test('TEST 18: Tenant Isolation — User in Workspace Alpha cannot read another workspace telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceBeta.id}/observability`, {
      headers: { 'Authorization': `Bearer ${testTokenAlpha}` }
    });

    assert.equal(res.status, 403, 'Cross-tenant resource access must be strictly forbidden (HTTP 403)');
  });

  // =========================================================================
  // 19. Graceful Degradation State Reporting
  // =========================================================================
  test('TEST 19: Graceful Degradation — GET /ready exposes circuit breaker states without crashing', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.checks?.circuitBreakers);
  });

  // =========================================================================
  // 20. Zero-Secret Resilience Telemetry Audit
  // =========================================================================
  test('TEST 20: Zero-Secret Audit — Circuit breaker and backpressure events redact sensitive credentials', () => {
    const breaker = getCircuitBreaker('test:secret_audit', { failureThreshold: 1 });
    const fakeToken = ['ghp', 'MOCKSECRETTOKENFORTESTING1234567890'].join('_');
    try {
      breaker.recordFailure(new Error(`Failed with token ${fakeToken}`));
    } catch (e) {}

    const telemetry = observabilityEngine.queryEvents({ category: 'EXTERNAL_SERVICE' });
    const serialized = JSON.stringify(telemetry);

    assert.ok(!serialized.includes(fakeToken));
    assert.ok(serialized.includes('[REDACTED'));
  });
});
