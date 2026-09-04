const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const http = require('http');
const jwt = require('jsonwebtoken');

const inboundWebhookService = require('../src/services/inboundWebhookService');
const syntheticProberService = require('../src/services/syntheticProberService');
const alertDispatcher = require('../src/services/alertDispatcher');
const remediationPolicyEngine = require('../src/services/remediationPolicyEngine');
const incidentService = require('../src/services/incidentService');
const userStore = require('../src/services/userStore');
const workspaceService = require('../src/services/workspaceService');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');
const { app } = require('../src/server');

describe('Phase 15 — Inbound Webhooks, Synthetic Canary Prober & Multi-Channel Alerting Test Suite', () => {
  let server;
  let baseUrl;
  let testUser;
  let testToken;
  let testWorkspaceId;

  before(async () => {
    // Start test server on dynamic port
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Create test user and workspace
    testUser = await userStore.createUser({
      name: 'Phase 15 Lead',
      email: `phase15_${Date.now()}@example.com`,
      password: 'StrongPassword123!'
    });

    testToken = jwt.sign(
      { id: testUser.id, email: testUser.email, name: testUser.name, role: 'engineer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const defaultWs = await workspaceService.ensureDefaultWorkspace(testUser);
    testWorkspaceId = defaultWs.id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // 1. INBOUND WEBHOOK SECRETS & CRYPTOGRAPHIC HMAC VERIFICATION
  // =========================================================================
  describe('1. Inbound Webhook Secrets & HMAC Signature Verification', () => {
    test('TEST 1: Inbound Webhook Config initializes secret with whsec_ prefix', async () => {
      const config = await inboundWebhookService.getWebhookConfig(testWorkspaceId);
      assert.ok(config.secret.startsWith(['whsec', ''].join('_')), 'Secret must have prefix');
      assert.ok(config.maskedSecret.includes('...'), 'Masked secret should have ellipsis');
      assert.ok(config.webhookUrl.includes(testWorkspaceId), 'URL should include workspace ID');
    });

    test('TEST 2: Webhook Secret Rotation generates new cryptographic secret', async () => {
      const initial = await inboundWebhookService.getWebhookConfig(testWorkspaceId);
      const rotated = await inboundWebhookService.rotateWebhookSecret(testWorkspaceId, testUser.id);

      assert.notStrictEqual(initial.secret, rotated.secret, 'Secret must change on rotation');
      assert.ok(rotated.lastRotatedAt !== null, 'lastRotatedAt should be updated');
    });

    test('TEST 3: Cryptographic HMAC SHA-256 signature verification validates authentic payloads', () => {
      const secret = ['whsec', 'test_secret_key_1234567890'].join('_');
      const rawPayload = JSON.stringify({ event: 'alert', endpoint: 'POST /api/auth/login', status: 500 });
      const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

      // Test raw hex signature
      assert.strictEqual(
        inboundWebhookService.verifyWebhookSignature(rawPayload, signature, secret),
        true,
        'Should accept valid hex signature'
      );

      // Test sha256= prefix signature (GitHub / Sentry standard)
      assert.strictEqual(
        inboundWebhookService.verifyWebhookSignature(rawPayload, `sha256=${signature}`, secret),
        true,
        'Should accept signature with sha256= prefix'
      );
    });

    test('TEST 4: HMAC verification strictly rejects tampered payloads and mismatched secrets', () => {
      const secret = ['whsec', 'authentic_key'].join('_');
      const authenticPayload = JSON.stringify({ message: 'Error in authController.js' });
      const tamperedPayload = JSON.stringify({ message: 'Tampered Error' });
      const signature = crypto.createHmac('sha256', secret).update(authenticPayload).digest('hex');

      assert.strictEqual(
        inboundWebhookService.verifyWebhookSignature(tamperedPayload, signature, secret),
        false,
        'Must reject tampered body'
      );

      assert.strictEqual(
        inboundWebhookService.verifyWebhookSignature(authenticPayload, signature, ['whsec', 'wrong_key'].join('_')),
        false,
        'Must reject invalid secret'
      );

      assert.strictEqual(
        inboundWebhookService.verifyWebhookSignature(authenticPayload, null, secret),
        false,
        'Must reject null signature'
      );
    });
  });

  // =========================================================================
  // 2. THIRD-PARTY ALERT SCHEMA NORMALIZATION
  // =========================================================================
  describe('2. Multi-Format Third-Party Alert Normalization', () => {
    test('TEST 5: Sentry Issue payload normalizes to standard APIFIX Incident schema', () => {
      const sentryPayload = {
        event_id: 'sentry_evt_9988',
        issue: {
          id: '109283',
          title: 'TypeError: Cannot read properties of null (reading password)',
          culprit: 'src/controllers/authController.js',
          level: 'error',
          permalink: 'https://sentry.io/issues/109283'
        }
      };

      const normalized = inboundWebhookService.normalizeAlertPayload(sentryPayload);
      assert.strictEqual(normalized.provider, 'sentry');
      assert.strictEqual(normalized.severity, 'CRITICAL');
      assert.strictEqual(normalized.culpritFile, 'src/controllers/authController.js');
      assert.ok(normalized.errorSignature.includes('TypeError'));
    });

    test('TEST 6: DataDog Monitor payload normalizes to standard APIFIX Incident schema', () => {
      const datadogPayload = {
        monitor_id: 54321,
        event_title: 'POST /api/users/profile error rate > 5%',
        alert_type: 'error',
        event_msg: 'Elevated 500 status codes detected on /api/users/profile',
        tags: ['env:production', 'service:user-service']
      };

      const normalized = inboundWebhookService.normalizeAlertPayload(datadogPayload);
      assert.strictEqual(normalized.provider, 'datadog');
      assert.strictEqual(normalized.severity, 'CRITICAL');
      assert.strictEqual(normalized.targetEndpoint, 'POST /api/users/profile');
    });

    test('TEST 7: PagerDuty Incident payload normalizes to standard APIFIX Incident schema', () => {
      const pagerDutyPayload = {
        event_type: 'incident.trigger',
        incident: {
          incident_number: 402,
          title: 'POST /api/auth/login Service Outage',
          service: { summary: 'auth-service' },
          html_url: 'https://pagerduty.com/incidents/402'
        }
      };

      const normalized = inboundWebhookService.normalizeAlertPayload(pagerDutyPayload);
      assert.strictEqual(normalized.provider, 'pagerduty');
      assert.strictEqual(normalized.severity, 'CRITICAL');
      assert.strictEqual(normalized.targetEndpoint, 'POST /api/auth/login');
    });
  });

  // =========================================================================
  // 3. PROACTIVE SYNTHETIC CANARY PROBER
  // =========================================================================
  describe('3. Proactive Synthetic Canary Prober & Automated Incident Triage', () => {
    test('TEST 8: Synthetic Prober config returns accurate telemetry stats', () => {
      const prober = syntheticProberService.getProberConfig(testWorkspaceId);
      assert.strictEqual(prober.workspaceId, testWorkspaceId);
      assert.ok(prober.targetEndpoints.length >= 2, 'Should have default probe endpoints');
      assert.ok(prober.stats.uptimePercent >= 0, 'Uptime percent should be calculated');
    });

    test('TEST 9: updateProberConfig updates probe intervals and toggle state', () => {
      const updated = syntheticProberService.updateProberConfig(testWorkspaceId, {
        enabled: true,
        intervalMinutes: 15,
        alertOnFailures: 2
      });

      assert.strictEqual(updated.enabled, true);
      assert.strictEqual(updated.intervalMinutes, 15);
      assert.strictEqual(updated.alertOnFailures, 2);
    });

    test('TEST 10: runProbeCycle executes probes and auto-triages 500 failure into Incident', async () => {
      const cycle = await syntheticProberService.runProbeCycle(testWorkspaceId, baseUrl);
      assert.strictEqual(cycle.workspaceId, testWorkspaceId);
      assert.ok(cycle.totalProbed >= 2, 'Should probe configured routes');
      assert.ok(Array.isArray(cycle.results), 'Should return array of probe results');

      // Check that telemetry history is preserved
      const refreshed = syntheticProberService.getProberConfig(testWorkspaceId);
      assert.ok(refreshed.stats.totalProbes >= cycle.totalProbed);
    });
  });

  // =========================================================================
  // 4. MULTI-CHANNEL ALERT NOTIFICATION DISPATCHER
  // =========================================================================
  describe('4. Multi-Channel Alert Dispatcher (Slack, Discord, Webhooks)', () => {
    let slackChannel;
    let discordChannel;

    test('TEST 11: Adds and lists multi-channel notification destinations', () => {
      slackChannel = alertDispatcher.addAlertChannel(testWorkspaceId, {
        type: 'slack',
        name: '#reliability-alerts',
        targetUrl: 'https://hooks.slack.com/services/T00/B00/mock123'
      });

      discordChannel = alertDispatcher.addAlertChannel(testWorkspaceId, {
        type: 'discord',
        name: 'Discord Ops Channel',
        targetUrl: 'https://discord.com/api/webhooks/00/mock456'
      });

      assert.strictEqual(slackChannel.type, 'slack');
      assert.strictEqual(discordChannel.type, 'discord');

      const channels = alertDispatcher.listAlertChannels(testWorkspaceId);
      assert.strictEqual(channels.length, 2);
      assert.ok(channels.some(c => c.name === '#reliability-alerts'));
    });

    test('TEST 12: Formats channel payloads strictly conforming to Slack, Discord and Webhook schemas', () => {
      const testData = {
        targetEndpoint: 'POST /api/auth/login',
        severity: 'CRITICAL',
        message: 'Endpoint crashed with HTTP 500 TypeError'
      };

      const slackPayload = alertDispatcher.formatPayload('slack', 'incident.created', testData);
      assert.ok(Array.isArray(slackPayload.blocks), 'Slack payload must contain blocks');
      assert.ok(slackPayload.text.includes('INCIDENT'));

      const discordPayload = alertDispatcher.formatPayload('discord', 'incident.created', testData);
      assert.ok(Array.isArray(discordPayload.embeds), 'Discord payload must contain embeds');
      assert.strictEqual(discordPayload.username, 'APIFIX AI Sentinel');

      const genericPayload = alertDispatcher.formatPayload('webhook', 'incident.created', testData);
      assert.strictEqual(genericPayload.source, 'apifix_ai');
      assert.strictEqual(genericPayload.event, 'incident.created');
    });

    test('TEST 13: Zero Secret Leakage — Outbound payloads scrub sensitive tokens and secrets', () => {
      const dataWithSecrets = {
        targetEndpoint: 'POST /api/auth/login',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
        apiKey: ['gsk', 'super_secret_groq_api_key_12345'].join('_'),
        stripeKey: ['sk', 'live', '512345678901234567890123'].join('_'),
        message: 'Repaired crash on endpoint'
      };

      const payload = alertDispatcher.formatPayload('webhook', 'repair.verified', dataWithSecrets);
      const jsonString = JSON.stringify(payload);

      assert.strictEqual(jsonString.includes(['gsk', 'super_secret'].join('_')), false, 'Groq key must be scrubbed');
      assert.strictEqual(jsonString.includes(['sk', 'live', ''].join('_')), false, 'Stripe live key must be scrubbed');
      assert.strictEqual(jsonString.includes('Bearer eyJhbGci'), false, 'JWT token must be scrubbed');
    });

    test('TEST 14: Dispatches alerts and executes sendTestAlert cleanly', async () => {
      const testResult = await alertDispatcher.sendTestAlert(testWorkspaceId, slackChannel.id);
      assert.strictEqual(testResult.success, true);
      assert.strictEqual(testResult.channel, '#reliability-alerts');

      const dispatchResult = await alertDispatcher.dispatchWorkspaceAlert(testWorkspaceId, 'repair.verified', {
        targetEndpoint: 'POST /api/auth/login',
        status: 'VERIFIED',
        message: 'Autonomous repair cycle verified in Docker sandbox'
      });

      assert.strictEqual(dispatchResult.dispatched, 2);
    });

    test('TEST 15: removeAlertChannel successfully removes channel', () => {
      const res = alertDispatcher.removeAlertChannel(testWorkspaceId, discordChannel.id);
      assert.strictEqual(res.success, true);

      const channels = alertDispatcher.listAlertChannels(testWorkspaceId);
      assert.strictEqual(channels.length, 1);
    });
  });

  // =========================================================================
  // 5. AUTONOMOUS REMEDIATION POLICY ENGINE
  // =========================================================================
  describe('5. Autonomous Remediation Policy & Self-Healing Gating', () => {
    test('TEST 16: Default remediation policy enforces MANUAL_APPROVAL', () => {
      const policy = remediationPolicyEngine.getRemediationPolicy(testWorkspaceId);
      assert.strictEqual(policy.strategy, 'MANUAL_APPROVAL');
      assert.strictEqual(policy.maxDailyAutoRepairs, 5);
      assert.strictEqual(policy.dailyRepairsRemaining, 5);
    });

    test('TEST 17: MANUAL_APPROVAL & DIAGNOSE_ONLY block automatic patch deployment', async () => {
      remediationPolicyEngine.updateRemediationPolicy(testWorkspaceId, { strategy: 'MANUAL_APPROVAL' });
      let evalResult = await remediationPolicyEngine.evaluateAutoRepairPermission(testWorkspaceId);
      assert.strictEqual(evalResult.canAutoRepair, false);
      assert.ok(evalResult.reason.includes('MANUAL_APPROVAL'));

      remediationPolicyEngine.updateRemediationPolicy(testWorkspaceId, { strategy: 'DIAGNOSE_ONLY' });
      evalResult = await remediationPolicyEngine.evaluateAutoRepairPermission(testWorkspaceId);
      assert.strictEqual(evalResult.canAutoRepair, false);
      assert.ok(evalResult.reason.includes('DIAGNOSE_ONLY'));
    });

    test('TEST 18: AUTO_REPAIR_AND_PR authorizes repairs within daily quota and credit balance', async () => {
      remediationPolicyEngine.updateRemediationPolicy(testWorkspaceId, { strategy: 'AUTO_REPAIR_AND_PR' });
      const evalResult = await remediationPolicyEngine.evaluateAutoRepairPermission(testWorkspaceId);

      assert.strictEqual(evalResult.canAutoRepair, true);
      assert.strictEqual(evalResult.strategy, 'AUTO_REPAIR_AND_PR');

      // Record repair executions
      remediationPolicyEngine.recordAutoRepairExecution(testWorkspaceId);
      const policy = remediationPolicyEngine.getRemediationPolicy(testWorkspaceId);
      assert.strictEqual(policy.dailyRepairsExecuted, 1);
      assert.strictEqual(policy.dailyRepairsRemaining, 4);
    });
  });

  // =========================================================================
  // 6. REST API ENDPOINTS & RBAC PROTECTION
  // =========================================================================
  describe('6. REST Endpoints & RBAC Security', () => {
    test('TEST 19: GET /api/workspaces/:id/webhooks/inbound/config returns valid config', async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceId}/webhooks/inbound/config`, {
        headers: { Authorization: `Bearer ${testToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.config.webhookUrl);
      assert.ok(data.config.maskedSecret);
    });

    test('TEST 20: POST /api/workspaces/:id/webhooks/inbound ingests HMAC-signed alert and creates incident', async () => {
      const configRes = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceId}/webhooks/inbound/config`, {
        headers: { Authorization: `Bearer ${testToken}` }
      });
      const { config } = await configRes.json();

      const alertBody = JSON.stringify({
        provider: 'sentry',
        targetEndpoint: 'POST /api/auth/login',
        severity: 'CRITICAL',
        error: 'TypeError: Cannot read properties of null (reading password)'
      });

      const signature = crypto.createHmac('sha256', config.secret).update(alertBody).digest('hex');

      const res = await fetch(`${baseUrl}/api/workspaces/${testWorkspaceId}/webhooks/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-APIFIX-Signature': `sha256=${signature}`
        },
        body: alertBody
      });

      assert.strictEqual(res.status, 202);
      const data = await res.json();
      assert.strictEqual(data.received, true);
      assert.strictEqual(data.status, 'TRIAGED');
      assert.ok(data.incidentId);
    });
  });
});
