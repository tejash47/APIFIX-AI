/**
 * APIFIX V2 — Centralized Environment Configuration & Validator
 * Validates required & optional variables across deployment modes.
 * Enforces zero-secret exposure and safe credential masking.
 */

function maskSecret(val) {
  if (!val || typeof val !== 'string') return '[NOT_SET]';
  if (val.length <= 8) return '****';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

/**
 * Returns strictly CONFIGURED, MISSING, or INVALID without printing secret characters.
 */
function getSecretStatus(val, minLength = 1) {
  if (!val || typeof val !== 'string' || !val.trim()) return 'MISSING';
  if (val.includes('your_') || val.includes('placeholder') || val.length < minLength) return 'INVALID';
  return 'CONFIGURED';
}

/**
 * Validates the runtime environment variables.
 * @param {object} env - Process environment variables (defaults to process.env)
 * @returns {object} Clean sanitized environment summary
 */
function validateEnvironment(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const isDemoMode = env.APIFIX_DEMO_MODE === 'true';

  const errors = [];
  const warnings = [];

  // 1. Port
  const port = parseInt(env.PORT || '4000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('PORT must be a valid number between 1 and 65535.');
  }

  // 2. AI Provider Keys
  const hasGroq = !!(env.GROQ_API_KEY && env.GROQ_API_KEY.trim() && !env.GROQ_API_KEY.includes('your_'));
  const hasAnthropic = !!(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim() && !env.ANTHROPIC_API_KEY.includes('your_'));
  const hasOpenAi = !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim() && !env.OPENAI_API_KEY.includes('your_'));
  const hasAnyAiProvider = hasGroq || hasAnthropic || hasOpenAi;

  if (!hasAnyAiProvider && !isDemoMode) {
    if (isProduction) {
      errors.push('CRITICAL: No valid AI provider API key found (GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY required in production).');
    } else {
      warnings.push('No AI provider key configured. AI requests will fail unless APIFIX_DEMO_MODE=true is set.');
    }
  }

  // 3. GitHub Token (Optional for public repos, recommended for PRs)
  const hasGithubToken = !!(env.GITHUB_TOKEN && env.GITHUB_TOKEN.trim() && !env.GITHUB_TOKEN.includes('your_'));
  if (!hasGithubToken) {
    warnings.push('GITHUB_TOKEN not configured. Unauthenticated GitHub API requests will be subject to strict rate limits (60 req/hr).');
  }

  // 4. Supabase / Database (Optional with in-memory fallback)
  const hasSupabaseUrl = !!(env.SUPABASE_URL && env.SUPABASE_URL.trim() && !env.SUPABASE_URL.includes('your_'));
  const hasSupabaseKey = !!(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.trim() && !env.SUPABASE_SERVICE_ROLE_KEY.includes('your_'));
  const supabaseConfigured = hasSupabaseUrl && hasSupabaseKey;

  if (isProduction && !supabaseConfigured) {
    warnings.push('Supabase credentials not configured in production. Application will run in memory-fallback mode (ephemeral persistence).');
  }

  // 5. Stripe Configuration (Optional for dev/mock mode, recommended for live billing)
  const hasStripeKey = !!(env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.trim() && !env.STRIPE_SECRET_KEY.includes('your_'));
  const hasStripeWebhookSecret = !!(env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.trim() && !env.STRIPE_WEBHOOK_SECRET.includes('your_'));
  const hasStripePublishableKey = !!(env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_PUBLISHABLE_KEY.trim() && !env.STRIPE_PUBLISHABLE_KEY.includes('your_'));
  const stripeConfigured = hasStripeKey;

  if (isProduction && !stripeConfigured) {
    warnings.push('STRIPE_SECRET_KEY not configured in production. Billing will run in simulated test mode.');
  }

  // 6. JWT Secret
  const jwtSecret = env.JWT_SECRET || '';
  if (isProduction && (!jwtSecret || jwtSecret.length < 16 || jwtSecret.includes('your_'))) {
    errors.push('JWT_SECRET must be at least 16 characters long in production mode.');
  }

  // 7. Timeouts & URLs
  const appBaseUrl = env.APP_BASE_URL || 'http://localhost:3000';
  const aiTimeoutMs = parseInt(env.AI_REQUEST_TIMEOUT_MS || '60000', 10);
  const approvalTimeoutMs = parseInt(env.APPROVAL_TIMEOUT_MS || '300000', 10);
  const maxActiveRuns = parseInt(env.MAX_ACTIVE_RUNS || '5', 10);

  if (errors.length > 0) {
    const errorMsg = `[Environment Validation FAILED]:\n  - ${errors.join('\n  - ')}`;
    if (isProduction) {
      throw new Error(errorMsg);
    } else {
      console.warn(errorMsg);
    }
  }

  return {
    valid: errors.length === 0,
    environment: env.NODE_ENV || 'development',
    port,
    isDemoMode,
    appBaseUrl,
    ai: {
      groqConfigured: hasGroq,
      anthropicConfigured: hasAnthropic,
      openaiConfigured: hasOpenAi,
      activeProviderCount: (hasGroq ? 1 : 0) + (hasAnthropic ? 1 : 0) + (hasOpenAi ? 1 : 0),
      timeoutMs: aiTimeoutMs
    },
    github: {
      configured: hasGithubToken,
      maskedToken: maskSecret(env.GITHUB_TOKEN)
    },
    database: {
      type: supabaseConfigured ? 'supabase-postgresql' : 'in-memory-fallback',
      supabaseConfigured
    },
    stripe: {
      configured: stripeConfigured,
      webhookConfigured: hasStripeWebhookSecret,
      publishableKeyConfigured: hasStripePublishableKey,
      maskedSecretKey: maskSecret(env.STRIPE_SECRET_KEY),
      maskedWebhookSecret: maskSecret(env.STRIPE_WEBHOOK_SECRET)
    },
    security: {
      jwtConfigured: !!jwtSecret && !jwtSecret.includes('your_'),
      maxActiveRuns
    },
    timeouts: {
      aiTimeoutMs,
      approvalTimeoutMs
    },
    warnings
  };
}

module.exports = {
  validateEnvironment,
  maskSecret,
  getSecretStatus
};
