/**
 * APIFIX AI — Public API Envelope & Error Serialization Service
 * 
 * Provides consistent response envelopes, standardized error contracts,
 * correlation tracking, and pagination metadata for all /api/v1 endpoints.
 */

const { sanitizeSecrets } = require('./securitySanitizer');

/**
 * Standard Success Response Envelope for Express
 */
function formatResponse(res, data, options = {}) {
  const req = res.req || {};
  const requestId = options.requestId || req.id || req.requestId || (req.headers && req.headers['x-request-id']) || `req_${Date.now()}`;
  const correlationId = options.correlationId || (req.headers && req.headers['x-correlation-id']) || req.correlationId || `corr_${Date.now()}`;
  const apiVersion = options.apiVersion || 'v1';
  const statusCode = options.statusCode || 200;

  const sanitizedData = options.skipSecretScrub ? data : sanitizeSecrets(data);

  const envelope = {
    data: sanitizedData,
    meta: {
      requestId,
      correlationId,
      apiVersion,
      timestamp: new Date().toISOString()
    }
  };

  if (options.pagination) {
    envelope.meta.pagination = {
      page: options.pagination.page || 1,
      limit: options.pagination.limit || 20,
      totalCount: options.pagination.totalCount !== undefined ? options.pagination.totalCount : (Array.isArray(data) ? data.length : 1),
      totalPages: options.pagination.totalPages || Math.ceil((options.pagination.totalCount || (Array.isArray(data) ? data.length : 1)) / (options.pagination.limit || 20)),
      hasNextPage: Boolean(options.pagination.hasNextPage),
      hasPreviousPage: Boolean(options.pagination.hasPreviousPage)
    };
  }

  if (options.meta && typeof options.meta === 'object') {
    Object.assign(envelope.meta, options.meta);
  }

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);
  res.setHeader('X-API-Version', apiVersion);

  return res.status(statusCode).json(envelope);
}

/**
 * Standard Universal Error Response Envelope for Express
 */
function formatError(res, statusCode, code, message, req = {}, options = {}) {
  const requestId = options.requestId || req.id || req.requestId || (req.headers && req.headers['x-request-id']) || `req_${Date.now()}`;
  const correlationId = options.correlationId || (req.headers && req.headers['x-correlation-id']) || req.correlationId || `corr_${Date.now()}`;
  const retryable = options.retryable !== undefined ? Boolean(options.retryable) : [429, 502, 503, 504].includes(statusCode);

  const errorObj = {
    code: code || 'INTERNAL_ERROR',
    message: typeof message === 'string' ? sanitizeSecrets(message) : (message || 'An unexpected error occurred.'),
    requestId,
    correlationId,
    retryable
  };

  if (options.details) {
    errorObj.details = sanitizeSecrets(options.details);
  }

  if (options.retryAfterSeconds) {
    res.setHeader('Retry-After', String(options.retryAfterSeconds));
    errorObj.retryAfterSeconds = options.retryAfterSeconds;
  }

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);

  return res.status(statusCode).json({ error: errorObj });
}

function wrapSuccess(data, options = {}) {
  const sanitizedData = sanitizeSecrets(data);
  const envelope = {
    data: sanitizedData,
    meta: {
      requestId: options.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      apiVersion: options.apiVersion || '1.0.0',
      version: options.version || '1.0.0',
      timestamp: new Date().toISOString()
    }
  };
  if (options.durationMs !== undefined) {
    envelope.meta.durationMs = options.durationMs;
  }
  if (options.meta && typeof options.meta === 'object') {
    Object.assign(envelope.meta, options.meta);
  }
  return envelope;
}

function wrapPaginated(items, options = {}) {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const totalItems = options.totalItems !== undefined ? options.totalItems : (Array.isArray(items) ? items.length : 0);
  const totalPages = options.totalPages || Math.ceil(totalItems / limit);

  return {
    data: sanitizeSecrets(items),
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      requestId: options.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  };
}

function wrapError(code, message, options = {}) {
  const errorObj = {
    code: code || 'INTERNAL_ERROR',
    message: typeof message === 'string' ? sanitizeSecrets(message) : (message || 'An unexpected error occurred.'),
    requestId: options.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    retryable: options.retryable !== undefined ? Boolean(options.retryable) : false
  };

  if (options.details) {
    errorObj.details = sanitizeSecrets(options.details);
  }

  return { error: errorObj };
}

module.exports = {
  formatResponse,
  formatError,
  wrapSuccess,
  wrapPaginated,
  wrapError
};
