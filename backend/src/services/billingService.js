/**
 * APIFIX AI — Billing & Credit Service (Phase 13)
 * Manages Stripe subscriptions, atomic credit transactions, webhook lifecycle,
 * and immutable credit audit ledgers with full tenant isolation.
 */

const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const { BILLING_PLANS, CREDIT_PACKS, getPlan, getCreditPack, isValidPlan } = require('../config/billingPlans');
const { recordAuditEvent } = require('./auditLogger');
const {
  getOrCreateCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  constructWebhookEvent
} = require('./stripeClient');

const DATA_DIR = path.resolve(__dirname, '../../data');
const WORKSPACES_FILE = path.join(DATA_DIR, 'workspaces.json');
const CREDIT_LEDGER_FILE = path.join(DATA_DIR, 'credit_ledger.json');
const BILLING_EVENTS_FILE = path.join(DATA_DIR, 'billing_events.json');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

// In-memory mutex map for atomic credit operations
const creditLocks = new Map();

async function acquireCreditLock(workspaceId) {
  while (creditLocks.get(workspaceId)) {
    await new Promise(r => setTimeout(r, 10));
  }
  creditLocks.set(workspaceId, true);
}

function releaseCreditLock(workspaceId) {
  creditLocks.delete(workspaceId);
}

