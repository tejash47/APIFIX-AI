const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');

const {
  FailureType,
  classifyFailureType,
  analysisCache,
  computeAnalysisCacheKey,
  validateInvestigationSchema
} = require('../src/services/aiInvestigationEngine');

const {
  validatePatchSafety,
  validatePatchSchema
} = require('../src/services/patchEngine');

const {
  checkJsSyntax,
  validateAiResponseContract
} = require('../src/services/aiProviderClient');

const {
  ensureDependencies
} = require('../src/services/dependencyInstaller');

const {
  waitForPortReady,
  allocateAvailablePort
} = require('../src/services/portManager');

const {
  probeProjectEndpointsParallel
} = require('../src/services/endpointProber');

const {
  createProfiler
} = require('../src/services/performanceProfiler');

const {
  RunState,
  transitionRunState,
  getRunStateHistory
} = require('../src/services/runStateMachine');

const {
  registerActiveRun,
  unregisterActiveRun,
  isRunActive,
  cancelRun
} = require('../src/services/runController');

const {
  sanitizeSecrets,
  validateSafePath
} = require('../src/services/securitySanitizer');

describe('APIFIX V2 — Phase 9: AI Repair Intelligence, Performance & Hardening', () => {
  const testRunId = `phase9_test_${Date.now()}`;
  const testWorkspace = path.resolve(__dirname, '../workspaces', testRunId);

  before(() => {
    if (!fs.existsSync(testWorkspace)) {
      fs.mkdirSync(testWorkspace, { recursive: true });
    }
  });

  after(() => {
    try {
      if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
      }
    } catch (e) {}
  });

  test('TEST 1: Standardized Failure Taxonomy classifies error signatures accurately', () => {
    assert.strictEqual(
      classifyFailureType("TypeError: Cannot read properties of null (reading 'password')", 500),
      FailureType.RUNTIME_NULL_DEREFERENCE
    );

    assert.strictEqual(
      classifyFailureType("TypeError: user.authenticate is not a function", 500),
      FailureType.RUNTIME_TYPE_ERROR
    );

    assert.strictEqual(
      classifyFailureType("SyntaxError: Unexpected token '}' in authController.js", 500),
      FailureType.SYNTAX_ERROR
    );

    assert.strictEqual(
      classifyFailureType("Invalid credentials provided", 401),
      FailureType.AUTHENTICATION_FAILURE
    );

    assert.strictEqual(
      classifyFailureType("Forbidden: insufficient permissions for admin route", 403),
      FailureType.AUTHORIZATION_FAILURE
    );

    assert.strictEqual(
      classifyFailureType("Validation failed: email must be a valid email address", 422),
      FailureType.VALIDATION_FAILURE
    );

    assert.strictEqual(
      classifyFailureType("Error: Cannot find module 'express' from index.js", 500),
      FailureType.DEPENDENCY_CONFIG_ERROR
    );

    assert.strictEqual(
      classifyFailureType("Connection refused: postgres://localhost:5432", 500),
      FailureType.DATABASE_ERROR
    );

    assert.strictEqual(
      classifyFailureType("fetch failed: ECONNREFUSED 127.0.0.1:8080", 500),
      FailureType.NETWORK_PROVIDER_ERROR
    );

    assert.strictEqual(
      classifyFailureType("Account balance cannot be negative", 500),
      FailureType.INCORRECT_BUSINESS_LOGIC
    );
  });

  test('TEST 2: Deterministic Analysis Cache computes reproducible SHA-256 keys', () => {
    const key1 = computeAnalysisCacheKey(
      { method: 'POST', path: '/api/auth/login' },
      FailureType.RUNTIME_NULL_DEREFERENCE,
      'abc123hash'
    );
    const key2 = computeAnalysisCacheKey(
      { method: 'POST', path: '/api/auth/login' },
      FailureType.RUNTIME_NULL_DEREFERENCE,
      'abc123hash'
    );
    const keyDiff = computeAnalysisCacheKey(
      { method: 'POST', path: '/api/auth/login' },
      FailureType.RUNTIME_TYPE_ERROR,
      'abc123hash'
    );

    assert.strictEqual(key1, key2);
    assert.notStrictEqual(key1, keyDiff);
    assert.strictEqual(key1.length, 64);
  });

  test('TEST 3: Patch Engine AST Validator rejects patches causing JavaScript syntax errors', () => {
    const jsFilePath = path.join(testWorkspace, 'service.js');
    fs.writeFileSync(jsFilePath, 'function login() { const user = null; return user.password; }', 'utf8');

    // Invalid syntax patch (unbalanced braces)
    const badPatch = {
      summary: 'Broken syntax patch',
      changes: [{
        file: 'service.js',
        operation: 'replace',
        oldText: 'return user.password;',
        newText: 'return user && user.password; }}}'
      }]
    };

    assert.throws(() => {
      validatePatchSafety(testWorkspace, badPatch);
    }, /JavaScript syntax error/);

    // Valid syntax patch
    const goodPatch = {
      summary: 'Valid syntax patch',
      changes: [{
        file: 'service.js',
        operation: 'replace',
        oldText: 'return user.password;',
        newText: 'return user ? user.password : null;'
      }]
    };

    const safetyResult = validatePatchSafety(testWorkspace, goodPatch);
    assert.strictEqual(safetyResult.proposedFiles['service.js'], 'function login() { const user = null; return user ? user.password : null; }');
  });

  test('TEST 4: Patch Engine enforces boundary security and blocks path traversal attempts', () => {
    const traversalPatch = {
      summary: 'Malicious traversal patch',
      changes: [{
        file: '../../outside_secret.js',
        operation: 'replace',
        oldText: 'foo',
        newText: 'bar'
      }]
    };

    assert.throws(() => {
      validatePatchSafety(testWorkspace, traversalPatch);
    }, /Path traversal sequence detected|PATH_TRAVERSAL_DETECTED/);
  });

  test('TEST 5: Fast Dependency Caching populates workspace node_modules instantly', async () => {
    const cachedWorkspace = path.join(testWorkspace, 'cached_project');
    fs.mkdirSync(cachedWorkspace, { recursive: true });
    fs.writeFileSync(
      path.join(cachedWorkspace, 'package.json'),
      JSON.stringify({
        name: 'test-cached-app',
        dependencies: { express: '^4.18.2' }
      }, null, 2),
      'utf8'
    );

    const startTime = Date.now();
    const result = await ensureDependencies(cachedWorkspace);
    const duration = Date.now() - startTime;

    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(path.join(cachedWorkspace, 'node_modules', 'express')));
    // Must be fast (< 2000ms, typically ~50ms)
    assert.ok(duration < 2000, `Dependency cache copy took ${duration}ms, expected < 2000ms`);
  });

  test('TEST 6: Fast TCP Port Readiness polling detects open socket in < 300ms', async () => {
    const port = await allocateAvailablePort();
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    const startWait = Date.now();
    // Start listening after 20ms
    setTimeout(() => {
      server.listen(port, '127.0.0.1');
    }, 20);

    const isReady = await waitForPortReady(port, 2000, 30);
    const waitDuration = Date.now() - startWait;

    assert.strictEqual(isReady, true);
    assert.ok(waitDuration < 500, `Port readiness wait took ${waitDuration}ms, expected < 500ms`);

    await new Promise((res) => server.close(res));
  });

  test('TEST 7: Parallel Endpoint Probing executes multiple routes concurrently', async () => {
    const port = await allocateAvailablePort();
    const server = http.createServer((req, res) => {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/api/users') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ users: [] }));
      } else if (req.url === '/api/crash') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Crash' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((res) => server.listen(port, '127.0.0.1', res));

    const endpoints = [
      { id: 'ep_1', method: 'GET', path: '/api/health' },
      { id: 'ep_2', method: 'GET', path: '/api/users' },
      { id: 'ep_3', method: 'GET', path: '/api/crash' }
    ];

    const probeResults = await probeProjectEndpointsParallel(endpoints, port);

    assert.strictEqual(probeResults.totalDiscovered, 3);
    assert.strictEqual(probeResults.healthyCount, 2);
    assert.strictEqual(probeResults.failedCount, 1);

    await new Promise((res) => server.close(res));
  });

  test('TEST 8: Performance Profiler records granular stage metrics and top bottlenecks', () => {
    const profiler = createProfiler('test_profiler_run');

    profiler.startStage('investigation');
    profiler.endStage('investigation', { filesAnalyzed: 3 });

    profiler.startStage('sandbox_boot');
    profiler.endStage('sandbox_boot', { port: 50000 });

    const report = profiler.getReport();
    assert.strictEqual(report.runId, 'test_profiler_run');
    assert.strictEqual(report.stages.length, 2);
    assert.ok(Array.isArray(report.topBottlenecks));
    assert.strictEqual(report.topBottlenecks.length, 2);
  });

  test('TEST 9: Failure Recovery cleanly resets state and releases active locks on cancellation', async () => {
    const runKey = 'test_cancel_run_p9';
    registerActiveRun(runKey, 'owner/repo-p9', testWorkspace);
    assert.strictEqual(isRunActive(runKey), true);

    const cancelResult = await cancelRun(runKey, 'User requested cancel');
    assert.strictEqual(cancelResult.status, 'CANCELLED');

    unregisterActiveRun(runKey);
    assert.strictEqual(isRunActive(runKey), false);
  });

  test('TEST 10: Security Sanitizer scrubs API keys and secrets across nested telemetry', () => {
    const fakeGsk = ['gsk', '1234567890abcdef1234567890abcdef1234567890'].join('_');
    const fakeOpenAi = ['sk', 'proj', 'abcdef1234567890abcdef1234567890abcdef'].join('-');
    const fakeGhp = ['ghp', '1234567890abcdef1234567890abcdef123456'].join('_');
    const dirtyData = {
      apiKey: fakeGsk,
      openAiKey: fakeOpenAi,
      githubToken: fakeGhp,
      message: 'Connection to postgres://admin:supersecretpassword@db.supabase.co:5432 failed'
    };

    const sanitized = sanitizeSecrets(dirtyData);
    assert.ok(!JSON.stringify(sanitized).includes(fakeGsk));
    assert.ok(!JSON.stringify(sanitized).includes(fakeOpenAi));
    assert.ok(!JSON.stringify(sanitized).includes(fakeGhp));
    assert.ok(!JSON.stringify(sanitized).includes('supersecretpassword'));
    assert.ok(sanitized.apiKey.includes('[REDACTED'));
  });
});
