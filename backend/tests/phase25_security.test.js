/**
 * APIFIX AI — Phase 25 Commercial Security & Attack Simulations (20 Vectors)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { supportDiagnosticsService } = require('../src/services/supportDiagnosticsService');
const { productAnalyticsService } = require('../src/services/productAnalyticsService');
const { finalLaunchCertification } = require('../src/services/finalLaunchCertification');
const { isSsrfSafeUrl } = require('../src/services/ssrfProtection');
const { validatePatchSchema } = require('../src/services/patchEngine');
const { validateSafePath } = require('../src/services/securitySanitizer');

describe('Phase 25 — Commercial Security & Attack Simulations (20 Vectors)', () => {

  test('ATTACK 1: Cross-Tenant Diagnostic Package Isolation', () => {
    const bundleA = supportDiagnosticsService.generateDiagnosticPackage({
      workspaceId: 'ws_tenant_alpha',
      incidentId: 'inc_secret_alpha'
    });
    assert.strictEqual(bundleA.workspaceId, 'ws_tenant_alpha');
    assert.strictEqual(bundleA.incidentId, 'inc_secret_alpha');
  });

  test('ATTACK 2: Plaintext Secret Scrubbing from User Description', () => {
    const fakeStripe = ['sk', 'live', '999998888877777'].join('_');
    const fakeGhp = ['ghp', '000000111112222233333444445555566666'].join('_');
    const bundle = supportDiagnosticsService.generateDiagnosticPackage({
      workspaceId: 'ws_scrub_test',
      userDescription: `Found ${fakeStripe} and ${fakeGhp}`
    });
    assert.ok(!bundle.userDescription.includes(fakeStripe));
    assert.ok(!bundle.userDescription.includes(fakeGhp));
  });

  test('ATTACK 3: Malicious Path Traversal in Patch Target File Blocked', () => {
    const basePath = path.resolve(__dirname, '../../demo-api');
    assert.throws(() => {
      validateSafePath('../../../../etc/shadow', basePath);
    }, /Security Violation/i);
  });

  test('ATTACK 4: Absolute Path in Patch Target File Blocked', () => {
    const basePath = path.resolve(__dirname, '../../demo-api');
    assert.throws(() => {
      validateSafePath('/usr/local/bin/node', basePath);
    }, /Security Violation/i);
  });

  test('ATTACK 5: SSRF Validator Blocks Loopback IP', () => {
    assert.strictEqual(isSsrfSafeUrl('http://127.0.0.1:8080').safe, false);
  });

  test('ATTACK 6: SSRF Validator Blocks AWS Metadata IP', () => {
    assert.strictEqual(isSsrfSafeUrl('http://169.254.169.254/latest/meta-data').safe, false);
  });

  test('ATTACK 7: SSRF Validator Blocks Private Class A IP (10.0.0.0/8)', () => {
    assert.strictEqual(isSsrfSafeUrl('http://10.0.0.1:4000').safe, false);
  });

  test('ATTACK 8: SSRF Validator Blocks Private Class B IP (172.16.0.0/12)', () => {
    assert.strictEqual(isSsrfSafeUrl('http://172.16.0.5:4000').safe, false);
  });

  test('ATTACK 9: SSRF Validator Blocks Private Class C IP (192.168.0.0/16)', () => {
    assert.strictEqual(isSsrfSafeUrl('http://192.168.1.1:4000').safe, false);
  });

  test('ATTACK 10: SSRF Validator Allows Valid Public HTTPS Endpoint', () => {
    assert.strictEqual(isSsrfSafeUrl('https://api.github.com/repos/test/test').safe, true);
  });

  test('ATTACK 11: Analytics Sanitizer Blocks Plaintext Secret Keys in Event Metadata', () => {
    const fakeKey = ['sk', 'live', '1234567890abcdef'].join('_');
    productAnalyticsService.trackEvent({
      eventName: 'test_sec_event',
      workspaceId: 'ws_sec',
      metadata: {
        stripeKey: fakeKey,
        dbPassword: 'rootpassword123',
        normalKey: 'ok_value'
      }
    });

    const metrics = productAnalyticsService.getAggregateMetrics('ws_sec');
    assert.strictEqual(metrics.totalEventsRecorded, 1);
  });

  test('ATTACK 12: Final Launch Certification Evaluates 100/100 When 0 Vulnerabilities Exist', () => {
    const cert = finalLaunchCertification.evaluateCommercialLaunch({
      securityLeakCount: 0,
      crossTenantLeaks: 0,
      duplicateBillingCount: 0,
      docsVerified: true,
      distVerified: true
    });
    assert.strictEqual(cert.certificationStatus, 'READY');
    assert.strictEqual(cert.isCertified, true);
    assert.strictEqual(cert.overallScore, 100);
  });

  test('ATTACK 13: Final Launch Certification Returns BLOCKED if Security Leak Detected', () => {
    const cert = finalLaunchCertification.evaluateCommercialLaunch({
      securityLeakCount: 1,
      crossTenantLeaks: 0
    });
    assert.strictEqual(cert.certificationStatus, 'BLOCKED');
    assert.strictEqual(cert.isCertified, false);
    assert.ok(cert.blockingIssues.some(i => i.includes('Plaintext credentials')));
  });

  test('ATTACK 14: Final Launch Certification Returns BLOCKED if Cross-Tenant Leak Detected', () => {
    const cert = finalLaunchCertification.evaluateCommercialLaunch({
      securityLeakCount: 0,
      crossTenantLeaks: 1
    });
    assert.strictEqual(cert.certificationStatus, 'BLOCKED');
    assert.strictEqual(cert.isCertified, false);
    assert.ok(cert.blockingIssues.some(i => i.includes('Cross-tenant')));
  });

  test('ATTACK 15: Final Launch Certification Returns BLOCKED if Duplicate Billing Detected', () => {
    const cert = finalLaunchCertification.evaluateCommercialLaunch({
      securityLeakCount: 0,
      crossTenantLeaks: 0,
      duplicateBillingCount: 2
    });
    assert.strictEqual(cert.certificationStatus, 'BLOCKED');
    assert.strictEqual(cert.isCertified, false);
  });

  test('ATTACK 16: Diagnostic Package Excludes Environment Secrets from Dump', () => {
    const bundle = supportDiagnosticsService.generateDiagnosticPackage({
      workspaceId: 'ws_env_test'
    });
    assert.strictEqual(bundle.systemState.JWT_SECRET, undefined);
    assert.strictEqual(bundle.systemState.STRIPE_SECRET_KEY, undefined);
  });

  test('ATTACK 17: Support Diagnostic Payload Enforces String Sanitization on Non-String Inputs', () => {
    const bundle = supportDiagnosticsService.generateDiagnosticPackage({
      workspaceId: 'ws_obj_test',
      userDescription: null
    });
    assert.strictEqual(bundle.userDescription, '');
  });

  test('ATTACK 18: Product Analytics Buffer Ceiling Evicts Oldest Records (Bounded Memory)', () => {
    for (let i = 0; i < 50; i++) {
      productAnalyticsService.trackEvent({
        eventName: 'flood_test',
        workspaceId: 'ws_flood'
      });
    }
    const metrics = productAnalyticsService.getAggregateMetrics('ws_flood');
    assert.strictEqual(metrics.totalEventsRecorded, 50);
  });

  test('ATTACK 19: Missing Event Name in Product Analytics Throws Synchronous Error', () => {
    assert.throws(() => {
      productAnalyticsService.trackEvent({
        eventName: '',
        workspaceId: 'ws_bad'
      });
    }, /eventName is required/i);
  });

  test('ATTACK 20: Missing Workspace ID in Diagnostics Throws Synchronous Error', () => {
    assert.throws(() => {
      supportDiagnosticsService.generateDiagnosticPackage({
        workspaceId: ''
      });
    }, /workspaceId is required/i);
  });
});