// JSON helpers
function readJson(file, def = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`[BillingService] Read error for ${file}:`, e.message);
  }
  return def;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[BillingService] Write error for ${file}:`, e.message);
  }
}

// ==========================================
// WORKSPACE BILLING DATA ACCESS
// ==========================================

/**
 * Get billing details for a workspace
 */
async function getWorkspaceBilling(workspaceId) {
  if (!workspaceId) return null;

  let workspace = null;

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();

      if (!error && data) {
        workspace = {
          id: data.id,
          name: data.name,
          ownerId: data.owner_id,
          plan: data.plan || 'free',
          subscriptionStatus: data.subscription_status || 'active',
          credits: data.credits !== undefined && data.credits !== null ? Number(data.credits) : 10,
          stripeCustomerId: data.stripe_customer_id || null,
          stripeSubscriptionId: data.stripe_subscription_id || null,
          currentPeriodStart: data.current_period_start || null,
          currentPeriodEnd: data.current_period_end || null,
          cancelAtPeriodEnd: !!data.cancel_at_period_end
        };
      }
    } catch (e) {}
  }

  if (!workspace) {
    const workspaces = readJson(WORKSPACES_FILE, []);
    workspace = workspaces.find(w => w.id === workspaceId);
  }

  if (!workspace) return null;

  const planId = workspace.plan || 'free';
  const planDetails = getPlan(planId);

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    plan: planId,
    planName: planDetails.name,
    subscriptionStatus: workspace.subscriptionStatus || 'active',
    credits: workspace.credits !== undefined && workspace.credits !== null ? Number(workspace.credits) : 10,
    stripeCustomerId: workspace.stripeCustomerId || null,
    stripeSubscriptionId: workspace.stripeSubscriptionId || null,
    currentPeriodStart: workspace.currentPeriodStart || null,
    currentPeriodEnd: workspace.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!workspace.cancelAtPeriodEnd,
    planDetails,
    features: planDetails.features,
    maxConcurrentRepairs: planDetails.maxConcurrentRepairs
  };
}

/**
 * Update billing attributes on a workspace
 */
async function updateWorkspaceBillingData(workspaceId, updates = {}) {
  const now = new Date().toISOString();
  const workspaces = readJson(WORKSPACES_FILE, []);
  const idx = workspaces.findIndex(w => w.id === workspaceId);

  if (idx !== -1) {
    workspaces[idx] = {
      ...workspaces[idx],
      ...updates,
      updatedAt: now
    };
    writeJson(WORKSPACES_FILE, workspaces);
  }

  if (isSupabaseConfigured()) {
    try {
      const dbUpdates = { updated_at: now };
      if (updates.plan !== undefined) dbUpdates.plan = updates.plan;
      if (updates.subscriptionStatus !== undefined) dbUpdates.subscription_status = updates.subscriptionStatus;
      if (updates.credits !== undefined) dbUpdates.credits = updates.credits;
      if (updates.stripeCustomerId !== undefined) dbUpdates.stripe_customer_id = updates.stripeCustomerId;
      if (updates.stripeSubscriptionId !== undefined) dbUpdates.stripe_subscription_id = updates.stripeSubscriptionId;
      if (updates.currentPeriodStart !== undefined) dbUpdates.current_period_start = updates.currentPeriodStart;
      if (updates.currentPeriodEnd !== undefined) dbUpdates.current_period_end = updates.currentPeriodEnd;
      if (updates.cancelAtPeriodEnd !== undefined) dbUpdates.cancel_at_period_end = updates.cancelAtPeriodEnd;

      await supabase
        .from('workspaces')
        .update(dbUpdates)
        .eq('id', workspaceId);
    } catch (e) {
      console.warn('[BillingService] Supabase update billing error:', e.message);
    }
  }

  return getWorkspaceBilling(workspaceId);
}

// ==========================================
// CREDIT LEDGER OPERATIONS
// ==========================================

/**
 * Get current credit balance for workspace
 */
async function getCreditBalance(workspaceId) {
  const billing = await getWorkspaceBilling(workspaceId);
  if (!billing) return 0;
  return billing.credits;
}

/**
 * Grant credits to a workspace (Atomically records transaction)
 */
async function grantCredits(workspaceId, amount, { reason = 'Credit Grant', userId = 'system', type = 'GRANT', idempotencyKey = null } = {}) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Credit grant amount must be a positive integer.');
  }

  await acquireCreditLock(workspaceId);
  try {
    // Check idempotency
    if (idempotencyKey) {
      const ledger = readJson(CREDIT_LEDGER_FILE, []);
      const existing = ledger.find(tx => tx.workspaceId === workspaceId && tx.idempotencyKey === idempotencyKey);
      if (existing) {
        return { balance: await getCreditBalance(workspaceId), transaction: existing, duplicate: true };
      }
    }

    const currentBalance = await getCreditBalance(workspaceId);
    const newBalance = currentBalance + amount;

    const tx = {
      id: `crd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId,
      userId,
      amount,
      balanceAfter: newBalance,
      type,
      reason,
      idempotencyKey,
      createdAt: new Date().toISOString()
    };

    // Save to local ledger
    const ledger = readJson(CREDIT_LEDGER_FILE, []);
    ledger.unshift(tx);
    writeJson(CREDIT_LEDGER_FILE, ledger);

    // Update workspace credit balance
    await updateWorkspaceBillingData(workspaceId, { credits: newBalance });

    // Save to Supabase
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('credit_ledger').insert({
          id: tx.id,
          workspace_id: tx.workspaceId,
          user_id: tx.userId,
          amount: tx.amount,
          balance_after: tx.balanceAfter,
          type: tx.type,
          reason: tx.reason,
          idempotency_key: tx.idempotencyKey,
          created_at: tx.createdAt
        });
      } catch (e) {
        console.warn('[BillingService] Supabase credit ledger insert warning:', e.message);
      }
    }

    await recordAuditEvent({
      workspaceId,
      actorId: userId,
      action: 'CREDITS_GRANTED',
      resourceType: 'BILLING',
      resourceId: tx.id,
      metadata: { amount, newBalance, reason, type }
    });

    return { balance: newBalance, transaction: tx };
  } finally {
    releaseCreditLock(workspaceId);
  }
}

/**
 * Consume credits from workspace (Enforces atomic balance check, prevents negative balances)
 */
