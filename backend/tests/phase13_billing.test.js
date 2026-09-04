const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const http = require('http');

const { app } = require('../src/server');
const workspaceService = require('../src/services/workspaceService');
const billingService = require('../src/services/billingService');
const { setMockStripe, getOrCreateCustomer } = require('../src/services/stripeClient');
const { enforceRepairUsage } = require('../src/services/usageEnforcer');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

let testServer = null;
let serverPort = 0;
let baseUrl = '';

function generateTestToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'developer' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function makeRequest(method, endpointPath, { body, token, workspaceId, headers = {} } = {}) {
  const url = `${baseUrl}${endpointPath}`;
  const reqHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
  if (workspaceId) reqHeaders['X-Workspace-Id'] = workspaceId;

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });

  const status = res.status;
  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return { status, data, headers: res.headers };
}

describe('Phase 13 — Stripe Billing, Subscriptions, Credits & Usage Enforcement Test Suite', () => {
  const userAlphaOwner = { id: 'usr_alpha_owner', email: 'alice@alpha-corp.io', name: 'Alice Alpha', role: 'developer' };
  const userAlphaMember = { id: 'usr_alpha_member', email: 'member@alpha-corp.io', name: 'Alpha Member', role: 'developer' };
  const userAlphaViewer = { id: 'usr_alpha_viewer', email: 'viewer@alpha-corp.io', name: 'Alpha Viewer', role: 'developer' };
  const userBetaOwner = { id: 'usr_beta_owner', email: 'bob@beta-industries.io', name: 'Bob Beta', role: 'developer' };
  const userAdmin = { id: 'usr_admin_sys', email: 'admin@apifix.ai', name: 'Sys Admin', role: 'admin' };

  let tokenAlphaOwner = '';
  let tokenAlphaMember = '';
  let tokenAlphaViewer = '';
  let tokenBetaOwner = '';
  let tokenAdmin = '';

  let workspaceAlpha = null;
  let workspaceBeta = null;

  before(async () => {
    setMockStripe(true);

    tokenAlphaOwner = generateTestToken(userAlphaOwner);
    tokenAlphaMember = generateTestToken(userAlphaMember);
    tokenAlphaViewer = generateTestToken(userAlphaViewer);
    tokenBetaOwner = generateTestToken(userBetaOwner);
    tokenAdmin = generateTestToken(userAdmin);

    // Spin up ephemeral test server
    await new Promise((resolve) => {
      testServer = http.createServer(app);
      testServer.listen(0, '127.0.0.1', () => {
        serverPort = testServer.address().port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // Create isolated test workspaces
    workspaceAlpha = await workspaceService.createWorkspace({
      name: 'Alpha Cloud Corp',
      ownerId: userAlphaOwner.id,
      ownerEmail: userAlphaOwner.email,
      ownerName: userAlphaOwner.name
    });

    await workspaceService.addMember(workspaceAlpha.id, {
      userId: userAlphaMember.id,
      userEmail: userAlphaMember.email,
      userName: userAlphaMember.name,
      role: 'MEMBER'
    }, userAlphaOwner);

    await workspaceService.addMember(workspaceAlpha.id, {
      userId: userAlphaViewer.id,
      userEmail: userAlphaViewer.email,
      userName: userAlphaViewer.name,
      role: 'VIEWER'
    }, userAlphaOwner);

    workspaceBeta = await workspaceService.createWorkspace({
      name: 'Beta Global Tech',
      ownerId: userBetaOwner.id,
      ownerEmail: userBetaOwner.email,
      ownerName: userBetaOwner.name
    });
  });

  after(async () => {
    if (testServer) {
      await new Promise((r) => testServer.close(r));
    }
  });

  // TEST 1: Customer Creation & Lookup
  test('TEST 1: Stripe customer creation and idempotent lookup per workspace', async () => {
    const customer = await getOrCreateCustomer({
      workspaceId: workspaceAlpha.id,
      email: userAlphaOwner.email,
      name: userAlphaOwner.name
    });

    assert.ok(customer.id);
    assert.match(customer.id, /^cus_/);
    assert.equal(customer.metadata.workspaceId, workspaceAlpha.id);

    // Lookup existing customer
    const lookedUp = await getOrCreateCustomer({
      workspaceId: workspaceAlpha.id,
      email: userAlphaOwner.email,
      existingCustomerId: customer.id
    });
    assert.equal(lookedUp.id, customer.id);
  });

  // TEST 2: Plans and Credit Catalog Retrieval
  test('TEST 2: Authenticated user can fetch billing plans and credit pack catalog', async () => {
    const res = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/billing/plans`, {
      token: tokenAlphaOwner
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.plans));
    assert.ok(Array.isArray(res.data.creditPacks));
    assert.ok(res.data.plans.some(p => p.id === 'free'));
    assert.ok(res.data.plans.some(p => p.id === 'pro'));
    assert.ok(res.data.plans.some(p => p.id === 'enterprise'));
    assert.ok(res.data.creditPacks.some(cp => cp.id === 'pack_small'));
  });

  // TEST 3: Checkout Session Creation for PRO Plan (ADMIN / OWNER)
  test('TEST 3: Workspace owner can create Stripe Checkout session for Pro subscription', async () => {
    const res = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/billing/checkout`, {
      token: tokenAlphaOwner,
      body: {
        planId: 'pro'
      }
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.sessionId);
    assert.ok(res.data.url);
    assert.match(res.data.url, /^https:\/\/checkout\.stripe\.com/);
  });

  // TEST 4: Checkout Session Creation for Credit Top-Up Pack
  test('TEST 4: Workspace owner can create Stripe Checkout session for Credit Pack', async () => {
    const res = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/billing/checkout`, {
      token: tokenAlphaOwner,
      body: {
        creditPackId: 'pack_medium'
      }
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.sessionId);
    assert.ok(res.data.url);
  });

  // TEST 5: Rejection of Forged / Non-Existent Plans & Price Manipulation
  test('TEST 5: Server strictly rejects forged plans or invalid credit packs', async () => {
    const res = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/billing/checkout`, {
      token: tokenAlphaOwner,
      body: {
        planId: 'hacked_free_pro_tier_9999'
      }
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, 'INVALID_PLAN');
  });

  // TEST 6: Customer Billing Portal Creation
  test('TEST 6: Workspace owner can generate Stripe Billing Portal session URL', async () => {
    const res = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/billing/portal`, {
      token: tokenAlphaOwner,
      body: {
        returnUrl: 'http://localhost:3000/dashboard'
      }
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.url);
    assert.match(res.data.url, /^https:\/\/billing\.stripe\.com/);
  });

  // TEST 7: Webhook Signature Verification (Valid vs Tampered / Missing)
  test('TEST 7: Webhook endpoint enforces cryptographic signature validation', async () => {
    // Valid signature test
    const validEvent = {
      id: `evt_test_${Date.now()}`,
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'pi_test_123' } }
    };

    const validRes = await makeRequest('POST', '/api/billing/webhook', {
      body: validEvent,
      headers: { 'stripe-signature': 'mock_valid_signature_xyz' }
    });
    assert.equal(validRes.status, 200);

    // Tampered / Invalid signature test
    const invalidRes = await makeRequest('POST', '/api/billing/webhook', {
      body: validEvent,
      headers: { 'stripe-signature': 'invalid_signature' }
    });
    assert.equal(invalidRes.status, 400);
  });

  // TEST 8: Webhook Idempotency (Duplicate Event Replay Protection)
  test('TEST 8: Duplicate webhook delivery is recognized and processed idempotently', async () => {
    const eventId = `evt_idempotency_${Date.now()}`;
    const webhookEvent = {
      id: eventId,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_${Date.now()}`,
          customer: 'cus_mock_alpha',
          metadata: {
            workspaceId: workspaceAlpha.id,
            type: 'credit_pack',
            credits: '25'
          }
        }
      }
    };

    // First delivery
    const res1 = await makeRequest('POST', '/api/billing/webhook', {
      body: webhookEvent,
      headers: { 'stripe-signature': 'valid_sig' }
    });
    assert.equal(res1.status, 200);

    // Second delivery (Replay)
    const res2 = await makeRequest('POST', '/api/billing/webhook', {
      body: webhookEvent,
      headers: { 'stripe-signature': 'valid_sig' }
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.data.status, 'already_processed');
  });

  // TEST 9: Webhook Subscription Activation (checkout.session.completed)
  test('TEST 9: checkout.session.completed webhook activates Pro plan and grants monthly credits', async () => {
    const initialBilling = await billingService.getWorkspaceBilling(workspaceAlpha.id);
    const initialCredits = initialBilling.credits;

    const activationEvent = {
      id: `evt_sub_active_${Date.now()}`,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_sub_${Date.now()}`,
          customer: 'cus_alpha_live',
          subscription: 'sub_alpha_live_pro',
          metadata: {
            workspaceId: workspaceAlpha.id,
            userId: userAlphaOwner.id,
            type: 'subscription',
            planId: 'pro'
          }
        }
      }
    };

    const res = await makeRequest('POST', '/api/billing/webhook', {
      body: activationEvent,
      headers: { 'stripe-signature': 'valid_sig' }
    });
    assert.equal(res.status, 200);

    const updatedBilling = await billingService.getWorkspaceBilling(workspaceAlpha.id);
    assert.equal(updatedBilling.plan, 'pro');
    assert.equal(updatedBilling.subscriptionStatus, 'active');
    assert.equal(updatedBilling.stripeSubscriptionId, 'sub_alpha_live_pro');
    assert.equal(updatedBilling.credits, initialCredits + 100);
  });

  // TEST 10: Webhook Subscription Cancellation (customer.subscription.deleted)
  test('TEST 10: customer.subscription.deleted downgrades workspace to Free tier', async () => {
    const cancelEvent = {
      id: `evt_sub_del_${Date.now()}`,
      type: 'customer.subscription.deleted',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_alpha_live_pro',
          customer: 'cus_alpha_live',
          status: 'canceled'
        }
      }
    };

    const res = await makeRequest('POST', '/api/billing/webhook', {
      body: cancelEvent,
      headers: { 'stripe-signature': 'valid_sig' }
    });
    assert.equal(res.status, 200);

    const updatedBilling = await billingService.getWorkspaceBilling(workspaceAlpha.id);
    assert.equal(updatedBilling.plan, 'free');
    assert.equal(updatedBilling.subscriptionStatus, 'canceled');
  });

  // TEST 11: Webhook Payment Failure Synchronization (invoice.payment_failed)
  test('TEST 11: invoice.payment_failed synchronizes past_due subscription status', async () => {
    // Reset to pro for test
    await billingService.updateWorkspaceBillingData(workspaceAlpha.id, {
      plan: 'pro',
      subscriptionStatus: 'active',
      stripeCustomerId: 'cus_alpha_past_due'
    });

    const failedInvoiceEvent = {
      id: `evt_inv_fail_${Date.now()}`,
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `inv_fail_${Date.now()}`,
          customer: 'cus_alpha_past_due',
          status: 'open',
          attempt_count: 2
        }
      }
    };

    const res = await makeRequest('POST', '/api/billing/webhook', {
      body: failedInvoiceEvent,
      headers: { 'stripe-signature': 'valid_sig' }
    });
    assert.equal(res.status, 200);

    const updated = await billingService.getWorkspaceBilling(workspaceAlpha.id);
    assert.equal(updated.subscriptionStatus, 'past_due');
  });

  // TEST 12: Credit Ledger Grant, Consumption, and Audit History
  test('TEST 12: Credit ledger accurately tracks grants, consumptions, and returns audit trail', async () => {
    // Reset workspace to active with 50 credits
    await billingService.updateWorkspaceBillingData(workspaceAlpha.id, {
      subscriptionStatus: 'active',
      credits: 50
    });

    // 1. Grant 20 credits
    const grantRes = await billingService.grantCredits(workspaceAlpha.id, 20, {
      reason: 'Manual Bonus Grant',
      userId: userAdmin.id,
      type: 'GRANT'
    });
    assert.equal(grantRes.balance, 70);

    // 2. Consume 5 credits
    const consumeRes = await billingService.consumeCredits(workspaceAlpha.id, 5, {
      reason: 'Test Batch Repairs',
      userId: userAlphaOwner.id,
      runId: 'run_test_batch'
    });
    assert.equal(consumeRes.balance, 65);

    // 3. Fetch Ledger API
    const ledgerRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/billing/ledger`, {
      token: tokenAlphaOwner
    });
    assert.equal(ledgerRes.status, 200);
    assert.ok(ledgerRes.data.items.length >= 2);
    assert.equal(ledgerRes.data.items[0].balanceAfter, 65);
    assert.equal(ledgerRes.data.items[0].type, 'CONSUMPTION');
  });

  // TEST 13: Negative Credit Prevention & INSUFFICIENT_CREDITS Error
  test('TEST 13: Cannot consume more credits than available (Negative balance prevention)', async () => {
    // Set credits to 2
    await billingService.updateWorkspaceBillingData(workspaceAlpha.id, { credits: 2 });

    await assert.rejects(
      async () => {
        await billingService.consumeCredits(workspaceAlpha.id, 10, {
          reason: 'Excessive Consumption',
          userId: userAlphaOwner.id
        });
      },
      (err) => {
        assert.equal(err.code, 'INSUFFICIENT_CREDITS');
        assert.equal(err.status, 402);
        return true;
      }
    );

    // Balance must remain unchanged
    const balance = await billingService.getCreditBalance(workspaceAlpha.id);
    assert.equal(balance, 2);
  });

  // TEST 14: Concurrent Credit Protection (Race-Condition Mutex Lock)
  test('TEST 14: Parallel rapid credit consumption requests are atomic without race conditions', async () => {
    await billingService.updateWorkspaceBillingData(workspaceAlpha.id, { credits: 15 });

    // Fire 10 parallel 1-credit consumption requests
    const promises = Array.from({ length: 10 }, (_, i) =>
      billingService.consumeCredits(workspaceAlpha.id, 1, {
        reason: `Concurrent Run ${i}`,
        userId: userAlphaOwner.id,
        runId: `run_conc_${i}`
      })
    );

    const results = await Promise.all(promises);
    assert.equal(results.length, 10);

    const finalBalance = await billingService.getCreditBalance(workspaceAlpha.id);
    assert.equal(finalBalance, 5); // 15 - 10 = 5
  });

  // TEST 15: Automatic Credit Refund on Failed Operation
  test('TEST 15: Failed or aborted operation safely executes credit refund', async () => {
    await billingService.updateWorkspaceBillingData(workspaceAlpha.id, { credits: 10 });

    const guard = await enforceRepairUsage({
      workspaceId: workspaceAlpha.id,
      userId: userAlphaOwner.id,
      runId: 'run_failed_probe',
      operationType: 'repair'
    });

    assert.equal(guard.creditConsumed, true);
    let balanceAfterDeduction = await billingService.getCreditBalance(workspaceAlpha.id);
    assert.equal(balanceAfterDeduction, 9);

    // Trigger refund
    await guard.refund('Endpoint probe failed immediately');

    const balanceAfterRefund = await billingService.getCreditBalance(workspaceAlpha.id);
    assert.equal(balanceAfterRefund, 10);
  });

  // TEST 16: Usage Gating & Concurrency Cap Enforcement
  test('TEST 16: enforceRepairUsage strictly enforces credit consumption, past_due status, and concurrency caps', async () => {
    await billingService.updateWorkspaceBillingData(workspaceAlpha.id, {
      credits: 20,
      plan: 'free',
      subscriptionStatus: 'active'
    });

    const guard = await enforceRepairUsage({
      workspaceId: workspaceAlpha.id,
      userId: userAlphaOwner.id,
      runId: 'run_enforce_test_1',
      operationType: 'repair'
    });

    assert.equal(guard.creditConsumed, true);
    let balance = await billingService.getCreditBalance(workspaceAlpha.id);
    assert.equal(balance, 19);

    // Concurrency limit rejection test
    const { registerActiveRun, unregisterActiveRun } = require('../src/services/runController');
    registerActiveRun('run_active_sim', 'demo-api', workspaceAlpha.id);

    await assert.rejects(
      async () => {
        await enforceRepairUsage({
          workspaceId: workspaceAlpha.id,
          userId: userAlphaOwner.id,
          runId: 'run_concurrent_overflow',
          operationType: 'repair'
        });
      },
      (err) => {
        assert.equal(err.code, 'CONCURRENCY_LIMIT_EXCEEDED');
        assert.equal(err.status, 429);
        return true;
      }
    );

    unregisterActiveRun('run_active_sim');
  });

  // TEST 17: RBAC Enforcement for Billing Actions
  test('TEST 17: MEMBER and VIEWER cannot initiate checkout or access customer billing portal', async () => {
    // Member checkout attempt
    const memberCheckout = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/billing/checkout`, {
      token: tokenAlphaMember,
      body: { planId: 'pro' }
    });
    assert.equal(memberCheckout.status, 403);
    assert.equal(memberCheckout.data.error.code, 'INSUFFICIENT_PERMISSIONS');

    // Viewer portal attempt
    const viewerPortal = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/billing/portal`, {
      token: tokenAlphaViewer,
      body: { returnUrl: 'http://localhost:3000' }
    });
    assert.equal(viewerPortal.status, 403);
    assert.equal(viewerPortal.data.error.code, 'INSUFFICIENT_PERMISSIONS');
  });

  // TEST 18: Multi-Tenant Billing Isolation
  test('TEST 18: Tenant in Workspace Beta cannot view or modify Workspace Alpha billing or ledger', async () => {
    // Cross-tenant billing view attempt
    const crossView = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/billing`, {
      token: tokenBetaOwner
    });
    assert.equal(crossView.status, 403);
    assert.equal(crossView.data.error.code, 'FORBIDDEN_WORKSPACE_ACCESS');

    // Cross-tenant ledger attempt
    const crossLedger = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/billing/ledger`, {
      token: tokenBetaOwner
    });
    assert.equal(crossLedger.status, 403);
    assert.equal(crossLedger.data.error.code, 'FORBIDDEN_WORKSPACE_ACCESS');
  });

  // TEST 19: Secret and Payment Information Leakage Prevention
  test('TEST 19: Stripe secret keys and raw payment credentials never appear in API responses', async () => {
    const res = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/billing`, {
      token: tokenAlphaOwner
    });

    assert.equal(res.status, 200);
    const jsonStr = JSON.stringify(res.data);
    assert.equal(jsonStr.includes('sk_test_'), false);
    assert.equal(jsonStr.includes('whsec_'), false);
    assert.equal(jsonStr.includes('STRIPE_SECRET_KEY'), false);
  });

  // TEST 20: Direct Credit Consumption Endpoint with RBAC
  test('TEST 20: POST /api/workspaces/:workspaceId/billing/credits/consume reduces credits for member', async () => {
    await billingService.updateWorkspaceBillingData(workspaceAlpha.id, { credits: 25 });

    const res = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/billing/credits/consume`, {
      token: tokenAlphaMember,
      body: {
        amount: 3,
        reason: 'Automated Test Suite Repair',
        runId: 'run_direct_consume'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.balance, 22);
  });
});
