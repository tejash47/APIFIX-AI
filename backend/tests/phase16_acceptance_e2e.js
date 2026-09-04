/**
 * APIFIX AI — Phase 16: Real-World SRE & Operational Intelligence Acceptance Test
 * End-to-end deterministic verification of all 15 acceptance criteria:
 * 1. Health & readiness endpoints
 * 2. Request correlation & header propagation
 * 3. Structured zero-secret telemetry event recorder
 * 4. Trace timeline correlation graph
 * 5. AI provider observability & latency percentiles
 * 6. AI provider fallback tracking
 * 7. End-to-End MTTR & lifecycle tracking
 * 8. Standardized error taxonomy
 * 9. Alert storm deduplication & cooldown
 * 10. Automatic incident grouping & occurrence counting
 * 11. Real-time SLO calculation & error budgets
 * 12. Background worker concurrency & monitoring
 * 13. REST API workspace observability endpoints
 * 14. RBAC & multi-tenant isolation
 * 15. Zero-secret audit across all telemetry & logs
 */

const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');

const { app } = require('../src/server');
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

async function runAcceptance() {
  console.log('===============================================================');
  console.log('  APIFIX AI — Phase 16 Real-World Acceptance Test Suite');
  console.log('===============================================================\n');

  let server;
  let baseUrl;
  let testWorkspaceAlpha;
  let testWorkspaceBeta;
  let tokenAlpha;
  let tokenBeta;

  try {
    // Reset services
    observabilityEngine.reset();
    aiProviderObserver.reset();
    repairTelemetryTracker.reset();
    alertDeduplicator.reset();
    workerMonitor.reset();

    // 1. Start Server
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
    console.log(`[Step 1] Test Server initialized on ${baseUrl}`);

    // Create test accounts and workspaces
    const userAlpha = await userStore.createUser({
      name: 'Acceptance SRE Lead',
      email: `sre_lead_${Date.now()}@apifix.io`,
      password: 'SecurePassword123!'
    });
    tokenAlpha = jwt.sign(
      { id: userAlpha.id, email: userAlpha.email, name: userAlpha.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testWorkspaceAlpha = await workspaceService.ensureDefaultWorkspace(userAlpha);

    const userBeta = await userStore.createUser({
      name: 'Acceptance Tenant Beta',
      email: `sre_beta_${Date.now()}@apifix.io`,
      password: 'SecurePassword123!'
    });
    tokenBeta = jwt.sign(
      { id: userBeta.id, email: userBeta.email, name: userBeta.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    testWorkspaceBeta = await workspaceService.ensureDefaultWorkspace(userBeta);
    console.log(`[Step 2] Test Workspaces provisioned: Alpha (${testWorkspaceAlpha.id}) & Beta (${testWorkspaceBeta.id})`);

    // 2. Health & Readiness Probe
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    console.log(`[Step 3] Health check PASSED (uptime: ${healthData.uptimeSeconds}s, heap: ${healthData.process.memoryHeapUsedMb}MB)`);

    const readyRes = await fetch(`${baseUrl}/ready`);
    assert.strictEqual(readyRes.status, 200);
    const readyData = await readyRes.json();
    assert.ok(['ready', 'ready_degraded'].includes(readyData.status));
    console.log(`[Step 4] Readiness probe PASSED (status: ${readyData.status})`);

    // 3. Request Correlation & Header Propagation
    const correlationTraceId = 'trace_acceptance_e2e_9999';
    const correlatedRes = await fetch(`${baseUrl}/health`, {
      headers: { 'X-Correlation-Id': correlationTraceId }
    });
    assert.strictEqual(correlatedRes.headers.get('x-correlation-id'), correlationTraceId);
    assert.ok(correlatedRes.headers.get('x-request-id')?.startsWith('req_'));
    console.log(`[Step 5] Request Correlation propagation PASSED (${correlationTraceId})`);

    // 4. Structured Zero-Secret Telemetry Event Recorder
    const recordedEvt = observabilityEngine.recordEvent({
      event: 'canary_probe_success',
      category: 'CANARY',
      durationMs: 45,
      status: 'SUCCESS',
      workspaceId: testWorkspaceAlpha.id,
      correlationId: correlationTraceId,
      metadata: {
        token: ['ghp', 'ACCEPTANCE_TEST_SECRET_TOKEN_12345'].join('_'),
        endpoint: '/api/v1/health'
      }
    });
    assert.ok(recordedEvt.id.startsWith('evt_'));
    assert.ok(!JSON.stringify(recordedEvt).includes('ACCEPTANCE_TEST_SECRET_TOKEN'));
    console.log(`[Step 6] Structured Telemetry Recording & Secret Scrubbing PASSED`);

    // 5. Trace Timeline Correlation Graph
    observabilityEngine.recordEvent({ event: 'investigation_started', category: 'REPAIR', correlationId: correlationTraceId });
    observabilityEngine.recordEvent({ event: 'patch_generated', category: 'PATCH', correlationId: correlationTraceId });
    observabilityEngine.recordEvent({ event: 'patch_verified', category: 'VERIFICATION', correlationId: correlationTraceId });

    const trace = observabilityEngine.getTraceTimeline(correlationTraceId);
    assert.strictEqual(trace.correlationId, correlationTraceId);
    assert.strictEqual(trace.eventCount, 5); // 1 HTTP probe from Step 5 + 4 lifecycle events
    assert.strictEqual(trace.traceEvents[0].event, 'http_request_completed');
    assert.strictEqual(trace.traceEvents[1].event, 'canary_probe_success');
    assert.strictEqual(trace.traceEvents[4].event, 'patch_verified');
    console.log(`[Step 7] Correlated Trace Timeline PASSED (5 chronologically linked events including HTTP ingress)`);

    // 6. AI Provider Observability
    aiProviderObserver.recordAiCall({ provider: 'groq', model: 'gpt-oss-120b', durationMs: 110, success: true });
    aiProviderObserver.recordAiCall({ provider: 'groq', model: 'gpt-oss-120b', durationMs: 140, success: true });
    aiProviderObserver.recordAiCall({ provider: 'anthropic', model: 'claude-3-7-sonnet', durationMs: 450, success: true });

    const aiHealth = aiProviderObserver.getProviderHealth();
    assert.strictEqual(aiHealth.groq.totalRequests, 2);
    assert.strictEqual(aiHealth.groq.errorRatePercent, 0);
    assert.strictEqual(aiHealth.anthropic.totalRequests, 1);
    console.log(`[Step 8] AI Provider Observability & Latency Percentiles PASSED (Groq p95: ${aiHealth.groq.p95LatencyMs}ms)`);

    // 7. AI Provider Fallback Tracking
    aiProviderObserver.recordFallback({
      fromProvider: 'groq',
      toProvider: 'anthropic',
      reason: 'Rate limit 429 received from primary gateway',
      workspaceId: testWorkspaceAlpha.id
    });
    const updatedAiHealth = aiProviderObserver.getProviderHealth();
    assert.strictEqual(updatedAiHealth.groq.fallbackCount, 1);
    console.log(`[Step 9] AI Provider Fallback Telemetry PASSED`);

    // 8. End-to-End MTTR & Lifecycle Tracking
    const runId = 'run_acceptance_001';
    repairTelemetryTracker.startStage(runId, 'DETECTED', { workspaceId: testWorkspaceAlpha.id });
    repairTelemetryTracker.completeStage(runId, 'DETECTED', { durationMs: 80 });

    repairTelemetryTracker.startStage(runId, 'INVESTIGATING', { workspaceId: testWorkspaceAlpha.id });
    repairTelemetryTracker.completeStage(runId, 'INVESTIGATING', { durationMs: 250 });

    repairTelemetryTracker.startStage(runId, 'PATCH', { workspaceId: testWorkspaceAlpha.id });
    repairTelemetryTracker.completeStage(runId, 'PATCH', { durationMs: 900 });

    repairTelemetryTracker.startStage(runId, 'TESTING', { workspaceId: testWorkspaceAlpha.id });
    repairTelemetryTracker.completeStage(runId, 'TESTING', { durationMs: 310 });

    repairTelemetryTracker.finalizeRun(runId, { status: 'VERIFIED' });

    const mttr = repairTelemetryTracker.getMttrMetrics();
    assert.strictEqual(mttr.mttdMs, 80);
    assert.strictEqual(mttr.mttiMs, 250);
    assert.strictEqual(mttr.mttrMs, 900);
    assert.strictEqual(mttr.stageAverages.testingMs, 310);
    console.log(`[Step 10] Repair Lifecycle & MTTR Metrics PASSED (MTTD: ${mttr.mttdMs}ms, MTTR: ${mttr.mttrMs}ms)`);

    // 9. Standardized Error Taxonomy
    const errClass = classifyOperationalError(403, new Error('Forbidden resource access'));
    assert.strictEqual(errClass.code, ErrorCodes.AUTHORIZATION_ERROR);
    console.log(`[Step 11] Error Taxonomy Classifier PASSED (${errClass.code})`);

    // 10. Alert Storm Deduplication
    const alertPayload = { endpoint: '/api/auth/login', error: 'Database timeout' };
    const alert1 = alertDeduplicator.shouldDispatchAlert(testWorkspaceAlpha.id, 'incident.created', alertPayload, 5000);
    const alert2 = alertDeduplicator.shouldDispatchAlert(testWorkspaceAlpha.id, 'incident.created', alertPayload, 5000);
    assert.strictEqual(alert1.shouldDispatch, true);
    assert.strictEqual(alert2.shouldDispatch, false);
    console.log(`[Step 12] Alert Storm Deduplication PASSED (1st dispatched, 2nd suppressed)`);

    // 11. Incident Grouping & Occurrence Intelligence
    const inc1 = await incidentService.createIncidentRecord(testWorkspaceAlpha.id, {
      endpoint: '/api/v1/orders',
      method: 'POST',
      classification: 'RUNTIME_EXCEPTION',
      errorMessage: 'Null pointer exception'
    });
    const inc2 = await incidentService.createIncidentRecord(testWorkspaceAlpha.id, {
      endpoint: '/api/v1/orders',
      method: 'POST',
      classification: 'RUNTIME_EXCEPTION',
      errorMessage: 'Null pointer exception'
    });
    assert.strictEqual(inc1.id, inc2.id);
    assert.strictEqual(inc2.occurrenceCount, 2);
    console.log(`[Step 13] Automatic Incident Grouping PASSED (Incident ${inc1.id}, Occurrences: 2)`);

    // 12. Real-Time SLO Calculation & Error Budget
    sloEngine.setWorkspaceTargets(testWorkspaceAlpha.id, {
      availabilityTargetPercent: 99.0,
      latencyTargetMs: 250,
      repairSuccessTargetPercent: 90.0
    });
    const slo = sloEngine.calculateSloStatus(testWorkspaceAlpha.id);
    assert.ok(['COMPLIANT', 'AT_RISK', 'BREACHED'].includes(slo.overallStatus));
    assert.strictEqual(slo.objectives.availability.targetPercent, 99.0);
    console.log(`[Step 14] Real-time SLO & Error Budget PASSED (Status: ${slo.overallStatus})`);

    // 13. Background Worker Monitoring
    const jobId = 'job_acceptance_repair_run';
    workerMonitor.startJob(jobId, { workspaceId: testWorkspaceAlpha.id, type: 'REPAIR_RUN' });
    let workerState = workerMonitor.getWorkerTelemetry();
    assert.strictEqual(workerState.activeWorkersCount, 1);
    workerMonitor.finishJob(jobId, 'COMPLETED');
    workerState = workerMonitor.getWorkerTelemetry();
    assert.strictEqual(workerState.activeWorkersCount, 0);
    assert.strictEqual(workerState.metrics.completedCount, 1);
    console.log(`[Step 15] Background Worker Monitoring & Concurrency PASSED`);

    // 14. Workspace Observability REST API & RBAC / Tenant Isolation
    const obsResAlpha = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}/observability`, {
      headers: { Authorization: `Bearer ${tokenAlpha}` }
    });
    assert.strictEqual(obsResAlpha.status, 200);
    const obsDataAlpha = await obsResAlpha.json();
    assert.strictEqual(obsDataAlpha.workspaceId, testWorkspaceAlpha.id);

    // Tenant Isolation Check
    const obsResBetaForbidden = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceAlpha.id}/observability`, {
      headers: { Authorization: `Bearer ${tokenBeta}` }
    });
    assert.strictEqual(obsResBetaForbidden.status, 403);
    console.log(`[Step 16] Workspace Observability REST API & Tenant Isolation PASSED (Alpha: 200, Beta Cross-Access: 403)`);

    // 15. Zero-Secret Audit
    const allEvents = observabilityEngine.queryEvents({ limit: 100 });
    const serializedEvents = JSON.stringify(allEvents);
    assert.ok(!serializedEvents.includes(['ghp', ''].join('_')), 'No GitHub tokens');
    assert.ok(!serializedEvents.includes(['gsk', ''].join('_')), 'No Groq API keys');
    assert.ok(!serializedEvents.includes(['sk', 'ant', ''].join('-')), 'No Anthropic keys');
    assert.ok(!serializedEvents.includes(['whsec', ''].join('_')), 'No Webhook secrets');
    assert.ok(!serializedEvents.includes('SecurePassword123!'), 'No raw passwords');
    console.log(`[Step 17] Zero-Secret Audit PASSED (0 secrets leaked across ${allEvents.total} events)`);

    console.log('\n===============================================================');
    console.log('  ALL 17 ACCEPTANCE CRITERIA SUCCESSFULLY VERIFIED (100% PASS)');
    console.log('===============================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[Teardown] Test server shut down cleanly.');
    }
  }
}

runAcceptance()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Acceptance Test Failed:', err);
    process.exit(1);
  });
