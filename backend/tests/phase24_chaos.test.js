/**
 * Phase 24 — 20-Scenario Controlled Chaos & Failure Injection Suite
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { ChaosInjectionService } = require('../src/services/chaosInjectionService');

describe('Phase 24 — 20 Chaos Scenarios & Failure Injection', () => {
  let chaos;

  beforeEach(() => {
    chaos = new ChaosInjectionService();
  });

  afterEach(() => {
    chaos.reset();
  });

  const scenarios = [
    'database_latency',
    'database_unavailable',
    'ai_unavailable',
    'ai_timeout',
    'ai_rate_limit',
    'worker_crash',
    'worker_restart',
    'queue_backlog',
    'webhook_surge',
    'network_timeout',
    'cache_corruption',
    'memory_pressure',
    'cpu_pressure',
    'instance_restart',
    'deployment_interruption',
    'telemetry_failure',
    'metrics_failure',
    'external_dependency_failure',
    'partial_service_degradation',
    'cascading_failure'
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const sc = scenarios[i];
    test(`Scenario ${i + 1}/20: Enables, tests injection, and cleanly recovers from '${sc}'`, async () => {
      // 1. Enable scenario
      const enableRes = chaos.enableScenario(sc, { delayMs: 5, message: `Chaos ${sc} active` });
      assert.strictEqual(enableRes.status, 'ACTIVE');
      assert.strictEqual(chaos.isScenarioActive(sc), true);

      // 2. Test latency / failure behavior
      await chaos.maybeInjectLatency(sc, 5);

      if (sc.includes('unavailable') || sc.includes('timeout') || sc.includes('crash') || sc.includes('failure')) {
        assert.throws(
          () => chaos.maybeInjectFailure(sc),
          (err) => err.isChaosInjected === true
        );
      }

      // 3. Disable scenario & verify recovery
      const disableRes = chaos.disableScenario(sc);
      assert.strictEqual(disableRes.status, 'INACTIVE');
      assert.strictEqual(chaos.isScenarioActive(sc), false);
    });
  }

  test('21. Production Safety Guard: Strictly blocks chaos failure injection in production', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_CHAOS_TESTS;

      assert.throws(
        () => {
          chaos.enableScenario('database_unavailable');
        },
        (err) => err.code === 'CHAOS_PRODUCTION_BLOCKED'
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
