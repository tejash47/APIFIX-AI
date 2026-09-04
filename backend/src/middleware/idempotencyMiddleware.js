/**
 * APIFIX AI — Idempotency Middleware
 * 
 * Intercepts mutation requests containing Idempotency-Key,
 * prevents duplicate execution, and automatically caches response payloads.
 */

const idempotencyService = require('../services/idempotencyService');
const { formatError } = require('../services/apiEnvelopeService');

function idempotencyMiddleware(req, res, next) {
  // Only apply to state-mutating HTTP methods
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    return next(); // Key not provided, proceed normally
  }

  const tenantScope = (req.organizationId || (req.user && req.user.organizationId) || '') + ':' +
                      (req.workspaceId || (req.user && req.user.workspaceId) || '');

  const check = idempotencyService.checkIdempotency(
    idempotencyKey,
    req.method,
    req.originalUrl || req.url,
    req.body,
    tenantScope
  );

  // If check is a promise or synchronous
  Promise.resolve(check).then((result) => {
    if (!result.isIdempotent) {
      const keyId = result.keyId || `${tenantScope}:${idempotencyKey.trim()}`;
      const fingerprint = result.fingerprint || idempotencyService.computeRequestFingerprint(req.method, req.originalUrl || req.url, req.body, tenantScope);

      idempotencyService.lockKey(keyId);

      // Hook res.json to store response on completion
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 500) {
            idempotencyService.storeIdempotentResponse(
              keyId,
              fingerprint,
              res.statusCode,
              res.getHeaders ? res.getHeaders() : {},
              body
            );
          } else {
            idempotencyService.releaseLock(keyId);
          }
        } catch (e) {
          idempotencyService.releaseLock(keyId);
        }
        return originalJson(body);
      };

      res.on('finish', () => {
        idempotencyService.releaseLock(keyId);
      });

      return next();
    }

    if (result.conflict) {
      return res.status(409).json({
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: result.message || 'Idempotency key reused with differing parameters or request fingerprint.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown',
          retryable: false
        }
      });
    }

    if (result.inFlight) {
      return res.status(409).json({
        error: {
          code: 'IDEMPOTENCY_CONCURRENT_REQUEST',
          message: 'A request with this idempotency key is currently executing.',
          requestId: req.id || req.headers['x-request-id'] || 'req_unknown',
          retryable: true
        }
      });
    }

    if (result.replayed) {
      res.setHeader('X-Cache', 'IDEMPOTENT_REPLAY');
      res.setHeader('X-Idempotent-Replay', 'true');
      res.setHeader('X-Idempotency-Key', idempotencyKey);
      res.setHeader('X-Original-Timestamp', result.createdAt || '');
      return res.status(result.statusCode || 200).json(result.body);
    }

    return next();
  }).catch((err) => {
    return next(err);
  });
}

module.exports = idempotencyMiddleware;
