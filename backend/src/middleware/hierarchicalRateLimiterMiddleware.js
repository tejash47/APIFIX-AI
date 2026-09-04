/**
 * APIFIX AI — Hierarchical Rate Limiter Middleware
 * 
 * Applies hierarchical rate limits across Organization -> Workspace -> API Key -> Endpoint.
 */

const { evaluateHierarchicalRateLimit } = require('../services/hierarchicalRateLimiter');
const { formatError } = require('../services/apiEnvelopeService');

const apiKeyService = require('../services/apiKeyService');

function hierarchicalRateLimiterMiddleware(req, res, next) {
  // Extract identifiers from authenticated context or headers
  let apiKeyId = (req.apiKey && req.apiKey.id) || null;
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || '';
  if (!apiKeyId && authHeader) {
    const rawKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
    if (rawKey.startsWith('apifix_')) {
      const validated = typeof apiKeyService.validateApiKey === 'function' ? apiKeyService.validateApiKey(rawKey) : null;
      if (validated && validated.valid) {
        apiKeyId = validated.key?.id;
        req.apiKey = validated.key;
      }
    }
  }

  const organizationId = req.organizationId || (req.apiKey && req.apiKey.organizationId) || req.headers['x-organization-id'] || null;
  const workspaceId = req.workspaceId || (req.apiKey && req.apiKey.workspaceId) || req.headers['x-workspace-id'] || null;
  const clientIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';

  const result = evaluateHierarchicalRateLimit({
    organizationId,
    workspaceId,
    apiKeyId,
    clientIp,
    method: req.method,
    pathUrl: req.originalUrl || req.url
  });

  // Attach standard RateLimit headers to response
  res.setHeader('X-RateLimit-Limit', String(result.limit || 120));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining !== undefined ? result.remaining : 119));
  res.setHeader('X-RateLimit-Reset', String(result.resetSeconds || 60));
  res.setHeader('X-RateLimit-Reset-Ms', String((result.resetSeconds || 60) * 1000));

  if (!result.allowed || result.blocked) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds || 60));
    return res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: result.reason || 'Request rate limit exceeded.',
        level: result.level,
        retryAfterSeconds: result.retryAfterSeconds || 60,
        requestId: req.id || req.headers['x-request-id'] || 'req_unknown',
        retryable: true
      }
    });
  }

  return next();
}

module.exports = hierarchicalRateLimiterMiddleware;
