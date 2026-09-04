/**
 * Phase 24 — Advanced Enterprise SLO Engine Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { AdvancedSloEngine } = require('../src/services/advancedSloEngine');

describe('Phase 24 — Advanced SLO Engine & Error Budget Burn Rate', () => {
  let engine;

  beforeEach(() => {
    engine = new AdvancedSloEngine();
  });

  test('1. Calculates 100% availability SLI and NORMAL status under healthy operations', () => {
    for (let i = 0; i < 100; i++) {
      engine.recordEvent('api_availability', true);
      engine.recordEvent('api_latency_p95', true, 12.5);
    }

    const report = engine.evaluateSloStatus();
    assert.strictEqual(report.overallStatus, 'NORMAL');
    assert.strictEqual(report.activeAlertsCount, 0);
    assert.strictEqual(report.slos.api_availability.status, 'NORMAL');
    assert.strictEqual(report.slos.api_availability.currentSli, '100%');
  });

  test('2. Accurately detects error budget burn and transitions to WARNING / CRITICAL upon failure threshold', () => {
    // 80 successes, 20 failures on 99.9% SLO
    for (let i = 0; i < 80; i++) {
      engine.recordEvent('api_availability', true);
    }
    for (let i = 0; i < 20; i++) {
      engine.recordEvent('api_availability', false);
    }

    const report = engine.evaluateSloStatus();
    assert.strictEqual(report.slos.api_availability.status, 'CRITICAL');
    assert.strictEqual(report.overallStatus, 'CRITICAL');
    assert(report.slos.api_availability.burnRate > 1.0);
    assert(report.slos.api_availability.recommendation.includes('Halt autonomous'));
  });

  test('3. Evaluates p95 latency SLO and triggers alert when latency regresses', () => {
    for (let i = 0; i < 100; i++) {
      // High latency 120ms (target is 50ms)
      engine.recordEvent('api_latency_p95', true, 120);
    }

    const report = engine.evaluateSloStatus();
    assert.strictEqual(report.slos.api_latency_p95.status, 'CRITICAL');
  });
});
