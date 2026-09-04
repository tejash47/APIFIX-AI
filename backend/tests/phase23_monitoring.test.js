/**
 * APIFIX AI — Phase 23 Cloud Monitoring & Observability Test Suite
 * 
 * Validates structured alert formatting, secret scrubbing in telemetry, and Prometheus exposition.
 */

const assert = require('assert');
const { test, describe } = require('node:test');
const { cloudMonitoringService, SEVERITY_LEVELS } = require('../src/services/cloudMonitoringService');
const { productionMetricsService } = require('../src/services/productionMetricsService');

describe('Phase 23 — Cloud Monitoring & Multi-Provider Alerting Suite', () => {

  test('8.1 Formats structured alert payload with correlation ID and timestamp', () => {
    const alert = cloudMonitoringService.formatAlertPayload({
      title: 'Database Latency Spike',
      severity: SEVERITY_LEVELS.HIGH,
      message: 'P99 query latency exceeded 120ms',
      category: 'DATABASE'
    });

    assert.strictEqual(alert.service, 'apifix-backend');
    assert.strictEqual(alert.severity, 'HIGH');
    assert.strictEqual(alert.category, 'DATABASE');
    assert.ok(alert.correlationId.startsWith('mon_'));
    assert.ok(alert.timestamp);
  });

  test('8.2 Automatically scrubs secrets from alert metadata', () => {
    const fakeToken = ['sk', 'live', '51M0secret1234567890abcdef'].join('_');
    const alert = cloudMonitoringService.formatAlertPayload({
      title: 'Failed Auth Attempt',
      severity: SEVERITY_LEVELS.MEDIUM,
      metadata: {
        tokenAttempt: fakeToken,
        jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoxfQ.signature'
      }
    });

    assert.ok(!JSON.stringify(alert).includes(['sk', 'live', '51M0secret'].join('_')));
    assert.strictEqual(alert.metadata.tokenAttempt, '[REDACTED]');
  });

  test('8.3 Dispatches alert and records into recent telemetry buffer', async () => {
    const res = await cloudMonitoringService.dispatchAlert({
      title: 'Canary Deployment 10% Shift',
      severity: SEVERITY_LEVELS.INFO,
      category: 'DEPLOYMENT'
    });

    assert.strictEqual(res.dispatched, true);
    assert.ok(Array.isArray(res.activeChannels));
  });

  test('8.4 Monitoring status reports environment and recent alert buffer', () => {
    const status = cloudMonitoringService.getMonitoringStatus();
    assert.strictEqual(status.status, 'HEALTHY');
    assert.ok(status.recentAlertsCount > 0);
  });

  test('8.5 Prometheus metric exporter formats valid text exposition', () => {
    const prom = productionMetricsService.getPrometheusFormat();
    assert.ok(prom.includes('# HELP apifix_http_requests_total'));
    assert.ok(prom.includes('# TYPE apifix_http_requests_total counter'));
    assert.ok(prom.includes('# HELP apifix_http_request_duration_seconds'));
    assert.ok(prom.includes('# TYPE apifix_http_request_duration_seconds summary'));
  });

  test('8.6 Prometheus metrics include worker queue gauge', () => {
    const prom = productionMetricsService.getPrometheusFormat();
    assert.ok(prom.includes('apifix_worker_queue_depth'));
  });

  test('8.7 Prometheus metrics include AI token expenditure gauge', () => {
    const prom = productionMetricsService.getPrometheusFormat();
    assert.ok(prom.includes('apifix_ai_token_expenditure_total'));
  });

  test('8.8 Dispatches CRITICAL severity alert without crashing on unconfigured channels', async () => {
    const res = await cloudMonitoringService.dispatchAlert({
      title: 'Circuit Breaker OPEN',
      severity: SEVERITY_LEVELS.CRITICAL,
      category: 'DATABASE_RESILIENCE'
    });
    assert.strictEqual(res.dispatched, true);
    assert.strictEqual(res.alert.severity, 'CRITICAL');
  });

  test('8.9 Recent alerts buffer enforces maximum cap to prevent memory leaks', async () => {
    for (let i = 0; i < 25; i++) {
      await cloudMonitoringService.dispatchAlert({ title: `Bulk Alert ${i}` });
    }
    const status = cloudMonitoringService.getMonitoringStatus();
    assert.ok(status.recentAlerts.length <= 10);
  });

  test('8.10 Correlation ID is preserved when provided explicitly', () => {
    const customId = 'trace_custom_deployment_123';
    const alert = cloudMonitoringService.formatAlertPayload({
      title: 'Custom Trace',
      correlationId: customId
    });
    assert.strictEqual(alert.correlationId, customId);
  });
});