async function consumeCredits(workspaceId, amount = 1, { reason = 'AI Repair Run', userId = 'system', runId = null } = {}) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Credit consumption amount must be a positive integer.');
  }

  await acquireCreditLock(workspaceId);
  try {
    const currentBalance = await getCreditBalance(workspaceId);

    if (currentBalance < amount) {
      const err = new Error(`Insufficient credits. Required: ${amount}, Available: ${currentBalance}.`);
      err.code = 'INSUFFICIENT_CREDITS';
      err.status = 402;
      err.details = { required: amount, available: currentBalance };
      throw err;
    }

    const newBalance = currentBalance - amount;

    const tx = {
      id: `crd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId,
      userId,
      amount: -amount,
      balanceAfter: newBalance,
      type: 'CONSUMPTION',
      reason,
      runId,
      createdAt: new Date().toISOString()
    };

    // Save to local ledger
    const ledger = readJson(CREDIT_LEDGER_FILE, []);
    ledger.unshift(tx);
    writeJson(CREDIT_LEDGER_FILE, ledger);

    // Update workspace credit balance
    await updateWorkspaceBillingData(workspaceId, { credits: newBalance });

    // Save to Supabase
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('credit_ledger').insert({
          id: tx.id,
          workspace_id: tx.workspaceId,
          user_id: tx.userId,
          amount: tx.amount,
          balance_after: tx.balanceAfter,
          type: tx.type,
          reason: tx.reason,
          run_id: tx.runId,
          created_at: tx.createdAt
        });
      } catch (e) {
        console.warn('[BillingService] Supabase credit consumption insert warning:', e.message);
      }
    }

    await recordAuditEvent({
      workspaceId,
      actorId: userId,
      action: 'CREDITS_CONSUMED',
      resourceType: 'BILLING',
      resourceId: tx.id,
      metadata: { amount, newBalance, reason, runId }
    });

    return { balance: newBalance, transaction: tx };
  } finally {
    releaseCreditLock(workspaceId);
  }
}

/**
 * Refund credits if a repair operation fails before analysis/execution
 */
async function refundCredits(workspaceId, amount = 1, { reason = 'Repair Run Aborted/Failed', userId = 'system', runId = null } = {}) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Credit refund amount must be a positive integer.');
  }

  await acquireCreditLock(workspaceId);
  try {
    const currentBalance = await getCreditBalance(workspaceId);
    const newBalance = currentBalance + amount;

    const tx = {
      id: `crd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      workspaceId,
      userId,
      amount,
      balanceAfter: newBalance,
      type: 'REFUND',
      reason,
      runId,
      createdAt: new Date().toISOString()
    };

    const ledger = readJson(CREDIT_LEDGER_FILE, []);
    ledger.unshift(tx);
    writeJson(CREDIT_LEDGER_FILE, ledger);

    await updateWorkspaceBillingData(workspaceId, { credits: newBalance });

    if (isSupabaseConfigured()) {
      try {
        await supabase.from('credit_ledger').insert({
          id: tx.id,
          workspace_id: tx.workspaceId,
          user_id: tx.userId,
          amount: tx.amount,
          balance_after: tx.balanceAfter,
          type: tx.type,
          reason: tx.reason,
          run_id: tx.runId,
          created_at: tx.createdAt
        });
      } catch (e) {}
    }

    await recordAuditEvent({
      workspaceId,
      actorId: userId,
      action: 'CREDITS_REFUNDED',
      resourceType: 'BILLING',
      resourceId: tx.id,
      metadata: { amount, newBalance, reason, runId }
    });

    return { balance: newBalance, transaction: tx };
  } finally {
    releaseCreditLock(workspaceId);
  }
}

/**
 * Fetch paginated credit transactions for workspace (Tenant Isolated)
 */
async function getCreditLedger(workspaceId, { limit = 20, page = 1 } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  if (isSupabaseConfigured()) {
    try {
      const { data, count, error } = await supabase
        .from('credit_ledger')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .range(offset, offset + safeLimit - 1);

      if (!error && data) {
        return {
          items: data.map(d => ({
            id: d.id,
            workspaceId: d.workspace_id,
            userId: d.user_id,
            amount: d.amount,
            balanceAfter: d.balance_after,
            type: d.type,
            reason: d.reason,
            runId: d.run_id,
            createdAt: d.created_at
          })),
          total: count || 0,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil((count || 0) / safeLimit) || 1
        };
      }
    } catch (e) {}
  }

  const ledger = readJson(CREDIT_LEDGER_FILE, []);
  const filtered = ledger.filter(tx => tx.workspaceId === workspaceId);
  const total = filtered.length;
  const items = filtered.slice(offset, offset + safeLimit);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1
  };
}

