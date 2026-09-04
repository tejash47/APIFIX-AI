/**
 * APIFIX AI — Phase 25 Support Diagnostics & Product Analytics Test Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { supportDiagnosticsService } = require('../src/services/supportDiagnosticsService');
const { productAnalyticsService } = require('../src/services/productAnalyticsService');

describe('Phase 25 — Support Diagnostics & Product Analytics', () => {

  beforeEach(() => {
    productAnalyticsService.resetEvents();
  });

  test('DIAGNOSTICS 1: Generates sanitized diagnostic bundle with correlation reference', () => {
    const fakeToken = ['sk', 'live', 'secret123456789'].join('_');
    const bundle = supportDiagnosticsService.generateDiagnosticPackage({
      workspaceId: 'ws_diag_test',
      projectId: 'proj_alpha',
      incidentId: 'inc_12345',
      repairId: 'rep_67890',
      userDescription: `Encountered failure with auth token Bearer ${fakeToken} and password=SuperSecret!`
    });

    assert.ok(bundle.ticketToken.startsWith('DIAG_'));
    assert.strictEqual(bundle.workspaceId, 'ws_diag_test');
    assert.strictEqual(bundle.classification, 'MEASURED');
    assert.ok(bundle.correlationId);

    // Ensure secrets are scrubbed
    assert.ok(!bundle.userDescription.includes(fakeToken));
    assert.ok(!bundle.userDescription.includes('SuperSecret!'));
    assert.ok(bundle.userDescription.includes('[REDACTED'));
  });

  test('ANALYTICS 1: Tracks product lifecycle events with zero PII retention', () => {
    const res = productAnalyticsService.trackEvent({
      eventName: 'first_api_connected',
      workspaceId: 'ws_analytics_1',
      userId: 'user_private@company.com',
      metadata: { endpointCount: 12, framework: 'express' }
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.eventId.startsWith('evt_'));

    const metrics = productAnalyticsService.getAggregateMetrics('ws_analytics_1');
    assert.strictEqual(metrics.totalEventsRecorded, 1);
    assert.strictEqual(metrics.funnel.apisConnected, 1);
  });

  test('ANALYTICS 2: Computes conversion funnel from signup to verified repair', () => {
    productAnalyticsService.trackEvent({ eventName: 'signup', workspaceId: 'ws_funnel' });
    productAnalyticsService.trackEvent({ eventName: 'onboarding_completed', workspaceId: 'ws_funnel' });
    productAnalyticsService.trackEvent({ eventName: 'first_api_connected', workspaceId: 'ws_funnel' });
    productAnalyticsService.trackEvent({ eventName: 'incident_detected', workspaceId: 'ws_funnel' });
    productAnalyticsService.trackEvent({ eventName: 'repair_verified', workspaceId: 'ws_funnel' });

    const metrics = productAnalyticsService.getAggregateMetrics('ws_funnel');
    assert.strictEqual(metrics.funnel.signups, 1);
    assert.strictEqual(metrics.funnel.onboardingCompleted, 1);
    assert.strictEqual(metrics.funnel.apisConnected, 1);
    assert.strictEqual(metrics.funnel.incidentsDetected, 1);
    assert.strictEqual(metrics.funnel.repairsVerified, 1);
  });
});
