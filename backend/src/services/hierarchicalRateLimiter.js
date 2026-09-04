/**
 * APIFIX AI — Hierarchical Rate Limiter & Quota Service
 * 
 * Implements multi-tier sliding-window rate limiting and quota enforcement:
 * Organization -> Workspace -> API Key -> Endpoint.
 */

const { getMetrics } = require('./observabilityEngine');

// In-memory sliding window tracking: key -> array of timestamps
const windowCounters = new Map();

// Default rate limits per 60-second window
const DEFAULT_TIER_LIMITS = {
  ORGANIZATION: 1000,
  WORKSPACE: 300,
  API_KEY: 120,
  ENDPOINT_MUTATION: 30, // Runs, repairs, imports
  ENDPOINT_READ: 200     // GET lists, inspections
};

// Quotas
const QUOTAS = {
  CONCURRENT_REPAIRS_PER_WORKSPACE: 10,
  EXPORTS_PER_DAY: 50,
  WEBHOOKS_PER_MINUTE: 500
};

/**
 * Checks sliding-window rate limit for a specific identifier
 */
function checkWindowLimit(key, limit, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = windowCounters.get(key) || [];
  // Evict old timestamps
  timestamps = timestamps.filter(t => t > windowStart);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0] || now;
    const resetSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    windowCounters.set(key, timestamps);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetSeconds: Math.max(1, resetSeconds),
      retryAfterSeconds: Math.max(1, resetSeconds)
    };
  }

  timestamps.push(now);
  windowCounters.set(key, timestamps);

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    resetSeconds: Math.ceil(windowMs / 1000)
  };
}

/**
 * Evaluates the full hierarchical rate limit chain for an incoming request
 */
function evaluateHierarchicalRateLimit({
  organizationId = null,
  workspaceId = null,
  apiKeyId = null,
  clientIp = '127.0.0.1',
  method = 'GET',
  pathUrl = '/'
}) {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());

  // Level 1: Organization Rate Limit
  if (organizationId) {
    const orgCheck = checkWindowLimit(`org:${organizationId}`, DEFAULT_TIER_LIMITS.ORGANIZATION);
    if (!orgCheck.allowed) {
      return { ...orgCheck, level: 'ORGANIZATION', blocked: true, reason: 'Organization hourly rate limit exceeded.' };
    }
  }

  // Level 2: Workspace Rate Limit
  if (workspaceId) {
    const wsCheck = checkWindowLimit(`ws:${workspaceId}`, DEFAULT_TIER_LIMITS.WORKSPACE);
    if (!wsCheck.allowed) {
      return { ...wsCheck, level: 'WORKSPACE', blocked: true, reason: 'Workspace rate limit exceeded.' };
    }
  }

  // Level 3: API Key or Client IP Rate Limit
  const identityKey = apiKeyId ? `key:${apiKeyId}` : `ip:${clientIp}`;
  const identityLimit = apiKeyId ? DEFAULT_TIER_LIMITS.API_KEY : DEFAULT_TIER_LIMITS.API_KEY / 2;
  const identityCheck = checkWindowLimit(identityKey, identityLimit);
  if (!identityCheck.allowed) {
    return { ...identityCheck, level: apiKeyId ? 'API_KEY' : 'CLIENT_IP', blocked: true, reason: 'Client rate limit exceeded.' };
  }

  // Level 4: Endpoint Specific Limit for heavy mutations (runs/repairs/scans)
  if (isMutation && (pathUrl.includes('/runs') || pathUrl.includes('/repairs') || pathUrl.includes('/projects/upload'))) {
    const epKey = `ep_mut:${workspaceId || clientIp}:${pathUrl.split('?')[0]}`;
    const epCheck = checkWindowLimit(epKey, DEFAULT_TIER_LIMITS.ENDPOINT_MUTATION);
    if (!epCheck.allowed) {
      return { ...epCheck, level: 'ENDPOINT', blocked: true, reason: 'Endpoint execution quota rate limit exceeded.' };
    }
  }

  // If all checks passed, return identity metadata for headers
  return {
    allowed: true,
    blocked: false,
    level: 'PASSED',
    limit: identityLimit,
    remaining: identityCheck.remaining,
    resetSeconds: identityCheck.resetSeconds
  };
}

function checkLimit(opts = {}) {
  const key = `org:${opts.orgId || 'default'}`;
  const limit = opts.plan === 'ENTERPRISE' ? 10000 : 1000;
  return checkWindowLimit(key, limit);
}

function resetRateLimiter() {
  windowCounters.clear();
}

const hierarchicalRateLimiter = {
  checkWindowLimit,
  checkLimit,
  evaluateHierarchicalRateLimit,
  resetRateLimiter,
  DEFAULT_TIER_LIMITS,
  QUOTAS
};

module.exports = {
  checkWindowLimit,
  checkLimit,
  evaluateHierarchicalRateLimit,
  resetRateLimiter,
  DEFAULT_TIER_LIMITS,
  QUOTAS,
  hierarchicalRateLimiter
};
