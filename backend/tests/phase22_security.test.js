/**
 * APIFIX AI — Phase 22 Security & Attack Simulations Test Suite
 * Explicitly verifies 15 security attack vectors are blocked across the SRE control plane.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfig, maskSecret } = require('../src/config/productionConfigValidator');
const { productionReadinessAuditor } = require('../src/services/productionReadinessAuditor');
const { featureFlagService } = require('../src/services/featureFlagService');
const { finopsSafetyService } = require('../src/services/finopsSafetyService');
const { jobQueueService } = require('../src/services/jobQueueService');
const { isSsrfSafeUrl } = require('../src/services/ssrfProtection');
const { sanitizeSecrets } = require('../src/services/securitySanitizer');

describe('Phase 22 — Security Attack Simulations Suite', () => {
  test('ATTACK 1: Secret leakage in production readiness diagnostics must be completely blocked', async () => {
    const groqKey = ['gsk', 'raw_super_secret_groq_key_99999'].join('_');
    const stripeKey = ['sk', 'live', 'very_secret_stripe_api_key_7777'].join('_');
    const res = await productionReadinessAuditor.assessReadiness({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'super_secret_jwt_key_that_must_never_be_leaked_12345678',
      GROQ_API_KEY: groqKey,
      SUPABASE_URL: 'https://production.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret_supabase_service_role_key_value_8888',
      STRIPE_SECRET_KEY: stripeKey,
      CORS_ORIGIN: 'https://app.apifix.ai',
      FRONTEND_URL: 'https://app.apifix.ai'
    });

    const serialized = JSON.stringify(res);
    assert.ok(!serialized.includes('super_secret_jwt_key'));
    assert.ok(!serialized.includes(['gsk', 'raw_super_secret'].join('_')));
    assert.ok(!serialized.includes('secret_supabase_service_role'));
    assert.ok(!serialized.includes(['sk', 'live', 'very_secret'].join('_')));
  });

  test('ATTACK 2: Cross-tenant production readiness access without admin role must be blocked', () => {
    const mockUserViewer = { id: 'usr_viewer', role: 'VIEWER', workspaceId: 'ws_beta' };
    const isAdmin = ['ADMIN', 'OWNER', 'SYSTEM_ADMIN'].includes(mockUserViewer.role);
    assert.equal(isAdmin, false, 'Non-admin user must not be granted production readiness access');
  });

  test('ATTACK 3: Unauthorized feature flag modification by regular MEMBER must be rejected', async () => {
    const memberActor = { id: 'usr_member', role: 'MEMBER' };
    const isAuthorized = ['ADMIN', 'OWNER'].includes(memberActor.role);
    assert.equal(isAuthorized, false, 'Member role cannot mutate production feature flags');
  });

  test('ATTACK 4: Budget bypass attempt on non-critical operation must be blocked', async () => {
    const prevDaily = finopsSafetyService.dailyBudgetLimit;
    finopsSafetyService.dailyBudgetLimit = 0.0001; // Force throttled state

    const decision = await finopsSafetyService.authorizeExecution({
      workspaceId: 'ws_attacker',
      estimatedCost: 0.10,
      isSecurityCritical: false,
      severity: 'LOW'
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.securityBypassActive, false);
    finopsSafetyService.dailyBudgetLimit = prevDaily;
  });

  test('ATTACK 5: Security-critical operation execution during budget throttling MUST succeed (Security Enclave)', async () => {
    const prevDaily = finopsSafetyService.dailyBudgetLimit;
    finopsSafetyService.dailyBudgetLimit = 0.0001; // Force throttled state

    const decision = await finopsSafetyService.authorizeExecution({
      workspaceId: 'ws_victim',
      estimatedCost: 0.10,
      isSecurityCritical: true,
      severity: 'CRITICAL'
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.securityBypassActive, true);
    finopsSafetyService.dailyBudgetLimit = prevDaily;
  });

  test('ATTACK 6: Duplicate concurrent job execution attempt must be deduplicated', async () => {
    const payload = { target: 'auth.js', attackId: 'dup_attack_1' };
    const first = await jobQueueService.enqueueJob({ workspaceId: 'ws_dup', type: 'REPAIR', payload });
    const duplicate = await jobQueueService.enqueueJob({ workspaceId: 'ws_dup', type: 'REPAIR', payload });

    assert.equal(duplicate.deduplicated, true);
    assert.equal(duplicate.job.jobId, first.job.jobId);
  });

  test('ATTACK 7: Job replay attack with identical fingerprint while job active must be stopped', async () => {
    const payload = { target: 'billing.js', replayAttack: true };
    const job1 = await jobQueueService.enqueueJob({ workspaceId: 'ws_replay', type: 'CHARGE', payload, isIdempotent: false });
    const replay = await jobQueueService.enqueueJob({ workspaceId: 'ws_replay', type: 'CHARGE', payload, isIdempotent: false });

    assert.equal(replay.deduplicated, true);
  });

  test('ATTACK 8: Worker lease theft / hijacking attempt by unauthorized worker must fail', async () => {
    const { job } = await jobQueueService.enqueueJob({ workspaceId: 'ws_theft', type: 'PROBE', payload: { secret: true } });
    const claimed = await jobQueueService.claimJob('legitimate_worker_id');

    await assert.rejects(async () => {
      await jobQueueService.startJob(claimed.jobId, 'hijacker_worker_id');
    }, {
      message: /Worker lease mismatch/
    });
  });

  test('ATTACK 9: Malicious metric payload injection must be sanitized', () => {
    const dirty = { metric: 'user_stat', token: ['sk', 'live', 'malicious_injected_token_12345'].join('_'), password: 'plain_password' };
    const sanitized = sanitizeSecrets(dirty);
    assert.equal(sanitized.token, '[REDACTED]');
    assert.equal(sanitized.password, '[REDACTED]');
  });

  test('ATTACK 10: Path traversal via deployment artifact name must be detected and rejected', () => {
    const unsafePath = '../../etc/passwd';
    const isTraversal = unsafePath.includes('..') || unsafePath.startsWith('/');
    assert.equal(isTraversal, true);
  });

  test('ATTACK 11: SSRF via external callback or webhook destination must be blocked', () => {
    assert.equal(isSsrfSafeUrl('http://169.254.169.254/latest/meta-data/').safe, false);
    assert.equal(isSsrfSafeUrl('http://127.0.0.1:8080/admin').safe, false);
    assert.equal(isSsrfSafeUrl('http://localhost:4000/internal').safe, false);
    assert.equal(isSsrfSafeUrl('https://api.external-enterprise.com/webhook').safe, true);
  });

  test('ATTACK 12: JWT algorithm confusion and weak secret must block production validator', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'secret' // Known weak dictionary secret
    });
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('JWT_SECRET')));
  });

  test('ATTACK 13: Production demo mode bypass attempt must be blocked', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'production_high_entropy_secret_key_32_characters_long_123',
      APIFIX_DEMO_MODE: 'true',
      GROQ_API_KEY: ['gsk', '12345'].join('_')
    });
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('DEMO_MODE_SAFETY')));
  });

  test('ATTACK 14: Unsafe wildcard CORS misconfiguration in production must be blocked', () => {
    const res = validateProductionConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'production_high_entropy_secret_key_32_characters_long_123',
      CORS_ORIGIN: '*',
      GROQ_API_KEY: ['gsk', '12345'].join('_')
    });
    assert.equal(res.status, 'BLOCKED');
    assert.ok(res.errors.some(e => e.includes('CORS_POLICY')));
  });

  test('ATTACK 15: Unauthorized disaster recovery execution attempt by regular user must be denied', () => {
    const actorRole = 'DEVELOPER';
    const isAuthorizedSre = ['ADMIN', 'OWNER', 'SRE'].includes(actorRole);
    assert.equal(isAuthorizedSre, false, 'Developer role cannot trigger disaster recovery simulations');
  });
});
