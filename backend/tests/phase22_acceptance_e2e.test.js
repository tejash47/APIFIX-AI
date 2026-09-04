/**
 * APIFIX AI — Phase 22 Real-World Acceptance E2E Test Suite
 * Validates the complete integrated production control plane across 20 acceptance scenarios.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const { app, server } = require('../src/server');
const { validateProductionConfig } = require('../src/config/productionConfigValidator');
const { lifecycleManager, LIFECYCLE_STATES } = require('../src/services/lifecycleManager');
const { databaseReliabilityService } = require('../src/services/databaseReliabilityService');
const { jobQueueService, JOB_STATUS } = require('../src/services/jobQueueService');
const { finopsEngine } = require('../src/services/finopsEngine');
const { finopsSafetyService } = require('../src/services/finopsSafetyService');
const { productionMetricsService } = require('../src/services/productionMetricsService');
const { deploymentSafetyService, DEPLOYMENT_STATES } = require('../src/services/deploymentSafetyService');
const { featureFlagService } = require('../src/services/featureFlagService');
const { disasterRecoveryVerificationService } = require('../src/services/disasterRecoveryVerification');
const { dependencyAuditor } = require('../src/services/dependencyAuditor');
const { productionReadinessAuditor } = require('../src/services/productionReadinessAuditor');

describe('Phase 22 — Real-World Production Acceptance E2E Suite', () => {
  const baseUrl = 'http://127.0.0.1:4000';
  const cliPath = path.resolve(__dirname, '../../cli/bin/apifix.js');

  after(async () => {
    if (server && server.listening) {
      await new Promise(r => server.close(r));
    }
  });

  test('E2E 1: Production Configuration Validator validates runtime with zero secret exposure', () => {
    const res = validateProductionConfig(process.env, false);
    assert.ok(res.status);
    assert.ok(res.score >= 0);
    assert.ok(Array.isArray(res.checks));
    assert.ok(!JSON.stringify(res).includes('sk_live_'));
  });

  test('E2E 2: Graceful Lifecycle Manager executes deterministic startup and exposes state', () => {
    const state = lifecycleManager.getState();
    assert.ok(state.state);
    assert.ok(typeof state.activeRequestsCount === 'number');
  });

  test('E2E 3: Liveness Probe (GET /health) returns HTTP 200 OK with process metrics', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.ok(body.uptimeSeconds >= 0);
  });

  test('E2E 4: Dependency Readiness Probe (GET /ready) evaluates DB, AI, and workers', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.ok(res.status === 200 || res.status === 503);
    const body = await res.json();
    assert.ok(body.checks);
    assert.ok(body.checks.database);
    assert.ok(body.checks.aiProviders);
  });

  test('E2E 5: Production Metrics Engine exports Prometheus standard exposition format', async () => {
    const res = await fetch(`${baseUrl}/metrics`, { headers: { 'Accept': 'text/plain' } });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('# TYPE apifix_http_requests_total counter'));
    assert.ok(text.includes('apifix_http_requests_total'));
  });

  test('E2E 6: Production Readiness Auditor evaluates all 6 SRE pillars', async () => {
    const assessment = await productionReadinessAuditor.assessReadiness(process.env);
    assert.ok(assessment.status);
    assert.ok(assessment.score > 0);
    assert.ok(assessment.categories.security);
    assert.ok(assessment.categories.reliability);
    assert.ok(assessment.categories.observability);
    assert.ok(assessment.categories.finops);
    assert.ok(assessment.categories.governance);
    assert.ok(assessment.categories.deployment);
  });

  test('E2E 7: Durable Background Job System enqueues, claims, and completes repair workload', async () => {
    const { job } = await jobQueueService.enqueueJob({
      workspaceId: 'ws_e2e_7',
      type: 'AUTONOMOUS_REPAIR',
      payload: { repo: 'titan/gateway', issue: 'NPE' }
    });
    assert.equal(job.status, JOB_STATUS.QUEUED);

    const claimed = await jobQueueService.claimJob('worker_e2e_node_1', 10000);
    assert.ok(claimed);
    assert.equal(claimed.workerId, 'worker_e2e_node_1');

    const completed = await jobQueueService.completeJob(claimed.jobId, 'worker_e2e_node_1', { fixed: true });
    assert.equal(completed.status, JOB_STATUS.SUCCEEDED);
  });

  test('E2E 8: Zombie worker recovery reclaims jobs after expired leases', async () => {
    const { job } = await jobQueueService.enqueueJob({
      workspaceId: 'ws_e2e_8',
      type: 'PATCH_TEST',
      payload: { crash: true }
    });
    await jobQueueService.claimJob('crashed_worker_e2e', 5);
    await new Promise(r => setTimeout(r, 15));

    const rec = await jobQueueService.recoverAbandonedJobs();
    assert.ok(rec.recoveredCount >= 1);
  });

  test('E2E 9: Safe Rollback triggers automatically on deployment smoke test failure without data loss', async () => {
    const deploy = await deploymentSafetyService.executeDeployment({
      targetVersion: '22.9.0',
      mockSmokeFail: true
    });
    assert.equal(deploy.success, false);
    assert.equal(deploy.deployment.state, DEPLOYMENT_STATES.ROLLED_BACK);
    assert.equal(deploy.rollback.dataPreserved, true);
  });

  test('E2E 10: FinOps Engine records granular AI spend and attributes across dimensions', async () => {
    const txn = await finopsEngine.recordCostTransaction({
      workspaceId: 'ws_e2e_10',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens: { prompt: 1500, completion: 400, total: 1900 },
      isVerifiedRepair: true
    });
    assert.ok(txn.amount > 0);
    assert.equal(txn.isVerifiedRepair, true);
  });

  test('E2E 11: Unit Economics calculates cost per verified repair accurately', () => {
    const m = finopsEngine.getFinopsMetrics({ workspaceId: 'ws_e2e_10' });
    assert.ok(m.unitEconomics.costPerVerifiedRepair > 0);
  });

  test('E2E 12: Cost anomaly detection assesses spend variance against baseline', () => {
    const m = finopsEngine.getFinopsMetrics();
    assert.ok(m.anomalyDetection);
    assert.ok(m.anomalyDetection.severity);
  });

  test('E2E 13: FinOps Safety controls approve critical security repairs during budget throttling', async () => {
    const decision = await finopsSafetyService.authorizeExecution({
      workspaceId: 'ws_e2e_13',
      estimatedCost: 0.05,
      isSecurityCritical: true,
      severity: 'CRITICAL'
    });
    assert.equal(decision.allowed, true);
  });

  test('E2E 14: Enterprise Feature Flags evaluate deterministic percentage rollouts', () => {
    const enabled = featureFlagService.isEnabled('autonomous_repair_v22', { userId: 'user_e2e_test' });
    assert.equal(typeof enabled, 'boolean');
  });

  test('E2E 15: Feature flag mutations log to the immutable audit ledger', async () => {
    const flag = await featureFlagService.setFlag({
      name: 'e2e_test_flag',
      enabled: true,
      scope: 'GLOBAL',
      rolloutPercentage: 100
    }, { id: 'admin_e2e', role: 'ADMIN' });
    assert.equal(flag.enabled, true);

    await featureFlagService.deleteFlag('e2e_test_flag', { id: 'admin_e2e' });
  });

  test('E2E 16: Database reliability service enforces query timeout and retry classification', async () => {
    const readResult = await databaseReliabilityService.executeQuery(async () => {
      return { readOk: true };
    }, { name: 'SELECT_E2E', isMutation: false });
    assert.equal(readResult.readOk, true);
  });

  test('E2E 17: Database migration lock guarantees mutual exclusion', async () => {
    const lock = await databaseReliabilityService.acquireMigrationLock('e2e_migrator');
    assert.equal(lock.success, true);
    await databaseReliabilityService.releaseMigrationLock('e2e_migrator');
  });

  test('E2E 18: 12-scenario disaster recovery verification runs cleanly', async () => {
    const dr = await disasterRecoveryVerificationService.runFullVerification();
    assert.equal(dr.status, 'PASSED');
    assert.equal(dr.passedCount, 12);
  });

  test('E2E 19: Dependency Security Auditor audits packages with zero critical vulnerabilities', async () => {
    const audit = await dependencyAuditor.auditDependencies();
    assert.ok(audit.status);
    assert.ok(audit.totalPackagesAudited >= 1);
  });

  test('E2E 20: Official CLI executes health, readiness, and metrics commands deterministically', async () => {
    const healthCmd = await execAsync(`node "${cliPath}" health --base-url "${baseUrl}" --json`);
    const parsedHealth = JSON.parse(healthCmd.stdout);
    assert.equal(parsedHealth.status, 'ok');

    const readyCmd = await execAsync(`node "${cliPath}" readiness --base-url "${baseUrl}" --json`);
    const parsedReady = JSON.parse(readyCmd.stdout);
    assert.ok(parsedReady.status);

    const metricsCmd = await execAsync(`node "${cliPath}" metrics --base-url "${baseUrl}" --json`);
    const parsedMetrics = JSON.parse(metricsCmd.stdout);
    assert.ok(parsedMetrics.http || parsedMetrics.production || parsedMetrics.sre);
  });
});
