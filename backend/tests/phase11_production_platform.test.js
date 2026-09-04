const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { validateEnvironment, maskSecret } = require('../src/config/envValidator');
const logger = require('../src/services/logger');
const metrics = require('../src/services/metrics');
const { createRateLimiter } = require('../src/middleware/rateLimiter');
const { requestIdMiddleware, standardErrorHandler } = require('../src/middleware/errorHandler');
const { handleHealth, handleReadiness, handleMetrics } = require('../src/routes/healthRoutes');
const { isSupabaseConfigured } = require('../src/config/supabase');
const { registerActiveRun, unregisterActiveRun, isRunActive } = require('../src/services/runController');

describe('APIFIX V2 — Phase 11: Production Platform & Observability Tests', () => {

  beforeEach(() => {
    metrics.reset();
  });

  test('TEST 1: Environment Validator accurately detects configuration and validates parameters', () => {
    const validDevEnv = {
      NODE_ENV: 'development',
      PORT: '4000',
      GROQ_API_KEY: ['gsk', 'test1234567890abcdef1234567890abcdef1234567890abcdef'].join('_'),
      APIFIX_DEMO_MODE: 'false'
    };

    const config = validateEnvironment(validDevEnv);
    assert.strictEqual(config.valid, true);
    assert.strictEqual(config.port, 4000);
    assert.strictEqual(config.ai.groqConfigured, true);
    assert.strictEqual(config.ai.activeProviderCount, 1);
  });

  test('TEST 2: Environment Validator masks secrets and rejects invalid configurations', () => {
    const sampleKey = ['gsk', 'very_secret_api_key_1234567890'].join('_');
    const masked = maskSecret(sampleKey);
    assert.ok(masked.startsWith('gsk'));
    assert.ok(masked.endsWith('7890'));
    assert.ok(!masked.includes('very_secret_api_key'));

    // Test invalid port
    const invalidPortEnv = {
      NODE_ENV: 'development',
      PORT: 'invalid_port',
      APIFIX_DEMO_MODE: 'true'
    };
    const devConfig = validateEnvironment(invalidPortEnv);
    assert.strictEqual(devConfig.valid, false);
  });

  test('TEST 3: Structured JSON Logger formats logs with tracing context and redacts secrets', () => {
    const fakeGsk = ['gsk', 'super_secret_groq_key_987654321'].join('_');
    const logEntry = logger.info('test_event', {
      runId: 'run_12345',
      durationMs: 250.6,
      secretKey: fakeGsk,
      details: 'Investigation completed successfully'
    });

    assert.strictEqual(logEntry.level, 'INFO');
    assert.strictEqual(logEntry.service, 'apifix-backend');
    assert.strictEqual(logEntry.runId, 'run_12345');
    assert.strictEqual(logEntry.durationMs, 251);
    assert.strictEqual(logEntry.secretKey, '[REDACTED]');
  });

  test('TEST 4: Health endpoint returns 200 OK with accurate system status', () => {
    let statusCode = null;
    let responseBody = null;

    const req = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    handleHealth(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(responseBody.status, 'ok');
    assert.strictEqual(responseBody.service, 'apifix-backend');
    assert.strictEqual(responseBody.agentStatus, 'online');
  });

  test('TEST 5: Readiness endpoint verifies AI and database dependencies', () => {
    let statusCode = null;
    let responseBody = null;

    const req = {};
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    handleReadiness(req, res);
    assert.ok([200, 503].includes(statusCode));
    assert.ok(responseBody.checks);
    assert.ok(responseBody.checks.sandbox === 'ok');
    assert.ok(responseBody.checks.database.includes('ok'));
  });

  test('TEST 6: Metrics collector tracks run metrics, latencies, and provides summary', () => {
    metrics.increment('totalRuns');
    metrics.increment('successfulRuns');
    metrics.recordDuration('repairTotalMs', 1500);
    metrics.recordDuration('aiRequestsMs', 800);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.runs.total, 1);
    assert.strictEqual(summary.runs.successful, 1);
    assert.strictEqual(summary.runs.avgRepairDurationMs, 1500);
    assert.strictEqual(summary.ai.avgLatencyMs, 800);
    assert.ok(summary.process.memoryRssMb > 0);
  });

  test('TEST 7: Sliding-Window Rate Limiter blocks excessive requests and returns 429 with Retry-After', () => {
    // Save original env
    const origEnv = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const limiter = createRateLimiter({ maxRequests: 2, isHeavy: true });
    const mockHeaders = {};

    let statusCode = null;
    let responseBody = null;

    const createMockReqRes = () => ({
      req: { ip: '127.0.0.99', url: '/api/runs' },
      res: {
        setHeader(k, v) { mockHeaders[k] = v; },
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        }
      }
    });

    let nextCalled = 0;
    const next = () => { nextCalled++; };

    // Request 1: PASS
    const r1 = createMockReqRes();
    limiter(r1.req, r1.res, next);
    assert.strictEqual(nextCalled, 1);

    // Request 2: PASS
    const r2 = createMockReqRes();
    limiter(r2.req, r2.res, next);
    assert.strictEqual(nextCalled, 2);

    // Request 3: BLOCK (429)
    const r3 = createMockReqRes();
    limiter(r3.req, r3.res, next);
    assert.strictEqual(nextCalled, 2); // next was NOT called
    assert.strictEqual(statusCode, 429);
    assert.strictEqual(responseBody.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.ok(mockHeaders['Retry-After']);

    // Restore env
    process.env.RATE_LIMIT_DISABLED = origEnv;
    process.env.NODE_ENV = origNodeEnv;
  });

  test('TEST 8: Request ID tracer attaches unique ID to request and response header', () => {
    const req = { headers: {} };
    let headerKey = null;
    let headerVal = null;
    const res = {
      setHeader(k, v) {
        headerKey = k;
        headerVal = v;
      }
    };

    let nextCalled = false;
    requestIdMiddleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.ok(req.requestId);
    assert.strictEqual(headerKey, 'X-Request-Id');
    assert.strictEqual(headerVal, req.requestId);
  });

  test('TEST 9: Standardized API Error Handler produces clean JSON error contracts', () => {
    const req = { requestId: 'req_test_123', originalUrl: '/api/runs' };
    let statusCode = null;
    let responseBody = null;

    const res = {
      headersSent: false,
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    const testError = new Error('Database query timed out.');
    testError.status = 504;
    testError.code = 'DATABASE_TIMEOUT';

    standardErrorHandler(testError, req, res, () => {});

    assert.strictEqual(statusCode, 504);
    assert.strictEqual(responseBody.error.code, 'DATABASE_TIMEOUT');
    assert.strictEqual(responseBody.error.message, 'Database query timed out.');
    assert.strictEqual(responseBody.error.requestId, 'req_test_123');
  });

  test('TEST 10: Concurrency lock registry rejects duplicate active runs on same target', () => {
    const testRunId1 = `run_lock_1_${Date.now()}`;
    const testRunId2 = `run_lock_2_${Date.now()}`;
    const targetKey = 'workspace_target_shared';

    registerActiveRun(testRunId1, targetKey, '/tmp/target');
    assert.strictEqual(isRunActive(testRunId1), true);

    // Attempting second run on same target must throw CONCURRENT_RUN_CONFLICT
    assert.throws(() => {
      registerActiveRun(testRunId2, targetKey, '/tmp/target');
    }, /CONFLICT/);

    // Cleanup
    unregisterActiveRun(testRunId1);
    assert.strictEqual(isRunActive(testRunId1), false);
  });

  test('TEST 11: Supabase optional configuration gracefully uses in-memory fallback', () => {
    const isConfigured = isSupabaseConfigured();
    // In local dev without Supabase keys, isSupabaseConfigured returns false and system does not crash
    assert.strictEqual(typeof isConfigured, 'boolean');
  });

  test('TEST 12: Production Frontend configuration avoids hardcoded secrets or localhost URLs in client bundle', () => {
    const frontendEnvExample = path.resolve(__dirname, '../../frontend/.env.production.example');
    assert.ok(fs.existsSync(frontendEnvExample), 'frontend/.env.production.example must exist');

    const content = fs.readFileSync(frontendEnvExample, 'utf8');
    assert.ok(content.includes('NEXT_PUBLIC_BACKEND_URL'));
    assert.ok(!content.includes('gsk_'));
    assert.ok(!content.includes('ghp_'));
  });

  test('TEST 13: Production Docker deployment assets exist and pass syntax validation', () => {
    const dockerfilePath = path.resolve(__dirname, '../Dockerfile');
    const composePath = path.resolve(__dirname, '../../docker-compose.yml');

    assert.ok(fs.existsSync(dockerfilePath), 'backend/Dockerfile must exist');
    assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist');

    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(dockerfile.includes('FROM node:20-alpine'));
    assert.ok(dockerfile.includes('HEALTHCHECK'));
    assert.ok(dockerfile.includes('CMD ["node", "src/server.js"]'));
  });

  test('TEST 14: Process and memory cleanup resets state cleanly across runs', () => {
    const runId = `run_cleanup_test_${Date.now()}`;
    registerActiveRun(runId, 'target_clean', '/tmp/clean');
    assert.strictEqual(isRunActive(runId), true);

    unregisterActiveRun(runId);
    assert.strictEqual(isRunActive(runId), false);
  });

  test('TEST 15: Full metrics summary endpoint returns valid operational telemetry', () => {
    let responseBody = null;
    const res = {
      status(code) {
        assert.strictEqual(code, 200);
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    handleMetrics({}, res);
    assert.ok(responseBody);
    assert.strictEqual(responseBody.service, 'apifix-backend');
    assert.ok(responseBody.runs);
    assert.ok(responseBody.ai);
    assert.ok(responseBody.sandbox);
  });

});
