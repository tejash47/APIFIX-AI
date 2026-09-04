/**
 * APIFIX AI — Production Configuration & Environment Validator (Phase 22)
 * 
 * Provides rigorous validation of production runtime configurations,
 * detects weak secrets, insecure CORS, demo-mode flags in production,
 * unencrypted URLs, and generates zero-secret diagnostic audits.
 */

const { sanitizeSecrets } = require('../services/securitySanitizer');

const WEAK_JWT_SECRETS = new Set([
  'secret', 'jwtsecret', 'default_jwt_secret', 'apifix_secret', 'password',
  'changeme', 'development', 'admin', '123456', 'supersecret', 'test',
  'apifix-default-jwt-secret-key-2026-development-only'
]);

/**
 * Safely masks any secret string, preserving length indication without revealing characters.
 */
function maskSecret(val) {
  if (!val || typeof val !== 'string') return '[NOT_SET]';
  if (val.length <= 8) return '****';
  return `${val.slice(0, 3)}...${val.slice(-3)} (${val.length} chars)`;
}

/**
 * Validates production environment configuration.
 * @param {object} env - Environment variables object (defaults to process.env)
 * @param {boolean} throwOnError - Whether to throw an error on fatal validation failure
 * @returns {object} Safe diagnostic result
 */
function validateProductionConfig(env = process.env, throwOnError = false) {
  const isProduction = (env.NODE_ENV || '').toLowerCase() === 'production';
  const isStaging = (env.NODE_ENV || '').toLowerCase() === 'staging';
  const isStrictEnv = isProduction || isStaging;
  const isDemoMode = env.APIFIX_DEMO_MODE === 'true' || env.DEMO_MODE === 'true';

  const errors = [];
  const warnings = [];
  const checks = [];

  // Helper to record check
  function addCheck(category, name, passed, severity, message, details = {}) {
    checks.push({
      category,
      name,
      passed,
      severity, // 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'
      message,
      details: sanitizeSecrets(details)
    });
    if (!passed) {
      if (severity === 'CRITICAL') {
        errors.push(`[${category.toUpperCase()}] ${name}: ${message}`);
      } else {
        warnings.push(`[${category.toUpperCase()}] ${name}: ${message}`);
      }
    }
  }

  // 1. Core Runtime & Environment
  const nodeEnv = env.NODE_ENV || 'development';
  addCheck('runtime', 'NODE_ENV', true, 'INFO', `Environment is '${nodeEnv}'`, { environment: nodeEnv });

  const port = parseInt(env.PORT || '4000', 10);
  const validPort = !isNaN(port) && port >= 1 && port <= 65535;
  addCheck('runtime', 'PORT', validPort, 'CRITICAL', validPort ? `Port configured: ${port}` : 'PORT must be an integer between 1 and 65535.', { port });

  // 2. Demo Mode in Production
  if (isProduction && isDemoMode) {
    addCheck('security', 'DEMO_MODE_SAFETY', false, 'CRITICAL', 'APIFIX_DEMO_MODE=true is dangerous and forbidden in production mode.', { isDemoMode });
  } else {
    addCheck('security', 'DEMO_MODE_SAFETY', true, 'INFO', isDemoMode ? 'Demo mode enabled (non-production)' : 'Demo mode disabled', { isDemoMode });
  }

  // 3. JWT Secret Strength & Entropy
  const jwtSecret = env.JWT_SECRET || '';
  const isDefaultSecret = WEAK_JWT_SECRETS.has(jwtSecret.toLowerCase());
  const isTooShort = jwtSecret.length < 32;
  const isPlaceholder = jwtSecret.includes('your_') || jwtSecret.includes('change_this');

  if (!jwtSecret) {
    addCheck('security', 'JWT_SECRET', false, isStrictEnv ? 'CRITICAL' : 'HIGH', 'JWT_SECRET is not configured.', { configured: false });
  } else if (isStrictEnv && (isDefaultSecret || isTooShort || isPlaceholder)) {
    addCheck('security', 'JWT_SECRET', false, 'CRITICAL', 'JWT_SECRET is weak, too short (< 32 chars), or matches a known default in production.', {
      length: jwtSecret.length,
      isWeakOrDefault: isDefaultSecret || isPlaceholder
    });
  } else {
    addCheck('security', 'JWT_SECRET', true, 'INFO', 'JWT_SECRET meets entropy requirements.', {
      length: jwtSecret.length,
      configured: true
    });
  }

  // 4. AI Provider Credentials
  const hasGroq = !!(env.GROQ_API_KEY && env.GROQ_API_KEY.trim() && !env.GROQ_API_KEY.includes('your_'));
  const hasAnthropic = !!(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.trim() && !env.ANTHROPIC_API_KEY.includes('your_'));
  const hasOpenAi = !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim() && !env.OPENAI_API_KEY.includes('your_'));
  const providerCount = (hasGroq ? 1 : 0) + (hasAnthropic ? 1 : 0) + (hasOpenAi ? 1 : 0);

  if (providerCount === 0 && !isDemoMode) {
    addCheck('ai', 'AI_PROVIDERS', false, isStrictEnv ? 'CRITICAL' : 'HIGH', 'No valid AI provider API key found (GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY required).', { providerCount });
  } else {
    addCheck('ai', 'AI_PROVIDERS', true, 'INFO', `${providerCount} AI provider(s) active.`, {
      groq: hasGroq,
      anthropic: hasAnthropic,
      openai: hasOpenAi,
      providerCount
    });
  }

  // 5. Database Configuration & Security
  const hasSupabaseUrl = !!(env.SUPABASE_URL && env.SUPABASE_URL.trim() && !env.SUPABASE_URL.includes('your_'));
  const hasSupabaseKey = !!(env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY.trim() && !env.SUPABASE_SERVICE_ROLE_KEY.includes('your_'));
  const supabaseConfigured = hasSupabaseUrl && hasSupabaseKey;

  if (isProduction && !supabaseConfigured) {
    addCheck('database', 'PERSISTENCE', false, 'HIGH', 'Production deployment running without Supabase PostgreSQL credentials. Ephemeral memory fallback active.', {
      type: 'in-memory-fallback'
    });
  } else {
    addCheck('database', 'PERSISTENCE', true, 'INFO', supabaseConfigured ? 'Supabase PostgreSQL persistence configured.' : 'In-memory fallback persistence active.', {
      type: supabaseConfigured ? 'supabase-postgresql' : 'in-memory-fallback',
      supabaseConfigured
    });
  }

  // If Supabase URL configured, check HTTPS in production
  if (hasSupabaseUrl && isStrictEnv) {
    const isHttps = env.SUPABASE_URL.startsWith('https://');
    addCheck('database', 'DATABASE_TLS', isHttps, 'CRITICAL', isHttps ? 'Supabase URL uses TLS/HTTPS.' : 'SUPABASE_URL must use https:// in production.', {
      hasTls: isHttps
    });
  }

  // 6. Stripe & Billing Configuration
  const hasStripeKey = !!(env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.trim() && !env.STRIPE_SECRET_KEY.includes('your_'));
  const hasStripeWebhookSecret = !!(env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.trim() && !env.STRIPE_WEBHOOK_SECRET.includes('your_'));

  if (isProduction && !hasStripeKey) {
    addCheck('billing', 'STRIPE_INTEGRATION', false, 'MEDIUM', 'STRIPE_SECRET_KEY not set in production. Billing will operate in simulated test credit mode.', { configured: false });
  } else {
    addCheck('billing', 'STRIPE_INTEGRATION', true, 'INFO', hasStripeKey ? 'Stripe live billing configured.' : 'Simulated billing mode.', {
      stripeConfigured: hasStripeKey,
      webhookConfigured: hasStripeWebhookSecret
    });
  }

  // 7. CORS Configuration
  const corsOrigin = env.CORS_ORIGIN || env.FRONTEND_URL || '*';
  const isWildcardCors = corsOrigin === '*' || corsOrigin === 'true' || corsOrigin === '';

  if (isStrictEnv && isWildcardCors) {
    addCheck('security', 'CORS_POLICY', false, 'CRITICAL', 'Wildcard CORS (*) is forbidden in production. Must specify explicit origins.', { corsOrigin: '*' });
  } else {
    addCheck('security', 'CORS_POLICY', true, 'INFO', 'CORS policy configured safely.', {
      isWildcard: isWildcardCors,
      policy: isWildcardCors ? 'permissive-dev' : 'restricted'
    });
  }

  // 8. Frontend & App Base URLs
  const appBaseUrl = env.FRONTEND_URL || env.APP_BASE_URL || 'http://localhost:3000';
  const isInsecureUrl = isStrictEnv && appBaseUrl.startsWith('http://') && !appBaseUrl.includes('localhost') && !appBaseUrl.includes('127.0.0.1');

  if (isInsecureUrl) {
    addCheck('security', 'HTTPS_ENFORCEMENT', false, 'HIGH', 'Production Frontend URL must use https:// to prevent credential interception.', { appBaseUrl });
  } else {
    addCheck('security', 'HTTPS_ENFORCEMENT', true, 'INFO', 'Frontend / App Base URL is compliant.', { appBaseUrl });
  }

  // 9. Webhook Secret & Signing Security
  const webhookSecret = env.WEBHOOK_SIGNING_SECRET || env.WEBHOOK_SECRET || '';
  const hasWebhookSecret = !!(webhookSecret && webhookSecret.trim() && !webhookSecret.includes('your_'));
  addCheck('webhooks', 'WEBHOOK_SIGNING', true, 'INFO', hasWebhookSecret ? 'Outbound webhook HMAC signing key configured.' : 'Default HMAC signing entropy active.', {
    hasDedicatedSecret: hasWebhookSecret
  });

  // Calculate Overall Status and Readiness Score
  const totalChecks = checks.length;
  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / Math.max(1, totalChecks)) * 100);

  let status = 'READY';
  if (errors.length > 0) {
    status = 'BLOCKED';
  } else if (warnings.length > 0) {
    status = 'WARNING';
  }

  const result = {
    status,
    score,
    environment: nodeEnv,
    isProduction,
    isDemoMode,
    summary: {
      totalChecks,
      passedChecks,
      failedChecks: totalChecks - passedChecks,
      errorCount: errors.length,
      warningCount: warnings.length
    },
    errors,
    warnings,
    checks,
    diagnostics: {
      nodeVersion: process.version,
      platform: process.platform,
      port,
      aiProviderCount: providerCount,
      databaseType: supabaseConfigured ? 'supabase-postgresql' : 'in-memory-fallback',
      corsPolicy: isWildcardCors ? 'permissive-wildcard' : 'restricted',
      appBaseUrl,
      timestamp: new Date().toISOString()
    }
  };

  if (throwOnError && status === 'BLOCKED') {
    const err = new Error(`[Production Configuration Blocked]:\n${errors.join('\n')}`);
    err.code = 'CONFIG_VALIDATION_FAILED';
    err.diagnostics = result;
    throw err;
  }

  return result;
}

module.exports = {
  validateProductionConfig,
  maskSecret,
  WEAK_JWT_SECRETS
};
