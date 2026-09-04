/**
 * APIFIX AI — Phase 23 Environment Configuration Test Suite
 * 
 * Validates environment schemas, placeholder safety, and mode enforcement.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, describe } = require('node:test');
const { validateEnvironment } = require('../src/config/envValidator');
const { productionSecurityGates } = require('../src/services/productionSecurityGates');

describe('Phase 23 — Production Environment Configuration Suite', () => {

  test('2.1 Root .env.example exists and contains placeholders only', () => {
    const p = path.join(__dirname, '../../.env.example');
    assert.ok(fs.existsSync(p));
    const content = fs.readFileSync(p, 'utf8');
    assert.ok(content.includes('JWT_SECRET=your_jwt_secret_key_minimum_32_characters_here'));
    assert.ok(!content.includes('sk_live_'));
  });

  test('2.2 Backend .env.example categorizes server-only vs secret variables', () => {
    const p = path.join(__dirname, '../.env.example');
    assert.ok(fs.existsSync(p));
    const content = fs.readFileSync(p, 'utf8');
    assert.ok(content.includes('JWT_SECRET='));
    assert.ok(content.includes('STRIPE_SECRET_KEY='));
  });

  test('2.3 Frontend .env.example contains only NEXT_PUBLIC_* variables', () => {
    const p = path.join(__dirname, '../../frontend/.env.example');
    assert.ok(fs.existsSync(p));
    const content = fs.readFileSync(p, 'utf8');
    assert.ok(content.includes('NEXT_PUBLIC_BACKEND_URL'));
    assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'));
    assert.ok(!content.includes('JWT_SECRET'));
  });

  test('2.4 Security gate blocks missing JWT_SECRET in production mode', () => {
    const res = productionSecurityGates.evaluateSecurityGates({
      NODE_ENV: 'production',
      JWT_SECRET: ''
    });
    assert.strictEqual(res.allowed, false);
    assert.ok(res.blockers.some(b => b.gate === 'GATE_JWT_ENTROPY'));
  });

  test('2.5 Security gate blocks weak JWT_SECRET (< 32 chars) in production', () => {
    const res = productionSecurityGates.evaluateSecurityGates({
      NODE_ENV: 'production',
      JWT_SECRET: 'short_weak_secret'
    });
    assert.strictEqual(res.allowed, false);
  });

  test('2.6 Security gate blocks APIFIX_DEMO_MODE=true in production', () => {
    const res = productionSecurityGates.evaluateSecurityGates({
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_secure_and_long_production_jwt_secret_key_123',
      APIFIX_DEMO_MODE: 'true'
    });
    assert.strictEqual(res.allowed, false);
    assert.ok(res.blockers.some(b => b.gate === 'GATE_DEMO_MODE'));
  });

  test('2.7 Security gate blocks wildcard CORS (*) in production', () => {
    const res = productionSecurityGates.evaluateSecurityGates({
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_secure_and_long_production_jwt_secret_key_123',
      APIFIX_DEMO_MODE: 'false',
      ALLOWED_ORIGINS: '*'
    });
    assert.strictEqual(res.allowed, false);
    assert.ok(res.blockers.some(b => b.gate === 'GATE_CORS_WILDCARD'));
  });

  test('2.8 Security gate permits valid HTTPS origin in production', () => {
    const res = productionSecurityGates.evaluateSecurityGates({
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_secure_and_long_production_jwt_secret_key_123',
      APIFIX_DEMO_MODE: 'false',
      ALLOWED_ORIGINS: 'https://app.apifix.ai'
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.blockerCount, 0);
  });

  test('2.9 Development mode allows test execution without blockers', () => {
    const res = productionSecurityGates.evaluateSecurityGates({
      NODE_ENV: 'development'
    });
    assert.strictEqual(res.allowed, true);
  });

  test('2.10 validateEnvironment returns structured, sanitized configuration', () => {
    const config = validateEnvironment();
    assert.ok(config.environment);
    assert.ok(config.port);
    assert.ok(typeof config.isDemoMode === 'boolean');
  });
});
