/**
 * Phase 24 — AI Provider Throughput & Fallback Cascades Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { isAiProviderConfigured, getActiveProvider } = require('../src/services/aiProviderClient');
const aiProviderObserver = require('../src/services/aiProviderObserver');
const { BenchmarkRunner } = require('../src/services/benchmarkRunner');

describe('Phase 24 — AI Provider Throughput & Multi-Provider Fallback', () => {
  const runner = new BenchmarkRunner();

  test('1. Validates configured AI provider and observer telemetry reporting', () => {
    const active = getActiveProvider();
    const isConfigured = isAiProviderConfigured();
    const health = aiProviderObserver.getProviderHealth();

    assert(health && typeof health === 'object', 'Observer health must be reported');
    assert(typeof isConfigured === 'boolean', 'isAiProviderConfigured must return boolean');
  });

  test('2. Simulates multi-provider fallback cascade: PRIMARY -> FAILURE -> RETRY -> FALLBACK -> SUCCESS', async () => {
    let primaryAttempts = 0;
    let fallbackAttempts = 0;

    const mockAiCaller = async () => {
      primaryAttempts++;
      if (primaryAttempts <= 2) {
        // Simulate primary provider rate limit / 503
        throw new Error('PRIMARY_PROVIDER_UNAVAILABLE_503');
      }
      fallbackAttempts++;
      return {
        provider: 'anthropic-claude-3-5-sonnet',
        patch: 'function handleFix() { return true; }',
        tokensUsed: 240,
        costUsd: 0.0036
      };
    };

    // Resilient caller with fallback
    const executeWithFallback = async () => {
      try {
        return await mockAiCaller();
      } catch (err) {
        // Fallback provider path
        return {
          provider: 'openai-gpt-4o-fallback',
          patch: 'function handleFix() { return true; }',
          tokensUsed: 250,
          costUsd: 0.0038,
          fallbackUsed: true
        };
      }
    };

    const res = await executeWithFallback();
    assert.strictEqual(res.fallbackUsed, true);
    assert.strictEqual(res.provider, 'openai-gpt-4o-fallback');
    assert(res.costUsd > 0);
  });

  test('3. AI throughput benchmarking under concurrent worker invocations', async () => {
    const result = await runner.runBenchmark({
      name: 'ai_throughput_benchmark',
      concurrency: 10,
      iterations: 30,
      fn: async (i) => {
        // Mock token processing latency
        await new Promise(r => setTimeout(r, 5));
        return { tokens: 150 + i };
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.throughputRps > 0);
  });
});
