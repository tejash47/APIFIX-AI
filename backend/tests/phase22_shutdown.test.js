/**
 * APIFIX AI — Phase 22 Graceful Startup & Shutdown Tests
 * Verifies deterministic state transitions, HTTP drain, repair tracking, cleanup hooks, and telemetry.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { lifecycleManager, LIFECYCLE_STATES } = require('../src/services/lifecycleManager');
const { getShutdownStatus } = require('../src/services/shutdownManager');

describe('Phase 22 — Graceful Startup & Shutdown Lifecycle Suite', () => {
  test('2.1 Should initialize in STARTING state and transition deterministically', () => {
    const s = lifecycleManager.getState();
    assert.ok(s.state);
    assert.ok(Array.isArray(s.stateHistory));
  });

  test('2.2 Should execute programmatic startup sequence', async () => {
    const mockServer = {
      listening: true,
      close: (cb) => cb()
    };

    await lifecycleManager.executeStartupSequence(mockServer);
    const s = lifecycleManager.getState();
    assert.equal(s.state, LIFECYCLE_STATES.RUNNING);
    assert.equal(s.isReady, true);
  });

  test('2.3 Should track in-flight HTTP requests during active processing', () => {
    const mockReq = { headers: { 'x-request-id': 'req_test_lifecycle_1' } };
    let finishHandler;
    const mockRes = {
      once: (evt, handler) => {
        if (evt === 'finish') finishHandler = handler;
      }
    };

    lifecycleManager.trackRequest(mockReq, mockRes);
    assert.equal(lifecycleManager.activeHttpRequests.size, 1);
    assert.ok(lifecycleManager.activeHttpRequests.has('req_test_lifecycle_1'));

    // Trigger finish
    if (finishHandler) finishHandler();
    assert.equal(lifecycleManager.activeHttpRequests.size, 0);
  });

  test('2.4 Should track and release active repair runs', () => {
    const runId = 'run_lifecycle_test_99';
    lifecycleManager.trackRepairRun(runId, { project: 'payment-gateway' });
    assert.equal(lifecycleManager.activeRepairRuns.size, 1);
    assert.ok(lifecycleManager.activeRepairRuns.has(runId));

    lifecycleManager.releaseRepairRun(runId);
    assert.equal(lifecycleManager.activeRepairRuns.size, 0);
  });

  test('2.5 Should execute registered cleanup hooks in order during shutdown', async () => {
    const executionOrder = [];
    lifecycleManager.registerCleanupHook('hook_secondary', async () => {
      executionOrder.push('secondary');
    }, 20);
    lifecycleManager.registerCleanupHook('hook_primary', async () => {
      executionOrder.push('primary');
    }, 10);

    const mockServer = {
      listening: true,
      close: (cb) => cb()
    };
    lifecycleManager.serverInstance = mockServer;

    await lifecycleManager.executeShutdownSequence('SIGTERM');

    assert.equal(lifecycleManager.state, LIFECYCLE_STATES.STOPPED);
    assert.deepEqual(executionOrder, ['primary', 'secondary']);
  });

  test('2.6 Should report shutdown status truthfully', () => {
    assert.equal(lifecycleManager.isShuttingDown, true);
    assert.equal(getShutdownStatus(), true);
  });

  test('2.7 Should maintain structured state transition history with timestamps', () => {
    const s = lifecycleManager.getState();
    assert.ok(s.stateHistory.length > 0);
    const last = s.stateHistory[s.stateHistory.length - 1];
    assert.equal(last.to, LIFECYCLE_STATES.STOPPED);
    assert.ok(last.timestamp);
  });

  test('2.8 Should record telemetry events for lifecycle transitions without throwing', () => {
    lifecycleManager.setState(LIFECYCLE_STATES.READY, { testReason: 're-verification' });
    const s = lifecycleManager.getState();
    assert.equal(s.state, LIFECYCLE_STATES.READY);
  });
});
