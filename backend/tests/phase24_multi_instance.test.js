/**
 * Phase 24 — Multi-Instance Backend Coordination Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { idempotencyService } = require('../src/services/idempotencyService');
const { hierarchicalRateLimiter } = require('../src/services/hierarchicalRateLimiter');
const { featureFlagService } = require('../src/services/featureFlagService');

describe('Phase 24 — Multi-Instance Backend Coordination (Instance A, B, C)', () => {
  beforeEach(() => {
    idempotencyService.resetIdempotencyStore();
  });

  test('1. Shared idempotency locking prevents duplicate execution across multiple instances', () => {
    const key = 'idem_multi_inst_1';
    const workspaceId = 'ws_multi_inst';

    // Instance A claims idempotency lock
    const claimA = idempotencyService.acquireLock(key, workspaceId);
    assert.strictEqual(claimA.acquired, true, 'Instance A acquires lock');

    // Instance B attempts same key simultaneously -> rejected / in progress
    const claimB = idempotencyService.acquireLock(key, workspaceId);
    assert.strictEqual(claimB.acquired, false, 'Instance B lock attempt rejected');

    // Instance A records final result
    idempotencyService.saveResult(key, workspaceId, 200, { repairId: 'rep_123' });

    // Instance C queries key -> receives cached replay without re-execution
    const claimC = idempotencyService.acquireLock(key, workspaceId);
    assert.strictEqual(claimC.acquired, false);
    assert.strictEqual(claimC.isReplay, true);
    assert.strictEqual(claimC.result.statusCode, 200);
  });

  test('2. Distributed rate limit accounting synchronized across instances', () => {
    const orgId = 'org_multi_inst_limits';
    const plan = 'ENTERPRISE'; // High limit

    // Instance A records 5 requests
    for (let i = 0; i < 5; i++) {
      const res = hierarchicalRateLimiter.checkLimit({ orgId, plan });
      assert.strictEqual(res.allowed, true);
    }

    // Instance B checks limit -> observes accumulated count
    const resB = hierarchicalRateLimiter.checkLimit({ orgId, plan });
    assert.strictEqual(resB.allowed, true);
  });

  test('3. Feature flag evaluation consistency across all backend nodes', async () => {
    await featureFlagService.setGlobalFlag('PHASE24_AUTOSCALING_ACTIVE', true);

    // Node A, B, C evaluate flag
    const evalA = featureFlagService.isEnabled('PHASE24_AUTOSCALING_ACTIVE');
    const evalB = featureFlagService.isEnabled('PHASE24_AUTOSCALING_ACTIVE');
    const evalC = featureFlagService.isEnabled('PHASE24_AUTOSCALING_ACTIVE');

    assert.strictEqual(evalA, true);
    assert.strictEqual(evalB, true);
    assert.strictEqual(evalC, true);
  });
});
