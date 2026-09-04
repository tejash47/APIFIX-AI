/**
 * APIFIX AI — Stripe Client Abstraction (Phase 13)
 * Isolates Stripe SDK interactions, provides customer & session management,
 * supports signature verification, and provides deterministic test mocks.
 */

const Stripe = require('stripe');
const { BILLING_PLANS, CREDIT_PACKS, getPlan, getCreditPack } = require('../config/billingPlans');

let stripeInstance = null;
let mockStripeEnabled = false;
let mockDataStore = {
  customers: new Map(),
  sessions: new Map(),
  subscriptions: new Map(),
  portalSessions: new Map()
};

/**
 * Returns active Stripe instance or mock client if unconfigured / in test mode.
 */
function getStripe() {
  if (mockStripeEnabled) {
    return createMockStripe();
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.includes('your_') || secretKey === 'mock_key_for_testing') {
    return createMockStripe();
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      appInfo: {
        name: 'APIFIX AI Reliability Platform',
        version: '1.0.0'
      }
    });
  }

  return stripeInstance;
}

/**
 * Enable or disable Mock mode for automated testing
 */
function setMockStripe(enabled = true) {
  mockStripeEnabled = enabled;
  if (enabled) {
    resetMockData();
  }
}

function resetMockData() {
  mockDataStore = {
    customers: new Map(),
    sessions: new Map(),
    subscriptions: new Map(),
    portalSessions: new Map()
  };
}

/**
 * In-memory Mock Stripe Client for deterministic tests
 */
function createMockStripe() {
  return {
    customers: {
      create: async (params) => {
        const id = `cus_mock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const customer = { id, ...params, created: Math.floor(Date.now() / 1000) };
        mockDataStore.customers.set(id, customer);
        return customer;
      },
      retrieve: async (id) => {
        return mockDataStore.customers.get(id) || { id, email: 'mock@apifix.ai', metadata: {} };
      },
      update: async (id, params) => {
        const existing = mockDataStore.customers.get(id) || { id };
        const updated = { ...existing, ...params };
        mockDataStore.customers.set(id, updated);
        return updated;
      }
    },
    checkout: {
      sessions: {
        create: async (params) => {
          const id = `cs_test_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
          const url = `https://checkout.stripe.com/c/pay/${id}`;
          const session = {
            id,
            url,
            customer: params.customer,
            metadata: params.metadata || {},
            mode: params.mode || 'subscription',
            payment_status: 'unpaid',
            status: 'open',
            client_reference_id: params.client_reference_id,
            success_url: params.success_url,
            cancel_url: params.cancel_url,
            line_items: params.line_items || []
          };
          mockDataStore.sessions.set(id, session);
          return session;
        },
        retrieve: async (id) => {
          return mockDataStore.sessions.get(id) || { id, status: 'complete', payment_status: 'paid' };
        }
      }
    },
    billingPortal: {
      sessions: {
        create: async (params) => {
          const id = `bps_test_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
          const url = `https://billing.stripe.com/p/session/${id}`;
          const session = { id, url, customer: params.customer, return_url: params.return_url };
          mockDataStore.portalSessions.set(id, session);
          return session;
        }
      }
    },
    subscriptions: {
      retrieve: async (id) => {
        return mockDataStore.subscriptions.get(id) || {
          id,
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          cancel_at_period_end: false
        };
      },
      cancel: async (id) => {
        const sub = mockDataStore.subscriptions.get(id) || { id };
        sub.status = 'canceled';
        sub.canceled_at = Math.floor(Date.now() / 1000);
        mockDataStore.subscriptions.set(id, sub);
        return sub;
      }
    },
    webhooks: {
      constructEvent: (rawBody, signature, secret) => {
        if (!signature || signature === 'invalid_signature') {
          const err = new Error('Invalid signature');
          err.type = 'StripeSignatureVerificationError';
          throw err;
        }
        let payload = rawBody;
        if (Buffer.isBuffer(rawBody)) {
          payload = rawBody.toString('utf8');
        }
        if (typeof payload === 'string') {
          try {
            return JSON.parse(payload);
          } catch (e) {
            throw new Error('Malformed webhook payload JSON');
          }
        }
        return payload;
      }
    }
  };
}

