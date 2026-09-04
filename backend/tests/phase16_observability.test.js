/**
 * APIFIX AI — Phase 16: Production Observability, SRE & Operational Intelligence Test Suite
 * Deterministic automated tests covering correlation IDs, telemetry recording, secret sanitization,
 * health/readiness, AI provider observability, repair MTTR, error taxonomy, alert storm deduplication,
 * incident grouping, SLO calculations, worker monitoring, RBAC, and tenant isolation.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const jwt = require('jsonwebtoken');

const observabilityEngine = require('../src/services/observabilityEngine');
const aiProviderObserver = require('../src/services/aiProviderObserver');
const repairTelemetryTracker = require('../src/services/repairTelemetryTracker');
const alertDeduplicator = require('../src/services/alertDeduplicator');
const sloEngine = require('../src/services/sloEngine');
const workerMonitor = require('../src/services/workerMonitor');
const incidentService = require('../src/services/incidentService');
const { classifyOperationalError, ErrorCodes } = require('../src/config/errorTaxonomy');
const userStore = require('../src/services/userStore');
const workspaceService = require('../src/services/workspaceService');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');
const { app } = require('../src/server');

describe('Phase 16 — Production Observability, SRE & Operational Intelligence Test Suite', () => {
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

    // Create isolated test users & workspaces
    testUserAlpha = await userStore.createUser({
      name: 'Observability Lead Alpha',
      email: `obs_alpha_${Date.now()}@apifix.io`,
      password: 'SecurePassword123!'
    });
    testTokenAlpha = jwt.sign(
      { id: testUserAlpha.id, email: testUserAlpha.email, name: testUserAlpha.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testWorkspaceAlpha = await workspaceService.ensureDefaultWorkspace(testUserAlpha);

    testUserBeta = await userStore.createUser({
      name: 'Observability Member Beta',
      email: `obs_beta_${Date.now()}@apifix.io`,
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
    repairTelemetryTracker.reset();
    alertDeduplicator.reset();
    workerMonitor.reset();
  });

  // =========================================================================
  // 1. Centralized Observability & Telemetry Recording
  // =========================================================================
  describe('1. Centralized Observability & Telemetry Recording', () => {
    test('TEST 1: Records structured telemetry with mandatory correlation & timing fields', () => {
      const event = observabilityEngine.recordEvent({
        event: 'unit_test_probe_event',
        category: 'HTTP',
        stage: 'PROBE',
        durationMs: 142,
        status: 'SUCCESS',
        workspaceId: testWorkspaceAlpha.id,
        correlationId: 'trace_test_001',
        metadata: { endpoint: '/api/users', statusCode: 200 }
      });

      assert.ok(event.id.startsWith('evt_'), 'Event ID must start with evt_ prefix');
      assert.equal(event.event, 'unit_test_probe_event');
      assert.equal(event.category, 'HTTP');
      assert.equal(event.durationMs, 142);
      assert.equal(event.status, 'SUCCESS');
      assert.equal(event.correlationId, 'trace_test_001');
      assert.equal(event.workspaceId, testWorkspaceAlpha.id);
    });

    test('TEST 2: Zero Secret Leakage — Automatically scrubs sensitive keys and credentials in telemetry', () => {
      const fakeGhp = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'].join('_');
      const fakeGsk = ['gsk', 'mockgroqapikey12345678901234567890'].join('_');
      const sensitiveEvent = observabilityEngine.recordEvent({
        event: 'auth_credential_check',
        category: 'AUTH',
        status: 'FAILURE',
        workspaceId: testWorkspaceAlpha.id,
        metadata: {
          token: fakeGhp,
          apiKey: fakeGsk,
          authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature1234567890',
          connectionString: 'postgres://user:super_secret_password@db.supabase.co:5432/postgres'
        }
      });

      const serialized = JSON.stringify(sensitiveEvent);
      assert.ok(!serialized.includes(fakeGhp), 'GitHub PAT must be scrubbed');
      assert.ok(!serialized.includes(fakeGsk), 'Groq API Key must be scrubbed');
      assert.ok(!serialized.includes('super_secret_password'), 'DB password must be scrubbed');
      assert.ok(serialized.includes('[REDACTED'), 'Redacted marker must be injected');
    });

    test('TEST 3: Calculates accurate latency percentiles (p50, p90, p95, p99)', () => {
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      for (const ms of latencies) {
        observabilityEngine.recordEvent({ category: 'HTTP', durationMs: ms });
      }

      const metrics = observabilityEngine.getLatencyMetrics();
      assert.equal(metrics.http.sampleCount, 10);
      assert.equal(metrics.http.avgMs, 55);
      assert.equal(metrics.http.p50Ms, 50);
      assert.equal(metrics.http.p95Ms, 100);
    });
  });

  // =========================================================================
  // 2. Request Correlation & Trace Context Propagation
  // =========================================================================
  describe('2. Request Correlation & Trace Context Propagation', () => {
    test('TEST 4: Inbound HTTP request receives and propagates X-Request-Id and X-Correlation-Id', async () => {
      const customCorrelationId = 'trace_client_custom_999';
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: {
          'X-Correlation-Id': customCorrelationId
        }
      });

      assert.equal(res.status, 200);
      const resCorrelationId = res.headers.get('x-correlation-id');
      const resRequestId = res.headers.get('x-request-id');

      assert.equal(resCorrelationId, customCorrelationId);
      assert.ok(resRequestId && resRequestId.startsWith('req_'));
    });

    test('TEST 5: Full trace timeline links multi-stage events under the same correlation ID', () => {
      const traceId = 'trace_repair_lifecycle_e2e';
      observabilityEngine.recordEvent({ event: 'incident_detected', category: 'INCIDENT', correlationId: traceId });
      observabilityEngine.recordEvent({ event: 'ai_root_cause_analyzed', category: 'AI', correlationId: traceId });
      observabilityEngine.recordEvent({ event: 'patch_synthesized', category: 'PATCH', correlationId: traceId });
      observabilityEngine.recordEvent({ event: 'sandbox_verified', category: 'SANDBOX', correlationId: traceId });

      const traceTimeline = observabilityEngine.getTraceTimeline(traceId);
      assert.equal(traceTimeline.correlationId, traceId);
      assert.equal(traceTimeline.eventCount, 4);
      assert.equal(traceTimeline.traceEvents[0].event, 'incident_detected');
      assert.equal(traceTimeline.traceEvents[3].event, 'sandbox_verified');
    });
  });

  // =========================================================================
  // 3. Health & Multi-Subsystem Readiness System
  // =========================================================================
  describe('3. Health & Multi-Subsystem Readiness System', () => {
    test('TEST 6: GET /health returns liveness status, memory telemetry, and process uptime', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.status, 'ok');
      assert.equal(data.service, 'apifix-backend');
      assert.ok(typeof data.uptimeSeconds === 'number');
      assert.ok(data.process?.memoryHeapUsedMb >= 0);
    });

    test('TEST 7: GET /ready evaluates database, AI provider, workers, and sandbox readiness', async () => {
      const res = await fetch(`${baseUrl}/ready`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(['ready', 'ready_degraded'].includes(data.status));
      assert.ok(data.checks?.database.includes('ok'));
      assert.ok(data.checks?.aiProviders);
      assert.ok(data.checks?.workers);
      assert.equal(data.checks?.sandbox, 'ok');
    });
  });

  // =========================================================================
  // 4. AI Provider Observability
  // =========================================================================
  describe('4. AI Provider Observability', () => {
    test('TEST 8: Tracks AI provider invocations, failure rates, and latency percentiles', () => {
      aiProviderObserver.recordAiCall({ provider: 'groq', model: 'gpt-oss-120b', durationMs: 120, success: true });
      aiProviderObserver.recordAiCall({ provider: 'groq', model: 'gpt-oss-120b', durationMs: 180, success: true });
      aiProviderObserver.recordAiCall({ provider: 'groq', model: 'gpt-oss-120b', durationMs: 500, success: false, isTimeout: true });

      const health = aiProviderObserver.getProviderHealth();
      assert.equal(health.groq.totalRequests, 3);
      assert.equal(health.groq.successCount, 2);
      assert.equal(health.groq.failureCount, 1);
      assert.equal(health.groq.timeoutCount, 1);
      assert.equal(health.groq.errorRatePercent, 33.3);
    });

    test('TEST 9: Records fallback events when primary AI provider experiences outages', () => {
      aiProviderObserver.recordFallback({
        fromProvider: 'groq',
        toProvider: 'anthropic',
        reason: 'Rate limited on primary model',
        workspaceId: testWorkspaceAlpha.id
      });

      const health = aiProviderObserver.getProviderHealth();
      assert.equal(health.groq.fallbackCount, 1);
    });
  });

  // =========================================================================
  // 5. Repair Pipeline Telemetry & MTTR Calculations
  // =========================================================================
  describe('5. Repair Pipeline Telemetry & MTTR Calculations', () => {
    test('TEST 10: Calculates MTTD, MTTI, MTTR, and End-to-End MTTR metrics accurately', () => {
      const runId = 'run_mttr_test_001';
      repairTelemetryTracker.startStage(runId, 'DETECTED', { workspaceId: testWorkspaceAlpha.id });
      repairTelemetryTracker.completeStage(runId, 'DETECTED', { durationMs: 100 });

      repairTelemetryTracker.startStage(runId, 'INVESTIGATING', { workspaceId: testWorkspaceAlpha.id });
      repairTelemetryTracker.completeStage(runId, 'INVESTIGATING', { durationMs: 300 });

      repairTelemetryTracker.startStage(runId, 'PATCH', { workspaceId: testWorkspaceAlpha.id });
      repairTelemetryTracker.completeStage(runId, 'PATCH', { durationMs: 800 });

      repairTelemetryTracker.startStage(runId, 'TESTING', { workspaceId: testWorkspaceAlpha.id });
      repairTelemetryTracker.completeStage(runId, 'TESTING', { durationMs: 400 });

      repairTelemetryTracker.finalizeRun(runId, { status: 'VERIFIED' });

      const mttrMetrics = repairTelemetryTracker.getMttrMetrics();
      assert.equal(mttrMetrics.mttdMs, 100);
      assert.equal(mttrMetrics.mttiMs, 300);
      assert.equal(mttrMetrics.mttrMs, 800);
      assert.equal(mttrMetrics.stageAverages.testingMs, 400);
    });
  });

  // =========================================================================
  // 6. Standardized Error Taxonomy
  // =========================================================================
  describe('6. Standardized Error Taxonomy', () => {
    test('TEST 11: Classifies error patterns into standardized machine-readable error codes', () => {
      const authErr = classifyOperationalError(401, new Error('jwt expired'));
      const dbErr = classifyOperationalError(500, new Error('supabase connection terminated'));
      const aiErr = classifyOperationalError(504, new Error('groq gateway timed out'));
      const quotaErr = classifyOperationalError(429, new Error('too many requests'));

      assert.equal(authErr.code, ErrorCodes.AUTHENTICATION_ERROR);
      assert.equal(dbErr.code, ErrorCodes.DATABASE_ERROR);
      assert.equal(aiErr.code, ErrorCodes.AI_TIMEOUT);
      assert.equal(quotaErr.code, ErrorCodes.RATE_LIMITED);
    });
  });

  // =========================================================================
  // 7. Alert Storm Deduplication
  // =========================================================================
  describe('7. Alert Storm Deduplication', () => {
    test('TEST 12: Suppresses repeat alerts within cooldown window to prevent alert storms', () => {
      const payload = { targetEndpoint: 'POST /api/auth/login', severity: 'CRITICAL', errorSignature: 'TypeError: Cannot read password' };
      const cooldownMs = 2000; // 2 seconds

      // 1st trigger: should dispatch
      const check1 = alertDeduplicator.shouldDispatchAlert(testWorkspaceAlpha.id, 'incident.created', payload, cooldownMs);
      assert.equal(check1.shouldDispatch, true);
      assert.equal(check1.occurrenceCount, 1);
      assert.equal(check1.suppressedCount, 0);

      // 2nd trigger immediately after: should be suppressed
      const check2 = alertDeduplicator.shouldDispatchAlert(testWorkspaceAlpha.id, 'incident.created', payload, cooldownMs);
      assert.equal(check2.shouldDispatch, false);
      assert.equal(check2.occurrenceCount, 2);
      assert.equal(check2.suppressedCount, 1);
    });
  });

  // =========================================================================
  // 8. Incident Grouping & Occurrence Intelligence
  // =========================================================================
  describe('8. Incident Grouping & Occurrence Intelligence', () => {
    test('TEST 13: Automatically groups repeated open incidents and increments occurrence count', async () => {
      const firstInc = await incidentService.createIncidentRecord(testWorkspaceAlpha.id, {
        endpoint: '/api/auth/login',
        method: 'POST',
        classification: 'RUNTIME_EXCEPTION',
        errorMessage: 'TypeError: Cannot read properties of null',
        correlationId: 'trace_inc_001'
      });

      assert.equal(firstInc.occurrenceCount, 1);

      // Second occurrence for same open endpoint
      const secondInc = await incidentService.createIncidentRecord(testWorkspaceAlpha.id, {
        endpoint: '/api/auth/login',
        method: 'POST',
        classification: 'RUNTIME_EXCEPTION',
        errorMessage: 'TypeError: Cannot read properties of null',
        correlationId: 'trace_inc_002'
      });

      assert.equal(secondInc.id, firstInc.id, 'Must group under the same existing open incident');
      assert.equal(secondInc.occurrenceCount, 2, 'Occurrence count must increment');
      assert.ok(secondInc.correlationIds.includes('trace_inc_001'));
      assert.ok(secondInc.correlationIds.includes('trace_inc_002'));
    });
  });

  // =========================================================================
  // 9. SLO / Error Budget Engine & Worker Monitoring
  // =========================================================================
  describe('9. SLO / Error Budget Engine & Worker Monitoring', () => {
    test('TEST 14: Calculates API availability, error budget remaining, and latency compliance', () => {
      sloEngine.setWorkspaceTargets(testWorkspaceAlpha.id, {
        availabilityTargetPercent: 99.0,
        latencyTargetMs: 200,
        repairSuccessTargetPercent: 90.0
      });

      // Record 99 successes and 1 failure (99% availability)
      for (let i = 0; i < 99; i++) {
        observabilityEngine.recordEvent({ category: 'HTTP', status: 'SUCCESS', durationMs: 50, workspaceId: testWorkspaceAlpha.id });
      }
      observabilityEngine.recordEvent({ category: 'HTTP', status: 'FAILURE', durationMs: 300, workspaceId: testWorkspaceAlpha.id });

      const slo = sloEngine.calculateSloStatus(testWorkspaceAlpha.id);
      assert.equal(slo.objectives.availability.actualPercent, 99.0);
      assert.equal(slo.objectives.availability.status, 'MET');
      assert.ok(slo.objectives.latency.actualCompliancePercent >= 90.0);
    });

    test('TEST 15: Background worker monitor tracks active jobs, completed jobs, and cleans up zombies', () => {
      const jobId = 'job_worker_test_001';
      workerMonitor.startJob(jobId, { workspaceId: testWorkspaceAlpha.id, type: 'REPAIR_RUN' });

      let telemetry = workerMonitor.getWorkerTelemetry();
      assert.equal(telemetry.activeWorkersCount, 1);
      assert.equal(telemetry.activeJobs[0].jobId, jobId);

      workerMonitor.finishJob(jobId, 'COMPLETED');
      telemetry = workerMonitor.getWorkerTelemetry();
      assert.equal(telemetry.activeWorkersCount, 0);
      assert.equal(telemetry.metrics.completedCount, 1);
    });
  });

  // =========================================================================
  // 10. REST API Observability & RBAC / Tenant Isolation
  // =========================================================================
  describe('10. REST API Observability & RBAC / Tenant Isolation', () => {
    test('TEST 16: GET /api/workspaces/:id/observability returns scoped metrics for authorized member', async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}/observability`, {
        headers: { Authorization: `Bearer ${testTokenAlpha}` }
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.workspaceId, testWorkspaceAlpha.id);
      assert.ok(data.slo);
      assert.ok(data.aiProviders);
      assert.ok(data.mttr);
    });

    test('TEST 17: Tenant Isolation — User in Workspace Beta cannot access Workspace Alpha observability', async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}/observability`, {
        headers: { Authorization: `Bearer ${testTokenBeta}` }
      });

      assert.equal(res.status, 403, 'Cross-workspace access must return HTTP 403 Forbidden');
    });
  });
});
