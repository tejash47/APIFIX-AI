/**
 * Phase 24 — API Load Testing Suite
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { app } = require('../src/server');
const { BenchmarkRunner } = require('../src/services/benchmarkRunner');

describe('Phase 24 — Progressive API Load Testing (10 to 100 Concurrency)', () => {
  let server;
  let baseUrl;
  const runner = new BenchmarkRunner();

  let origRateLimitDisabled;

  before(async () => {
    origRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = 'true';
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    process.env.RATE_LIMIT_DISABLED = origRateLimitDisabled;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Load Test: /health liveness probe under 10 concurrent clients', async () => {
    const result = await runner.runBenchmark({
      name: 'api_load_health_c10',
      concurrency: 10,
      iterations: 30,
      fn: async (i, workerId) => {
        const res = await fetch(`${baseUrl}/health`, {
          headers: { 'x-forwarded-for': `10.0.0.${workerId + 1}` }
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.status, 'ok');
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.latency.p95Ms < 200, `p95 latency (${result.latency.p95Ms}ms) should be < 200ms`);
  });

  test('2. Load Test: /ready dependency readiness probe under 25 concurrent clients', async () => {
    const result = await runner.runBenchmark({
      name: 'api_load_ready_c25',
      concurrency: 25,
      iterations: 30,
      fn: async (i, workerId) => {
        const res = await fetch(`${baseUrl}/ready`, {
          headers: { 'x-forwarded-for': `10.0.1.${workerId + 1}` }
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert(data.status.includes('ready'));
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.latency.p95Ms < 200, `p95 latency (${result.latency.p95Ms}ms) should be < 200ms`);
  });

  test('3. Load Test: /metrics Prometheus exporter under 25 concurrent clients', async () => {
    const result = await runner.runBenchmark({
      name: 'api_load_metrics_c25',
      concurrency: 25,
      iterations: 30,
      fn: async (i, workerId) => {
        const res = await fetch(`${baseUrl}/metrics`, {
          headers: { 'x-forwarded-for': `10.0.2.${workerId + 1}` }
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert(data.uptimeSeconds !== undefined || data.totalRequests !== undefined);
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.latency.p95Ms < 200, `p95 latency (${result.latency.p95Ms}ms) should be < 200ms`);
  });

  test('4. Load Test: /api/performance/profile under 25 concurrent clients', async () => {
    const result = await runner.runBenchmark({
      name: 'api_load_profile_c25',
      concurrency: 25,
      iterations: 30,
      fn: async (i, workerId) => {
        const res = await fetch(`${baseUrl}/api/performance/profile`, {
          headers: { 'x-forwarded-for': `10.0.3.${workerId + 1}` }
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.classification, 'MEASURED');
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.latency.p95Ms < 200, `p95 latency (${result.latency.p95Ms}ms) should be < 200ms`);
  });
});
