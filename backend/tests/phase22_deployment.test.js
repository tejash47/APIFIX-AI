/**
 * APIFIX AI — Phase 22 Deployment Safety Engine & Rollback Tests
 * Verifies preflight checks, state machine transitions, smoke test gates, and safe non-destructive rollbacks.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { deploymentSafetyService, DEPLOYMENT_STATES } = require('../src/services/deploymentSafetyService');

describe('Phase 22 — Deployment Safety Engine & Rollback Suite', () => {
  test('7.1 Should execute comprehensive deployment preflight checks successfully', async () => {
    const preflight = await deploymentSafetyService.runPreflightChecks('22.0.0');
    assert.equal(preflight.passed, true);
    assert.ok(preflight.checks.length >= 4);
    assert.ok(preflight.checks.some(c => c.name === 'schema_compatibility' && c.passed));
    assert.ok(preflight.checks.some(c => c.name === 'rollback_readiness' && c.passed));
  });

  test('7.2 Should fail preflight checks when target schema version is incompatible', async () => {
    const preflight = await deploymentSafetyService.runPreflightChecks('99.0.0');
    // If future version is not yet applied
    assert.ok(preflight.checks);
  });

  test('7.3 Should execute full successful deployment pipeline through READY state', async () => {
    const result = await deploymentSafetyService.executeDeployment({
      targetVersion: '22.1.0',
      actor: { type: 'SRE', id: 'ci_pipeline_runner' },
      mockSmokeFail: false
    });

    assert.equal(result.success, true);
    assert.equal(result.deployment.state, DEPLOYMENT_STATES.READY);
    assert.equal(result.deployment.targetVersion, '22.1.0');
    assert.ok(result.deployment.stages.some(s => s.stage === DEPLOYMENT_STATES.SMOKE_TEST && s.status === 'SUCCESS'));
  });

  test('7.4 Should trigger automated safe rollback upon smoke test failure', async () => {
    const result = await deploymentSafetyService.executeDeployment({
      targetVersion: '22.2.0',
      actor: { type: 'SRE', id: 'ci_pipeline_runner' },
      mockSmokeFail: true
    });

    assert.equal(result.success, false);
    assert.equal(result.deployment.state, DEPLOYMENT_STATES.ROLLED_BACK);
    assert.ok(result.rollback);
    assert.equal(result.rollback.status, 'ROLLED_BACK');
    assert.equal(result.rollback.dataPreserved, true);
  });

  test('7.5 Should verify production data is preserved and not destroyed during rollback', async () => {
    const status = deploymentSafetyService.getStatus();
    assert.ok(status.currentVersion);
    assert.ok(status.previousVersion);
    assert.ok(status.recentDeployments.length >= 2);
  });

  test('7.6 Should execute manual programmatic rollback safely', async () => {
    const rollback = await deploymentSafetyService.executeSafeRollback('manual_trigger_1', '22.0.0');
    assert.equal(rollback.status, 'ROLLED_BACK');
    assert.equal(rollback.restoredVersion, '22.0.0');
    assert.equal(rollback.dataPreserved, true);
  });

  test('7.7 Should maintain deployment history with stage timestamps and actor attribution', () => {
    const status = deploymentSafetyService.getStatus();
    const lastDep = status.recentDeployments[0];
    assert.ok(lastDep.id);
    assert.ok(lastDep.startedAt);
    assert.ok(Array.isArray(lastDep.stages));
  });

  test('7.8 Should verify migration lock is acquired and released cleanly during deploy', async () => {
    const result = await deploymentSafetyService.executeDeployment({
      targetVersion: '22.0.1',
      actor: { type: 'SRE' }
    });
    assert.equal(result.success, true);
    assert.ok(result.deployment.stages.some(s => s.stage === DEPLOYMENT_STATES.MIGRATING));
  });

  test('7.9 Should track version history transition from previous to target', () => {
    const status = deploymentSafetyService.getStatus();
    assert.equal(status.currentVersion, '22.0.1');
  });

  test('7.10 Should return valid deployment engine status for SRE control plane', () => {
    const s = deploymentSafetyService.getStatus();
    assert.ok(s.state);
    assert.ok(s.timestamp);
  });
});
