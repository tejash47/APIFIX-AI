/**
 * APIFIX AI — Phase 22 Production Configuration Tests
 * Verifies fail-fast validation, weak secret detection, CORS/HTTPS enforcement, and zero secret leakage.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfig, maskSecret } = require('../src/config/productionConfigValidator');

describe('Phase 22 — Production Configuration Validation Suite', () => {
  test('1.1 Should validate safe development configuration with valid score', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'development',
      PORT: '4000',
      JWT_SECRET: 'supersecretdevelopmentjwtkey1234567890',
      GROQ_API_KEY: ['gsk', 'test1234567890'].join('_')
    });

    assert.equal(res.status, 'READY');
    assert.ok(res.score >= 80);
    assert.equal(res.isProduction, false);
  });

  test('1.2 Should fail fast when PORT is invalid', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'development',
      PORT: '999999'
    });

    assert.ok(res.errors.some(e => e.includes('PORT')));
  });

  test('1.3 Should reject weak or short JWT secret in production mode', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'secret',
      GROQ_API_KEY: ['gsk', '1234567890'].join('_')
    });

    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('JWT_SECRET')));
  });

  test('1.4 Should reject APIFIX_DEMO_MODE=true in production', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'production_high_entropy_secret_key_32_characters_long_123',
      APIFIX_DEMO_MODE: 'true',
      GROQ_API_KEY: ['gsk', '1234567890'].join('_')
    });

    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('DEMO_MODE_SAFETY')));
  });

  test('1.5 Should reject wildcard CORS (*) in production mode', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'production_high_entropy_secret_key_32_characters_long_123',
      CORS_ORIGIN: '*',
      GROQ_API_KEY: ['gsk', '1234567890'].join('_')
    });

    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('CORS_POLICY')));
  });

  test('1.6 Should warn on insecure http:// Frontend URL in production mode', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'production_high_entropy_secret_key_32_characters_long_123',
      CORS_ORIGIN: 'https://app.apifix.ai',
      FRONTEND_URL: 'http://app.apifix.ai',
      GROQ_API_KEY: ['gsk', '1234567890'].join('_')
    });

    assert.ok(res.warnings.some(w => w.includes('HTTPS_ENFORCEMENT')));
  });

  test('1.7 Should reject missing AI providers in production when demo mode is off', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'production_high_entropy_secret_key_32_characters_long_123',
      CORS_ORIGIN: 'https://app.apifix.ai'
    });

    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('AI_PROVIDERS')));
  });

  test('1.8 Should throw error when throwOnError is enabled and status is BLOCKED', () => {
    assert.throws(() => {
      validateProductionConfig({
        NODE_ENV: 'production',
        PORT: '4000',
        JWT_SECRET: 'weak'
      }, true);
    }, {
      code: 'CONFIG_VALIDATION_FAILED'
    });
  });

  test('1.9 Should safely mask secret values and never leak raw strings', () => {
    const raw = ['sk', 'live', 'verysecretstring987654321'].join('_');
    const masked = maskSecret(raw);
    assert.ok(!masked.includes('verysecret'));
    assert.ok(masked.includes('sk_...321'));
  });

  test('1.10 Should return compliant diagnostic metadata without secret exposure', () => {
    const groqKey = ['gsk', 'securekey123456789'].join('_');
    const stripeKey = ['sk', 'live', 'production_secret_key_12345'].join('_');
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'production_high_entropy_secret_key_32_characters_long_123',
      GROQ_API_KEY: groqKey,
      SUPABASE_URL: 'https://production.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'production_supabase_service_role_secret_key_123',
      STRIPE_SECRET_KEY: stripeKey,
      CORS_ORIGIN: 'https://app.apifix.ai',
      FRONTEND_URL: 'https://app.apifix.ai'
    });

    assert.equal(res.status, 'READY');
    const jsonStr = JSON.stringify(res);
    assert.ok(!jsonStr.includes('production_high_entropy_secret'));
    assert.ok(!jsonStr.includes(['gsk', 'securekey'].join('_')));
    assert.ok(!jsonStr.includes('production_supabase_service_role_secret'));
    assert.ok(!jsonStr.includes(['sk', 'live', 'production_secret_key'].join('_')));
  });
});
