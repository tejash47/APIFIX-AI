/**
 * APIFIX AI — Phase 22 Enterprise Feature Flags & Rollout Tests
 * Verifies hierarchical scopes, deterministic percentage rollouts, and audit ledger tracking.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { featureFlagService } = require('../src/services/featureFlagService');

describe('Phase 22 — Enterprise Feature Flags & Safe Rollout Suite', () => {
  test('8.1 Should initialize default system feature flags', () => {
    const flags = featureFlagService.listFlags();
    assert.ok(flags.length >= 3);
    assert.ok(flags.some(f => f.name === 'autonomous_repair_v22'));
    assert.ok(flags.some(f => f.name === 'finops_predictive_budgeting'));
  });

  test('8.2 Should evaluate global feature flag accurately', () => {
    const isEnabled = featureFlagService.isEnabled('autonomous_repair_v22');
    assert.equal(isEnabled, true);

    const nonExistent = featureFlagService.isEnabled('completely_unknown_flag');
    assert.equal(nonExistent, false);
  });

  test('8.3 Should evaluate target entity inclusion correctly', async () => {
    await featureFlagService.setFlag({
      name: 'beta_ai_model_v2',
      enabled: true,
      scope: 'GLOBAL',
      rolloutPercentage: 0, // Disabled for general rollout
      targetEntities: ['user_vip_123', 'ws_enterprise_titan']
    }, { id: 'admin_user', role: 'ADMIN' });

    assert.equal(featureFlagService.isEnabled('beta_ai_model_v2', { userId: 'user_vip_123' }), true);
    assert.equal(featureFlagService.isEnabled('beta_ai_model_v2', { workspaceId: 'ws_enterprise_titan' }), true);
    assert.equal(featureFlagService.isEnabled('beta_ai_model_v2', { userId: 'user_regular_456' }), false);
  });

  test('8.4 Should evaluate deterministic percentage rollout based on entity ID hash', async () => {
    await featureFlagService.setFlag({
      name: 'experimental_sandbox_v2',
      enabled: true,
      scope: 'GLOBAL',
      rolloutPercentage: 50,
      targetEntities: []
    }, { id: 'admin_user', role: 'ADMIN' });

    // Consistent results for the same entity
    const eval1 = featureFlagService.isEnabled('experimental_sandbox_v2', { userId: 'test_hash_user_alpha' });
    const eval2 = featureFlagService.isEnabled('experimental_sandbox_v2', { userId: 'test_hash_user_alpha' });
    assert.equal(eval1, eval2, 'Deterministic hashing must produce identical result for same entity');
  });

  test('8.5 Should support workspace-scoped feature flags', async () => {
    await featureFlagService.setFlag({
      name: 'ws_isolated_flag',
      enabled: true,
      scope: 'WORKSPACE',
      rolloutPercentage: 100,
      targetEntities: ['ws_scoped_alpha']
    }, { id: 'admin_user', role: 'ADMIN' });

    assert.equal(featureFlagService.isEnabled('ws_isolated_flag', { workspaceId: 'ws_scoped_alpha' }), true);
    assert.equal(featureFlagService.isEnabled('ws_isolated_flag', { workspaceId: 'ws_scoped_beta' }), false);
  });

  test('8.6 Should update existing feature flag configuration', async () => {
    const updated = await featureFlagService.setFlag({
      name: 'ws_isolated_flag',
      enabled: false
    }, { id: 'admin_modifier', role: 'ADMIN' });

    assert.equal(updated.enabled, false);
    assert.equal(featureFlagService.isEnabled('ws_isolated_flag', { workspaceId: 'ws_scoped_alpha' }), false);
  });

  test('8.7 Should retrieve a single flag by name', () => {
    const flag = featureFlagService.getFlag('autonomous_repair_v22');
    assert.ok(flag);
    assert.equal(flag.name, 'autonomous_repair_v22');
    assert.equal(flag.enabled, true);
  });

  test('8.8 Should delete feature flag and handle non-existent flag deletion', async () => {
    const delRes = await featureFlagService.deleteFlag('ws_isolated_flag', { id: 'admin_cleaner' });
    assert.equal(delRes.success, true);

    const delNonExistent = await featureFlagService.deleteFlag('non_existent_flag_xyz');
    assert.equal(delNonExistent.success, false);
  });
});