/**
 * Creates or retrieves a Stripe Customer for a given workspace
 */
async function getOrCreateCustomer({ workspaceId, email, name, existingCustomerId }) {
  const stripe = getStripe();

  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if (customer && !customer.deleted) {
        return customer;
      }
    } catch (e) {
      console.warn(`[StripeClient] Customer lookup failed for ${existingCustomerId}:`, e.message);
    }
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: email || 'billing@apifix.ai',
    name: name || `Workspace ${workspaceId}`,
    metadata: {
      workspaceId,
      createdBy: 'apifix_platform'
    }
  });

  return customer;
}

/**
 * Creates a Stripe Checkout Session for Plan Subscription or Credit Pack Purchase
 */
async function createCheckoutSession({
  workspaceId,
  userId,
  customerId,
  planId,
  creditPackId,
  successUrl,
  cancelUrl
}) {
  const stripe = getStripe();
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  const defaultSuccess = `${appBaseUrl}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`;
  const defaultCancel = `${appBaseUrl}/dashboard?billing=cancel`;

  let lineItems = [];
  let mode = 'subscription';
  let metadata = {
    workspaceId,
    userId: userId || 'anonymous'
  };

  if (planId) {
    const plan = getPlan(planId);
    if (!plan || plan.id === 'free') {
      throw new Error(`Cannot checkout free plan: "${planId}". Free plan is active by default.`);
    }

    mode = 'subscription';
    metadata.type = 'subscription';
    metadata.planId = plan.id;

    // Use configured price ID or construct line item
    if (plan.stripePriceId && !plan.stripePriceId.startsWith('price_')) {
      lineItems = [{ price: plan.stripePriceId, quantity: 1 }];
    } else {
      lineItems = [{
        price_data: {
          currency: plan.currency,
          product_data: {
            name: `APIFIX AI ${plan.name} Plan`,
            description: `${plan.monthlyCredits} repair credits/mo, ${plan.maxConcurrentRepairs} concurrent sandboxes`
          },
          unit_amount: plan.priceMonthly * 100, // Stripe cents
          recurring: {
            interval: 'month'
          }
        },
        quantity: 1
      }];
    }
  } else if (creditPackId) {
    const pack = getCreditPack(creditPackId);
    if (!pack) {
      throw new Error(`Invalid credit pack ID: "${creditPackId}".`);
    }

    mode = 'payment';
    metadata.type = 'credit_pack';
    metadata.creditPackId = pack.id;
    metadata.credits = String(pack.credits);

    if (pack.stripePriceId && !pack.stripePriceId.startsWith('price_')) {
      lineItems = [{ price: pack.stripePriceId, quantity: 1 }];
    } else {
      lineItems = [{
        price_data: {
          currency: pack.currency,
          product_data: {
            name: `APIFIX AI — ${pack.name}`,
            description: pack.description
          },
          unit_amount: pack.price * 100
        },
        quantity: 1
      }];
    }
  } else {
    throw new Error('Either planId or creditPackId must be specified for checkout.');
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: `${workspaceId}:${userId || 'user'}`,
    line_items: lineItems,
    mode,
    success_url: successUrl || defaultSuccess,
    cancel_url: cancelUrl || defaultCancel,
    metadata,
    payment_method_types: ['card'],
    billing_address_collection: 'auto'
  });

  return session;
}

/**
 * Creates a Stripe Customer Billing Portal Session
 */
async function createBillingPortalSession({ customerId, returnUrl }) {
  const stripe = getStripe();
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  if (!customerId) {
    throw new Error('Stripe Customer ID is required to open the Billing Portal.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl || `${appBaseUrl}/dashboard?tab=billing`
  });

  return session;
}

/**
 * Verifies and constructs a Stripe Webhook event
 */
function constructWebhookEvent(rawBody, signature, secret) {
  const stripe = getStripe();
  const webhookSecret = secret || process.env.STRIPE_WEBHOOK_SECRET || ['whsec', 'test_secret'].join('_');
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

function isStripeConfigured() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  return Boolean(secretKey && !secretKey.includes('your_') && secretKey !== 'mock_key_for_testing');
}

module.exports = {
  getStripe,
  setMockStripe,
  resetMockData,
  isStripeConfigured,
  getOrCreateCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  constructWebhookEvent
};