// ==========================================
// STRIPE SESSIONS & CHECKOUT
// ==========================================

/**
 * Create Stripe Checkout Session for workspace
 */
async function createWorkspaceCheckoutSession(workspaceId, { planId, creditPackId, successUrl, cancelUrl }, user = {}) {
  const billing = await getWorkspaceBilling(workspaceId);
  if (!billing) throw new Error('Workspace not found.');

  // Check or create customer
  let customerId = billing.stripeCustomerId;
  if (!customerId) {
    const customer = await getOrCreateCustomer({
      workspaceId,
      email: user.email,
      name: user.name || billing.workspaceName
    });
    customerId = customer.id;
    await updateWorkspaceBillingData(workspaceId, { stripeCustomerId: customerId });
  }

  const session = await createCheckoutSession({
    workspaceId,
    userId: user.id,
    customerId,
    planId,
    creditPackId,
    successUrl,
    cancelUrl
  });

  return {
    sessionId: session.id,
    url: session.url
  };
}

/**
 * Create Stripe Customer Billing Portal Session
 */
async function createWorkspacePortalSession(workspaceId, { returnUrl }, user = {}) {
  const billing = await getWorkspaceBilling(workspaceId);
  if (!billing) throw new Error('Workspace not found.');

  let customerId = billing.stripeCustomerId;
  if (!customerId) {
    const customer = await getOrCreateCustomer({
      workspaceId,
      email: user.email,
      name: user.name || billing.workspaceName
    });
    customerId = customer.id;
    await updateWorkspaceBillingData(workspaceId, { stripeCustomerId: customerId });
  }

  const session = await createBillingPortalSession({
    customerId,
    returnUrl
  });

  return {
    url: session.url
  };
}

// ==========================================
// WEBHOOK PROCESSING & IDEMPOTENCY
// ==========================================

/**
 * Check if webhook event was already processed
 */
async function isEventProcessed(eventId) {
  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase
        .from('billing_events')
        .select('event_id')
        .eq('event_id', eventId)
        .maybeSingle();
      if (data) return true;
    } catch (e) {}
  }

  const events = readJson(BILLING_EVENTS_FILE, []);
  return events.some(e => e.eventId === eventId);
}

/**
 * Record processed webhook event
 */
async function recordEventProcessed(event, workspaceId = null) {
  const now = new Date().toISOString();
  const record = {
    eventId: event.id,
    eventType: event.type,
    workspaceId,
    processedAt: now,
    status: 'PROCESSED',
    payloadSummary: {
      id: event.id,
      type: event.type,
      created: event.created
    }
  };

  const events = readJson(BILLING_EVENTS_FILE, []);
  events.unshift(record);
  writeJson(BILLING_EVENTS_FILE, events);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('billing_events').insert({
        event_id: record.eventId,
        event_type: record.eventType,
        workspace_id: record.workspaceId,
        processed_at: record.processedAt,
        status: record.status,
        payload_summary: record.payloadSummary
      });
    } catch (e) {}
  }
}

/**
 * Lookup workspace by Stripe Customer ID
 */
async function findWorkspaceByStripeCustomer(customerId) {
  if (!customerId) return null;

  if (isSupabaseConfigured()) {
    try {
      const { data } = await supabase
        .from('workspaces')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      if (data) return data.id;
    } catch (e) {}
  }

  const workspaces = readJson(WORKSPACES_FILE, []);
  const found = workspaces.find(w => w.stripeCustomerId === customerId);
  return found ? found.id : null;
}

/**
 * Process a verified Stripe Webhook event
 */
