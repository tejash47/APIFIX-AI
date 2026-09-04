/**
 * APIFIX V2 — Production Sliding-Window Rate Limiter
 * Protects control-plane endpoints against abuse, denial-of-service, and resource exhaustion.
 */

const metrics = require('../services/metrics');
const logger = require('../services/logger');

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX_GENERAL = parseInt(process.env.RATE_LIMIT_MAX_GENERAL || '120', 10);
const MAX_HEAVY = parseInt(process.env.RATE_LIMIT_MAX_HEAVY || '30', 10);

// In-memory sliding window bucket store: key -> Array<timestamp>
const requestBuckets = new Map();

// Periodic cleanup of stale IP buckets every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestBuckets.entries()) {
    const validTimestamps = timestamps.filter(t => now - t < WINDOW_MS);
    if (validTimestamps.length === 0) {
      requestBuckets.delete(key);
    } else {
      requestBuckets.set(key, validTimestamps);
    }
  }
}, 60000).unref();

/**
 * Creates a rate-limiting middleware for specific route categories.
 * @param {object} options - { maxRequests, isHeavy }
 */
function createRateLimiter(options = {}) {
  const maxLimit = options.maxRequests || (options.isHeavy ? MAX_HEAVY : MAX_GENERAL);

  return function rateLimiter(req, res, next) {
    // Skip in test environments or if explicitly disabled
    if (process.env.RATE_LIMIT_DISABLED === 'true' || process.env.NODE_ENV === 'test') {
      return next();
    }

    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client';
    const clientKey = `${clientIp}:${options.isHeavy ? 'heavy' : 'general'}`;
    const now = Date.now();

    const timestamps = (requestBuckets.get(clientKey) || []).filter(t => now - t < WINDOW_MS);

    if (timestamps.length >= maxLimit) {
      const oldest = timestamps[0];
      const resetTimeSec = Math.ceil((oldest + WINDOW_MS - now) / 1000);

      metrics.increment('rateLimitEvents');
      logger.warn('rate_limit_exceeded', {
        clientIp,
        endpoint: req.originalUrl || req.url,
        maxLimit,
        retryAfterSeconds: resetTimeSec
      });

      res.setHeader('Retry-After', resetTimeSec.toString());
      res.setHeader('X-RateLimit-Limit', maxLimit.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', resetTimeSec.toString());

      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Rate limit exceeded (${maxLimit} requests per minute). Please try again in ${resetTimeSec} seconds.`,
          requestId: req.requestId || 'req_rate_limit',
          retryAfterSeconds: resetTimeSec
        }
      });
    }

    timestamps.push(now);
    requestBuckets.set(clientKey, timestamps);

    res.setHeader('X-RateLimit-Limit', maxLimit.toString());
    res.setHeader('X-RateLimit-Remaining', (maxLimit - timestamps.length).toString());

    next();
  };
}

module.exports = {
  createRateLimiter,
  generalLimiter: createRateLimiter({ isHeavy: false }),
  heavyLimiter: createRateLimiter({ isHeavy: true })
};
