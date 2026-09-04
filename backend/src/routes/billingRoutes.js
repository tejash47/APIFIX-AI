/**
 * APIFIX AI — Stripe Billing & Subscriptions Routes (Phase 13)
 * Endpoints for workspace billing status, plans catalog, checkout sessions,
 * billing portal, credit ledger history, and secure webhook processing.
 */

const express = require('express');
const { authenticate, requireWorkspaceAccess } = require('../middleware/authMiddleware');
const billingService = require('../services/billingService');
const { BILLING_PLANS, CREDIT_PACKS, isValidPlan, isValidCreditPack } = require('../config/billingPlans');
const { constructWebhookEvent } = require('../services/stripeClient');
const logger = require('../services/logger');

const router = express.Router({ mergeParams: true });

// =========================================================================
// PUBLIC STRIPE WEBHOOK ENDPOINT
// =========================================================================

/**
 * POST /api/billing/webhook
 * Secure Stripe Webhook Intake with cryptographic signature verification & idempotency
 */
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig && process.env.NODE_ENV === 'production') {
    logger.warn('stripe_webhook_rejected_no_signature');
    return res.status(400).json({ error: 'Stripe signature header is required.' });
  }

  let event = null;
  try {
    const rawPayload = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    event = constructWebhookEvent(rawPayload, sig, webhookSecret);
  } catch (err) {
    logger.warn('stripe_webhook_signature_verification_failed', { error: err.message });
    return res.status(400).json({
      error: 'Stripe webhook signature verification failed.',
      message: err.message
    });
  }

  try {
    logger.info('stripe_webhook_received', {
      eventId: event.id,
      eventType: event.type
    });

    const result = await billingService.processWebhookEvent(event);

    return res.status(200).json({
      received: true,
      eventId: event.id,
      status: result.status
    });
  } catch (err) {
    logger.error('stripe_webhook_processing_error', {
      eventId: event?.id,
      eventType: event?.type,
      error: err.message
    });
    return res.status(500).json({
      error: 'Failed to process webhook event.',
      message: err.message
    });
  }
});

// =========================================================================
// WORKSPACE BILLING ENDPOINTS (Authenticated + Workspace RBAC)
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/billing
 * Get current plan, credits, and subscription status
 */
router.get('/', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const billing = await billingService.getWorkspaceBilling(req.workspace.id);
    if (!billing) {
      return res.status(404).json({
        error: {
          code: 'BILLING_NOT_FOUND',
          message: 'Billing details for this workspace could not be found.',
          requestId: req.id
        }
      });
    }

    return res.json({ billing });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'BILLING_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/billing/plans
 * List available plans and credit packs
 */
router.get('/plans', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    return res.json({
      plans: Object.values(BILLING_PLANS),
      creditPacks: Object.values(CREDIT_PACKS)
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'PLANS_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/billing/ledger
 * Get paginated credit transactions for workspace
 */
router.get('/ledger', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const { page, limit } = req.query;
    const ledger = await billingService.getCreditLedger(req.workspace.id, { page, limit });
    return res.json(ledger);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'LEDGER_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/billing/checkout
 * Create Stripe Checkout Session (ADMIN or OWNER only)
 */
router.post('/checkout', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  try {
    const { planId, creditPackId, successUrl, cancelUrl } = req.body || {};

    if (planId && !isValidPlan(planId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PLAN',
          message: `Invalid plan identifier "${planId}". Valid plans: ${Object.keys(BILLING_PLANS).join(', ')}`,
          requestId: req.id
        }
      });
    }

    if (creditPackId && !isValidCreditPack(creditPackId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CREDIT_PACK',
          message: `Invalid credit pack identifier "${creditPackId}". Valid packs: ${Object.keys(CREDIT_PACKS).join(', ')}`,
          requestId: req.id
        }
      });
    }

    if (!planId && !creditPackId) {
      return res.status(400).json({
        error: {
          code: 'MISSING_CHECKOUT_ITEM',
          message: 'Either planId or creditPackId must be specified.',
          requestId: req.id
        }
      });
    }

    const session = await billingService.createWorkspaceCheckoutSession(
      req.workspace.id,
      { planId, creditPackId, successUrl, cancelUrl },
      req.user
    );

    return res.status(200).json({
      sessionId: session.sessionId,
      url: session.url
    });
  } catch (err) {
    console.error('[BillingRoutes] Checkout error:', err);
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'CHECKOUT_CREATION_FAILED',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/billing/portal
 * Create Stripe Customer Billing Portal session (ADMIN or OWNER only)
 */
router.post('/portal', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  try {
    const { returnUrl } = req.body || {};

    const session = await billingService.createWorkspacePortalSession(
      req.workspace.id,
      { returnUrl },
      req.user
    );

    return res.status(200).json({
      url: session.url
    });
  } catch (err) {
    console.error('[BillingRoutes] Portal error:', err);
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'PORTAL_CREATION_FAILED',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/billing/credits/consume
 * Internal / Direct credit deduction endpoint (MEMBER, ADMIN, OWNER)
 */
router.post('/credits/consume', authenticate, requireWorkspaceAccess('MEMBER'), async (req, res) => {
  try {
    const { amount = 1, reason, runId } = req.body || {};
    const numAmount = parseInt(amount, 10);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Credit amount must be a positive integer.',
          requestId: req.id
        }
      });
    }

    const result = await billingService.consumeCredits(req.workspace.id, numAmount, {
      reason: reason || 'Manual credit consumption',
      userId: req.user.id,
      runId
    });

    return res.json(result);
  } catch (err) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code || 'CREDIT_CONSUMPTION_FAILED',
        message: err.message,
        details: err.details,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
