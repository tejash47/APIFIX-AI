/**
 * APIFIX AI — Phase 22 Production Metrics & Prometheus Exporter Tests
 * Verifies SRE operational telemetry, Prometheus exposition format, MTTR tracking, and zero secret leakage.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { productionMetricsService } = require('../src/services/productionMetricsService');

describe('Phase 22 — Production Metrics & Prometheus Exporter Suite', () => {
  test('6.1 Should record HTTP request latency and status code distribution', () => {
    productionMetricsService.recordHttpRequest(200, 45);
    productionMetricsService.recordHttpRequest(201, 60);
    productionMetricsService.recordHttpRequest(500, 150);

    const s = productionMetricsService.getMetricsSummary();
    assert.ok(s.http.requestsTotal >= 3);
    assert.ok(s.http.errorsTotal >= 1);
    assert.ok(s.http.statusCodes['2xx'] >= 2);
    assert.ok(s.http.statusCodes['5xx'] >= 1);
  });

  test('6.2 Should calculate HTTP latency percentiles (p50, p95, p99)', () => {
    for (let i = 1; i <= 100; i++) {
      productionMetricsService.recordHttpRequest(200, i * 2);
    }
    const s = productionMetricsService.getMetricsSummary();
    assert.ok(s.http.latency.p50Ms > 0);
    assert.ok(s.http.latency.p95Ms >= s.http.latency.p50Ms);
    assert.ok(s.http.latency.p99Ms >= s.http.latency.p95Ms);
  });

  test('6.3 Should expose repair MTTR and verification rate metrics', () => {
    const s = productionMetricsService.getMetricsSummary();
    assert.ok(s.repairs);
    assert.ok(typeof s.repairs.mttrSeconds === 'number');
    assert.ok(typeof s.repairs.verificationRate === 'number');
  });

  test('6.4 Should expose worker queue depth and status counts', () => {
    const s = productionMetricsService.getMetricsSummary();
    assert.ok(s.workers);
    assert.ok(typeof s.workers.queueDepth === 'number');
    assert.ok(typeof s.workers.activeProcessing === 'number');
  });

  test('6.5 Should expose database health and query latency', () => {
    const s = productionMetricsService.getMetricsSummary();
    assert.ok(s.database);
    assert.ok(s.database.status);
    assert.ok(s.database.latency);
  });

  test('6.6 Should expose FinOps monthly spend and cost per verified repair', () => {
    const s = productionMetricsService.getMetricsSummary();
    assert.ok(s.finops);
    assert.ok(typeof s.finops.monthlySpend === 'number');
    assert.ok(typeof s.finops.costPerVerifiedRepair === 'number');
  });

  test('6.7 Should export valid Prometheus text exposition format', () => {
    const prom = productionMetricsService.getPrometheusFormat();
    assert.ok(prom.includes('# HELP apifix_http_requests_total'));
    assert.ok(prom.includes('# TYPE apifix_http_requests_total counter'));
    assert.ok(prom.includes('apifix_http_requests_total'));
    assert.ok(prom.includes('apifix_repair_mttr_seconds'));
    assert.ok(prom.includes('apifix_worker_queue_depth'));
    assert.ok(prom.includes('apifix_finops_monthly_spend_dollars'));
  });

  test('6.8 Should ensure Prometheus format contains quantile labels', () => {
    const prom = productionMetricsService.getPrometheusFormat();
    assert.ok(prom.includes('apifix_http_duration_seconds{quantile="0.5"}'));
    assert.ok(prom.includes('apifix_http_duration_seconds{quantile="0.95"}'));
    assert.ok(prom.includes('apifix_http_duration_seconds{quantile="0.99"}'));
  });

  test('6.9 Should verify zero secrets or tokens in Prometheus metric output', () => {
    const prom = productionMetricsService.getPrometheusFormat();
    assert.ok(!prom.includes('sk_'));
    assert.ok(!prom.includes('gsk_'));
    assert.ok(!prom.includes('Bearer'));
    assert.ok(!prom.includes('password'));
  });

  test('6.10 Should maintain bounded latency history window preventing memory leak', () => {
    for (let i = 0; i < 1500; i++) {
      productionMetricsService.recordHttpRequest(200, 10);
    }
    assert.ok(productionMetricsService.httpStats.latenciesMs.length <= 1000);
  });
});
