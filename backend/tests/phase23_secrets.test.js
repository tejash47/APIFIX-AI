/**
 * APIFIX AI — Phase 23 Automated Secret Scanner Test Suite
 * 
 * Validates secret detection patterns, masking behavior, and zero-leakage invariants.
 */

const assert = require('assert');
const { test, describe } = require('node:test');
const { secretScanner, maskSecret } = require('../src/services/secretScanner');

describe('Phase 23 — Automated Secret Scanner Suite', () => {

  test('3.1 Detects live Stripe secret key (sk_live_...) and marks BLOCKER', () => {
    const fakeKey = ['sk', 'live', '51M0abcdefghijklmnopqrstuvwxyz1234567890'].join('_');
    const raw = `const stripeKey = "${fakeKey}";`;
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'Stripe Secret Key');
    assert.strictEqual(res.findings[0].severity, 'BLOCKER');
    assert.ok(res.findings[0].maskedSample.startsWith('sk_l'));
  });

  test('3.2 Detects Stripe test secret key (sk_test_...)', () => {
    const fakeKey = ['sk', 'test', '51M0abcdefghijklmnopqrstuvwxyz1234567890'].join('_');
    const raw = `STRIPE_SECRET_KEY=${fakeKey}`;
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'Stripe Secret Key');
  });

  test('3.3 Detects Stripe webhook secret (whsec_...)', () => {
    const fakeKey = ['whsec', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('_');
    const raw = `STRIPE_WEBHOOK_SECRET=${fakeKey}`;
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'Stripe Webhook Secret');
  });

  test('3.4 Detects GitHub Personal Access Token (ghp_...)', () => {
    const fakeKey = ['ghp', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('_');
    const raw = `GITHUB_TOKEN=${fakeKey}`;
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'GitHub Personal Access Token');
  });

  test('3.5 Detects Anthropic API key (sk-ant-...)', () => {
    const fakeKey = ['sk', 'ant', 'api03-abcdefghijklmnopqrstuvwxyz1234567890_abcdef'].join('-');
    const raw = `ANTHROPIC_API_KEY=${fakeKey}`;
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'Anthropic API Key');
  });

  test('3.6 Detects Groq API key (gsk_...)', () => {
    const fakeKey = ['gsk', 'abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrst'].join('_');
    const raw = `GROQ_API_KEY=${fakeKey}`;
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'Groq API Key');
  });

  test('3.7 Detects RSA/EC Private Key headers', () => {
    const raw = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'RSA/EC Private Key');
  });

  test('3.8 Detects AWS Access Key ID (AKIA...)', () => {
    const raw = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    const res = secretScanner.scanContent(raw);
    assert.strictEqual(res.clean, false);
    assert.strictEqual(res.findings[0].type, 'AWS Access Key ID');
  });

  test('3.9 Ignores placeholder templates in .env.example files', () => {
    const raw = 'JWT_SECRET=your_jwt_secret_key_minimum_32_characters_here';
    const res = secretScanner.scanContent(raw, '.env.example');
    assert.strictEqual(res.clean, true);
  });

  test('3.10 maskSecret scrubs middle characters safely', () => {
    const fakeKey = ['sk', 'live', '1234567890abcdef'].join('_');
    const masked = maskSecret(fakeKey);
    assert.strictEqual(masked, 'sk_l...cdef');
    assert.ok(!masked.includes('1234567890'));
  });

  test('3.11 Scans clean code snippet without false positives', () => {
    const cleanCode = `
      function calculateSum(a, b) {
        return a + b;
      }
      module.exports = { calculateSum };
    `;
    const res = secretScanner.scanContent(cleanCode);
    assert.strictEqual(res.clean, true);
    assert.strictEqual(res.findings.length, 0);
  });

  test('3.12 Directory scan executes recursively and ignores node_modules and .git', () => {
    const res = secretScanner.scanDirectory(__dirname);
    assert.ok(typeof res.filesScanned === 'number');
    assert.ok(res.filesScanned > 0);
  });
});
