/**
 * APIFIX V2 — Standardized Production API Error & Request Tracing Middleware
 * Injects unique Request IDs, formats standard JSON error envelopes, and prevents stack trace leakage.
 */

const logger = require('../services/logger');

/**
 * Middleware that assigns a unique requestId to every incoming request.
 */
function requestIdMiddleware(req, res, next) {
  const existingId = req.headers['x-request-id'];
  const reqId = existingId || `req_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}

/**
 * Standard API error handling middleware.
 */
function standardErrorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');
  const isProduction = process.env.NODE_ENV === 'production';

  // Sanitize message: Do not leak filesystem paths or stack frames
  let safeMessage = err.message || 'An unexpected internal server error occurred.';
  if (isProduction && statusCode === 500) {
    if (safeMessage.includes('\\') || safeMessage.includes('/')) {
      safeMessage = 'An internal system error occurred while processing the request.';
    }
  }

  const errorResponse = {
    error: {
      code: errorCode,
      message: safeMessage,
      requestId: req.requestId || 'req_unknown'
    }
  };

  // Attach safe details if provided
  if (err.details && typeof err.details === 'string') {
    errorResponse.error.details = err.details;
  }

  // Structured server-side logging
  logger.error('http_request_error', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode,
    errorCode,
    errorMessage: err.message,
    stack: isProduction ? undefined : err.stack
  });

  if (!res.headersSent) {
    res.status(statusCode).json(errorResponse);
  }
}

module.exports = {
  requestIdMiddleware,
  standardErrorHandler
};