async function processWebhookEvent(event) {
  if (!event || !event.id) {
    throw new Error('Invalid webhook event payload.');
  }

  // Idempotency check
  if (await isEventProcessed(event.id)) {
    return { status: 'already_processed', eventId: event.id };
  }

  let workspaceId = null;
  const eventObject = event.data?.object || {};

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = eventObject;
      const metadata = session.metadata || {};
      workspaceId = metadata.workspaceId || (await findWorkspaceByStripeCustomer(session.customer));

      if (workspaceId) {
        if (metadata.type === 'subscription' && metadata.planId) {
          const plan = getPlan(metadata.planId);
          await updateWorkspaceBillingData(workspaceId, {
            plan: plan.id,
            subscriptionStatus: 'active',
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription
          });

          // Grant initial monthly credits for plan
          await grantCredits(workspaceId, plan.monthlyCredits, {
            reason: `Subscription Activated: ${plan.name}`,
            userId: metadata.userId || 'stripe_webhook',
            type: 'SUBSCRIPTION_RENEWAL',
            idempotencyKey: `sub_init_${session.id}`
          });
        } else if (metadata.type === 'credit_pack' && metadata.credits) {
          const creditsToGrant = parseInt(metadata.credits, 10);
          if (creditsToGrant > 0) {
            await grantCredits(workspaceId, creditsToGrant, {
              reason: `Credit Pack Purchase (${metadata.creditPackId || 'One-Time'})`,
              userId: metadata.userId || 'stripe_webhook',
              type: 'PURCHASE',
              idempotencyKey: `pack_${session.id}`
            });
          }
        }
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = eventObject;
      workspaceId = (await findWorkspaceByStripeCustomer(sub.customer));

      if (workspaceId) {
        const status = sub.status || 'active';
        const updates = {
          subscriptionStatus: status,
          stripeSubscriptionId: sub.id,
          currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end
        };

        // Determine plan from subscription item if possible
        const priceId = sub.items?.data?.[0]?.price?.id;
        if (priceId) {
          if (priceId === BILLING_PLANS.enterprise.stripePriceId) {
            updates.plan = 'enterprise';
          } else if (priceId === BILLING_PLANS.pro.stripePriceId) {
            updates.plan = 'pro';
          }
        }

        await updateWorkspaceBillingData(workspaceId, updates);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = eventObject;
      workspaceId = (await findWorkspaceByStripeCustomer(sub.customer));

      if (workspaceId) {
        await updateWorkspaceBillingData(workspaceId, {
          plan: 'free',
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null
        });
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = eventObject;
      workspaceId = (await findWorkspaceByStripeCustomer(invoice.customer));

      if (workspaceId && invoice.billing_reason === 'subscription_cycle') {
        const billing = await getWorkspaceBilling(workspaceId);
        if (billing && billing.plan !== 'free') {
          const plan = getPlan(billing.plan);
          // Refill monthly credits on billing cycle renewal
          await grantCredits(workspaceId, plan.monthlyCredits, {
            reason: `Monthly Credit Renewal (${plan.name})`,
            userId: 'stripe_renewal',
            type: 'RENEWAL',
            idempotencyKey: `inv_${invoice.id}`
          });
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = eventObject;
      workspaceId = (await findWorkspaceByStripeCustomer(invoice.customer));

      if (workspaceId) {
        await updateWorkspaceBillingData(workspaceId, {
          subscriptionStatus: 'past_due'
        });
      }
      break;
    }

    default:
      // Other unhandled events
      break;
  }

  await recordEventProcessed(event, workspaceId);

  return {
    status: 'success',
    eventId: event.id,
    eventType: event.type,
    workspaceId
  };
}

module.exports = {
  BILLING_PLANS,
  CREDIT_PACKS,
  getWorkspaceBilling,
  updateWorkspaceBillingData,
  getCreditBalance,
  grantCredits,
  consumeCredits,
  refundCredits,
  getCreditLedger,
  createWorkspaceCheckoutSession,
  createWorkspacePortalSession,
  processWebhookEvent,
  isEventProcessed
};
