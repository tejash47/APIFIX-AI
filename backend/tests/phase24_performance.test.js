/**
 * Phase 24 — Performance Benchmark Framework Test Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { BenchmarkRunner } = require('../src/services/benchmarkRunner');

describe('Phase 24 — Benchmark Framework & Percentile Calculations', () => {
  test('1. Executes benchmark with warmup iterations and calculates exact percentiles', async () => {
    const runner = new BenchmarkRunner();

    const result = await runner.runBenchmark({
      name: 'unit_latency_benchmark',
      concurrency: 5,
      iterations: 30,
      warmupIterations: 3,
      fn: async (i) => {
        // Deterministic micro-task
        await new Promise(r => setTimeout(r, (i % 5) + 1));
      }
    });

    assert.strictEqual(result.testName, 'unit_latency_benchmark');
    assert.strictEqual(result.classification, 'MEASURED');
    assert.strictEqual(result.totalRequests, 30);
    assert.strictEqual(result.successCount, 30);
    assert.strictEqual(result.errorCount, 0);
    assert.strictEqual(result.successRate, 100);
    assert(result.latency.p50Ms > 0, 'p50 must be positive');
    assert(result.latency.p95Ms >= result.latency.p50Ms, 'p95 must be >= p50');
    assert(result.latency.p99Ms >= result.latency.p95Ms, 'p99 must be >= p95');
    assert(result.throughputRps > 0, 'throughput must be positive');
  });

  test('2. Accurately tracks errors and captures error samples without crashing', async () => {
    const runner = new BenchmarkRunner();

    const result = await runner.runBenchmark({
      name: 'error_tracking_benchmark',
      concurrency: 2,
      iterations: 10,
      warmupIterations: 0,
      fn: async (i) => {
        if (i % 2 === 0) {
          throw new Error(`Injected failure on iteration ${i}`);
        }
      }
    });

    assert.strictEqual(result.totalRequests, 10);
    assert.strictEqual(result.successCount, 5);
    assert.strictEqual(result.errorCount, 5);
    assert.strictEqual(result.successRate, 50);
    assert.strictEqual(result.errorRate, 50);
    assert(Array.isArray(result.errors), 'Errors must be an array');
    assert(result.errors.length > 0, 'Errors should contain sample messages');
  });

  test('3. Formats human-readable ASCII summary with CPU and memory metrics', async () => {
    const runner = new BenchmarkRunner();

    const result = await runner.runBenchmark({
      name: 'summary_formatting_test',
      concurrency: 2,
      iterations: 5,
      fn: async () => {}
    });

    const summary = runner.formatSummary(result);
    assert(summary.includes('BENCHMARK: summary_formatting_test'), 'Summary must contain test name');
    assert(summary.includes('[MEASURED]'), 'Summary must contain classification tag');
    assert(summary.includes('Latency (p95):'), 'Summary must contain p95 latency');
    assert(summary.includes('Throughput:'), 'Summary must contain throughput');
  });
});
