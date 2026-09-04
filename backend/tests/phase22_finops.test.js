/**
 * APIFIX AI — Phase 22 Advanced FinOps Engine & Predictive Budgeting Tests
 * Verifies multi-dimensional cost attribution, unit economics, provider comparison,
 * anomaly detection, and the security-critical enclave bypass.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { finopsEngine } = require('../src/services/finopsEngine');
const { finopsSafetyService, BUDGET_STATES } = require('../src/services/finopsSafetyService');

describe('Phase 22 — Advanced FinOps Engine & Safety Controls Suite', () => {
  test('5.1 Should record granular AI cost transaction with model token pricing', async () => {
    const entry = await finopsEngine.recordCostTransaction({
      workspaceId: 'ws_finops_1',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens: { prompt: 2000, completion: 500, total: 2500 },
      durationMs: 400,
      isVerifiedRepair: true
    });

    assert.ok(entry.id);
    assert.equal(entry.provider, 'groq');
    assert.ok(entry.amount > 0);
    assert.equal(entry.isVerifiedRepair, true);
  });

  test('5.2 Should record sandbox execution and synthetic probe costs accurately', async () => {
    const sBox = await finopsEngine.recordCostTransaction({ workspaceId: 'ws_finops_1', category: 'SANDBOX' });
    const probe = await finopsEngine.recordCostTransaction({ workspaceId: 'ws_finops_1', category: 'SYNTHETIC_PROBE' });

    assert.equal(sBox.amount, 0.05);
    assert.equal(probe.amount, 0.001);
  });

  test('5.3 Should compute daily, weekly, and monthly spend rollups', () => {
    const m = finopsEngine.getFinopsMetrics({ workspaceId: 'ws_finops_1' });
    assert.ok(typeof m.dailySpend === 'number');
    assert.ok(typeof m.weeklySpend === 'number');
    assert.ok(typeof m.monthlySpend === 'number');
    assert.ok(m.dailySpend > 0);
  });

  test('5.4 Should compute unit economics: Cost Per Verified Repair', () => {
    const m = finopsEngine.getFinopsMetrics({ workspaceId: 'ws_finops_1' });
    assert.ok(m.unitEconomics);
    assert.ok(typeof m.unitEconomics.costPerVerifiedRepair === 'number');
    assert.ok(m.unitEconomics.verifiedRepairs >= 1);
  });

  test('5.5 Should benchmark AI provider efficiencies across Groq, Anthropic, and OpenAI', () => {
    const m = finopsEngine.getFinopsMetrics();
    assert.ok(Array.isArray(m.providerComparison));
    assert.ok(m.providerComparison.some(p => p.provider === 'groq'));
  });

  test('5.6 Should compute burn rate per hour and projected monthly spend', () => {
    const m = finopsEngine.getFinopsMetrics();
    assert.ok(m.burnRate);
    assert.ok(typeof m.burnRate.perHour === 'number');
    assert.ok(typeof m.projectedMonthlySpend === 'number');
  });

  test('5.7 Should detect cost anomalies when spend exceeds statistical baseline', () => {
    const m = finopsEngine.getFinopsMetrics();
    assert.ok(m.anomalyDetection);
    assert.ok(m.anomalyDetection.severity);
  });

  test('5.8 Should evaluate budget state accurately (NORMAL / WARNING / THROTTLED)', () => {
    const evalState = finopsSafetyService.evaluateBudgetState({ orgId: 'org_test_eval' });
    assert.ok(evalState.state);
    assert.ok([BUDGET_STATES.NORMAL, BUDGET_STATES.WARNING, BUDGET_STATES.CRITICAL, BUDGET_STATES.THROTTLED, BUDGET_STATES.EMERGENCY].includes(evalState.state));
  });

  test('5.9 Should authorize normal execution under budget thresholds', async () => {
    const decision = await finopsSafetyService.authorizeExecution({
      workspaceId: 'ws_auth_normal',
      estimatedCost: 0.05,
      isSecurityCritical: false,
      provider: 'groq'
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.securityBypassActive, false);
  });

  test('5.10 Should reject unconfigured or unavailable AI providers in preflight', async () => {
    const decision = await finopsSafetyService.authorizeExecution({
      workspaceId: 'ws_auth_bad_prov',
      provider: 'unknown_nonexistent_provider'
    });

    assert.equal(decision.allowed, false);
    assert.ok(decision.reason.includes('unavailable'));
  });

  test('5.11 Should allow Security-Critical Enclave override during budget throttling', async () => {
    // Override dailyBudgetLimit temporarily to simulate throttling
    const prevDaily = finopsSafetyService.dailyBudgetLimit;
    finopsSafetyService.dailyBudgetLimit = 0.0001; // Force daily budget exceeded

    // Non-critical operation should be denied
    const nonCritDecision = await finopsSafetyService.authorizeExecution({
      workspaceId: 'ws_throttled',
      estimatedCost: 0.05,
      isSecurityCritical: false,
      severity: 'LOW'
    });
    assert.equal(nonCritDecision.allowed, false);

    // Security-critical operation MUST be approved
    const critDecision = await finopsSafetyService.authorizeExecution({
      workspaceId: 'ws_throttled',
      estimatedCost: 0.05,
      isSecurityCritical: true,
      severity: 'CRITICAL'
    });
    assert.equal(critDecision.allowed, true);
    assert.equal(critDecision.securityBypassActive, true);
    assert.ok(critDecision.reason.includes('Security-Critical Enclave'));

    // Restore limit
    finopsSafetyService.dailyBudgetLimit = prevDaily;
  });

  test('5.12 Should attribute spend across multiple workspaces and projects', async () => {
    await finopsEngine.recordCostTransaction({ workspaceId: 'ws_alpha', projectId: 'proj_gateway', amount: 0.12 });
    await finopsEngine.recordCostTransaction({ workspaceId: 'ws_beta', projectId: 'proj_auth', amount: 0.24 });

    const m = finopsEngine.getFinopsMetrics();
    assert.ok(m.spendByWorkspace['ws_alpha'] >= 0.12);
    assert.ok(m.spendByWorkspace['ws_beta'] >= 0.24);
    assert.ok(m.spendByProject['proj_gateway'] >= 0.12);
  });
});
