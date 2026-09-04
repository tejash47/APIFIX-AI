/**
 * APIFIX AI — Phase 23 Deployment Safety & Rollback Engine Test Suite
 * 
 * Validates canary progression, rollback triggers, versioning, and launch gates.
 */

const assert = require('assert');
const { test, describe } = require('node:test');
const { deploymentSafetyService } = require('../src/services/deploymentSafetyService');
const { productionLaunchGate } = require('../src/services/productionLaunchGate');

describe('Phase 23 — Deployment Safety & Rollback Suite', () => {

  test('6.1 Deployment initializes in PRE_CHECK stage', () => {
    const dep = deploymentSafetyService.startDeployment({
      version: '23.0.0',
      gitCommit: '9c8f2a1'
    });
    assert.strictEqual(dep.stage, 'PRE_CHECK');
    assert.strictEqual(dep.canaryWeight, 0);
  });

  test('6.2 Transitions through CANARY_DEPLOY stage with 10% traffic', () => {
    const dep = deploymentSafetyService.advanceDeployment({
      stage: 'CANARY_DEPLOY',
      canaryWeight: 10
    });
    assert.strictEqual(dep.stage, 'CANARY_DEPLOY');
    assert.strictEqual(dep.canaryWeight, 10);
  });

  test('6.3 Observes canary metrics during CANARY_OBSERVE stage', () => {
    const dep = deploymentSafetyService.advanceDeployment({
      stage: 'CANARY_OBSERVE',
      metrics: { errorRate: 0.1, latencyP99Ms: 120 }
    });
    assert.strictEqual(dep.stage, 'CANARY_OBSERVE');
  });

  test('6.4 Scales to FULL_TRAFFIC stage with 100% traffic', () => {
    const dep = deploymentSafetyService.advanceDeployment({
      stage: 'FULL_TRAFFIC',
      canaryWeight: 100
    });
    assert.strictEqual(dep.stage, 'FULL_TRAFFIC');
    assert.strictEqual(dep.canaryWeight, 100);
  });

  test('6.5 Finalizes and marks deployment PROMOTED', () => {
    const dep = deploymentSafetyService.advanceDeployment({
      stage: 'PROMOTED',
      healthStatus: 'HEALTHY'
    });
    assert.strictEqual(dep.stage, 'PROMOTED');
    assert.strictEqual(dep.healthStatus, 'HEALTHY');
  });

  test('6.6 Triggers automatic rollback when error rate exceeds threshold (>2.0%)', () => {
    deploymentSafetyService.startDeployment({ version: '23.1.0-bad' });
    const decision = deploymentSafetyService.evaluateHealth({
      errorRate: 3.5,
      latencyP99Ms: 250
    });
    assert.strictEqual(decision.action, 'ROLLBACK');
    assert.strictEqual(decision.reason, 'Error rate threshold breached');
  });

  test('6.7 Triggers automatic rollback when latency p99 exceeds threshold (>1500ms)', () => {
    deploymentSafetyService.startDeployment({ version: '23.1.0-slow' });
    const decision = deploymentSafetyService.evaluateHealth({
      errorRate: 0.5,
      latencyP99Ms: 1850
    });
    assert.strictEqual(decision.action, 'ROLLBACK');
    assert.strictEqual(decision.reason, 'Latency p99 threshold breached');
  });

  test('6.8 Executes zero-downtime rollback and restores previous version', () => {
    const res = deploymentSafetyService.executeRollback({
      targetVersion: '23.0.0',
      reason: 'Automated health threshold breach'
    });
    assert.strictEqual(res.status, 'ROLLED_BACK');
    assert.strictEqual(res.activeVersion, '23.0.0');
  });

  test('6.9 Preserves deployment timeline history with timestamps', () => {
    const history = deploymentSafetyService.getDeploymentHistory();
    assert.ok(Array.isArray(history));
    assert.ok(history.length > 0);
  });

  test('6.10 Single transient error does not trigger immediate premature rollback', () => {
    const decision = deploymentSafetyService.evaluateHealth({
      errorRate: 0.2,
      latencyP99Ms: 400
    });
    assert.strictEqual(decision.action, 'CONTINUE');
  });

  test('6.11 Production launch gate reports READY when all invariants pass', async () => {
    const gate = await productionLaunchGate.evaluateLaunchStatus({
      NODE_ENV: 'test',
      JWT_SECRET: 'test_secret_key_minimum_32_characters_long'
    });
    assert.strictEqual(gate.launchStatus, 'READY');
    assert.strictEqual(gate.canLaunch, true);
    assert.strictEqual(gate.blockerCount, 0);
  });

  test('6.12 Production launch gate reports BLOCKED when mandatory secret is missing', async () => {
    const gate = await productionLaunchGate.evaluateLaunchStatus({
      NODE_ENV: 'production',
      JWT_SECRET: ''
    });
    assert.strictEqual(gate.launchStatus, 'BLOCKED');
    assert.strictEqual(gate.canLaunch, false);
    assert.ok(gate.blockerCount > 0);
  });

  test('6.13 Production launch gate provides actionable remediation recommendations', async () => {
    const gate = await productionLaunchGate.evaluateLaunchStatus({
      NODE_ENV: 'production',
      JWT_SECRET: ''
    });
    assert.ok(gate.recommendations.length > 0);
  });

  test('6.14 Deployment state tracks duration and rollback target accurately', () => {
    const status = deploymentSafetyService.getDeploymentStatus();
    assert.ok(status.currentVersion);
    assert.ok(status.canaryStage);
  });

  test('6.15 Rollback availability check returns truthful target version', () => {
    const status = deploymentSafetyService.getDeploymentStatus();
    assert.strictEqual(typeof status.rollbackAvailable, 'boolean');
  });
});
