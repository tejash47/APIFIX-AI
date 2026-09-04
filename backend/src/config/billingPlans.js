/**
 * APIFIX AI — Centralized Billing Plans & Credit Configurations (Phase 13)
 * Defines tiers, limits, pricing, feature flags, and credit packages.
 */

const BILLING_PLANS = {
  free: {
    id: 'free',
    name: 'Community Free',
    priceMonthly: 0,
    currency: 'usd',
    stripePriceId: null,
    initialCredits: 10,
    monthlyCredits: 10,
    maxConcurrentRepairs: 1,
    maxTeamMembers: 3,
    maxRepositories: 2,
    features: [
      '10 Initial Repair Credits',
      '1 Concurrent Sandbox Repair',
      'Standard AI Models (Groq / Llama 3.3)',
      'Basic Incident Discovery',
      'Automated Pull Requests',
      'Community Support'
    ],
    supportLevel: 'community',
    allowedAiProviders: ['groq']
  },
  pro: {
    id: 'pro',
    name: 'Professional',
    priceMonthly: 49,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_PRO || 'price_pro_monthly_49',
    initialCredits: 100,
    monthlyCredits: 100,
    maxConcurrentRepairs: 5,
    maxTeamMembers: 10,
    maxRepositories: 20,
    features: [
      '100 Monthly Repair Credits',
      '5 Concurrent Sandbox Repairs',
      'All AI Models (Claude 3.5 Sonnet, GPT-4o, Groq)',
      'Deep AST Multi-Hypothesis Engine',
      'Automated GitHub PRs & Verified ZIPs',
      'Unlimited Historical Incidents',
      'Priority Email & Slack Support'
    ],
    supportLevel: 'priority',
    allowedAiProviders: ['groq', 'anthropic', 'openai']
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Scale',
    priceMonthly: 199,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise_monthly_199',
    initialCredits: 500,
    monthlyCredits: 500,
    maxConcurrentRepairs: 10,
    maxTeamMembers: 50,
    maxRepositories: 100,
    features: [
      '500 Monthly Repair Credits',
      '10 Concurrent Sandbox Repairs',
      'Custom LLM Fine-Tuning & Self-Hosted Models',
      'Advanced RBAC & Custom Audit Trails',
      'Dedicated Sandbox Runners',
      '99.9% SLA & Dedicated Account Engineer'
    ],
    supportLevel: 'dedicated',
    allowedAiProviders: ['groq', 'anthropic', 'openai']
  }
};

const CREDIT_PACKS = {
  pack_small: {
    id: 'pack_small',
    name: '25 Repair Credits',
    credits: 25,
    price: 10,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_PACK_SMALL || 'price_pack_small_10',
    description: 'Pay-as-you-go top up for small teams'
  },
  pack_medium: {
    id: 'pack_medium',
    name: '100 Repair Credits',
    credits: 100,
    price: 35,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_PACK_MEDIUM || 'price_pack_medium_35',
    description: 'Most popular top-up package ($0.35/repair)'
  },
  pack_large: {
    id: 'pack_large',
    name: '300 Repair Credits',
    credits: 300,
    price: 90,
    currency: 'usd',
    stripePriceId: process.env.STRIPE_PRICE_PACK_LARGE || 'price_pack_large_90',
    description: 'High volume top-up package ($0.30/repair)'
  }
};

/**
 * Validates whether a given plan ID is a known active plan tier.
 */
function isValidPlan(planId) {
  return typeof planId === 'string' && Object.prototype.hasOwnProperty.call(BILLING_PLANS, planId.toLowerCase());
}

/**
 * Returns plan details or defaults to FREE tier.
 */
function getPlan(planId) {
  if (!planId) return BILLING_PLANS.free;
  const key = planId.toLowerCase();
  return BILLING_PLANS[key] || BILLING_PLANS.free;
}

/**
 * Validates whether a given credit pack ID is known.
 */
function isValidCreditPack(packId) {
  return typeof packId === 'string' && Object.prototype.hasOwnProperty.call(CREDIT_PACKS, packId);
}

/**
 * Returns credit pack details.
 */
function getCreditPack(packId) {
  return CREDIT_PACKS[packId] || null;
}

module.exports = {
  BILLING_PLANS,
  CREDIT_PACKS,
  isValidPlan,
  getPlan,
  isValidCreditPack,
  getCreditPack
};
