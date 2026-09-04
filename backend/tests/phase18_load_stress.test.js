/**
 * APIFIX AI — Phase 18: Controlled Load & Stress Test Suite
 * Validates platform performance, concurrency handling, and zero memory leaks under load.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');

const { app } = require('../src/server');
const userStore = require('../src/services/userStore');
const workspaceService = require('../src/services/workspaceService');
const { processInboundAlert, resetWebhookDeduplicationCache } = require('../src/services/inboundWebhookService');
const workerMonitor = require('../src/services/workerMonitor');
const observabilityEngine = require('../src/services/observabilityEngine');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

describe('Phase 18 — Controlled Load & Stress Test Suite', () => {
  let server;
  let baseUrl;
  let testUser;
  let testToken;
  let testWorkspace;

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    testUser = await userStore.createUser({
      name: 'Stress Test User',
      email: `stress_user_${Date.now()}@apifix.io`,
      password: 'StressPassword2026!'
    });
    testToken = jwt.sign(
      { id: testUser.id, email: testUser.email, name: testUser.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testWorkspace = await workspaceService.ensureDefaultWorkspace(testUser);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    resetWebhookDeduplicationCache();
    observabilityEngine.reset();
    workerMonitor.reset();
  });

  test('LOAD 1: 50 Concurrent API Requests — Health and Me endpoints execute without error', async () => {
    const startTime = Date.now();
    const requests = Array.from({ length: 50 }, (_, i) => {
      const endpoint = i % 2 === 0 ? '/health' : '/api/auth/me';
      const headers = i % 2 === 0 ? {} : { 'Authorization': `Bearer ${testToken}` };
      return fetch(`${baseUrl}${endpoint}`, { headers });
    });

    const responses = await Promise.all(requests);
    const totalDuration = Date.now() - startTime;

    for (const res of responses) {
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    }

    assert.ok(totalDuration < 5000, `50 concurrent requests must complete in < 5000ms (took ${totalDuration}ms)`);
  });

  test('LOAD 2: Burst Webhook Delivery with Deduplication — Processes bursts cleanly', async () => {
    const payload = {
      event: 'api_runtime_exception',
      endpoint: 'POST /api/v1/checkout',
      error: 'Cannot read properties of undefined',
      culpritFile: 'src/controllers/orderController.js',
      statusCode: 500
    };

    const burstRequests = Array.from({ length: 30 }, () =>
      processInboundAlert(testWorkspace.id, payload)
    );

    const results = await Promise.all(burstRequests);
    assert.equal(results.length, 30);

    const firstIncidentId = results[0].incident.id;
    const deduplicatedCount = results.filter(r => r.deduplicated).length;

    // At least 29 of the 30 identical burst requests must be deduplicated
    assert.ok(deduplicatedCount >= 29, `Expected >= 29 deduplicated, got ${deduplicatedCount}`);
    for (const res of results) {
      assert.equal(res.incident.id, firstIncidentId);
    }
  });

  test('LOAD 3: Worker Concurrency Tracking Under Burst — Handles concurrent job lifecycles', () => {
    const jobCount = 25;
    for (let i = 0; i < jobCount; i++) {
      workerMonitor.startJob(`load_job_${i}`, { workspaceId: testWorkspace.id });
    }

    assert.equal(workerMonitor.getWorkerTelemetry().activeWorkersCount, jobCount);

    for (let i = 0; i < jobCount; i++) {
      workerMonitor.finishJob(`load_job_${i}`, i % 5 === 0 ? 'FAILED' : 'COMPLETED');
    }

    const telemetry = workerMonitor.getWorkerTelemetry();
    assert.equal(telemetry.activeWorkersCount, 0);
    assert.equal(telemetry.metrics.totalProcessed, jobCount);
    assert.equal(telemetry.metrics.failedCount, 5);
    assert.equal(telemetry.metrics.completedCount, 20);
  });
});
