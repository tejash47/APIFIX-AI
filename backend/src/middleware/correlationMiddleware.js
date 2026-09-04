/**
 * APIFIX AI — Request Correlation & Tracing Middleware (Phase 16)
 * Generates and propagates correlation and request IDs across all inbound HTTP requests,
 * attaches trace headers, and logs structured operational telemetry on response completion.
 */

const observabilityEngine = require('../services/observabilityEngine');

function correlationMiddleware(req, res, next) {
  const existingReqId = req.headers['x-request-id'];
  const existingCorrelationId = req.headers['x-correlation-id'] || req.headers['x-trace-id'];

  const requestId = existingReqId || `req_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  const correlationId = existingCorrelationId || `trace_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;

  req.requestId = requestId;
  req.correlationId = correlationId;

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);

  const startTime = Date.now();

  // On response finish, record HTTP operational telemetry
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    observabilityEngine.recordEvent({
      event: 'http_request_completed',
      category: 'HTTP',
      stage: 'SERVING',
      durationMs,
      status: isError ? 'FAILURE' : 'SUCCESS',
      errorCode: isError ? `HTTP_${statusCode}` : null,
      severity: statusCode >= 500 ? 'HIGH' : (isError ? 'MEDIUM' : 'INFO'),
      workspaceId: req.workspace?.id || req.params?.workspaceId || req.headers['x-workspace-id'] || 'system',
      userId: req.user?.id || null,
      correlationId: req.correlationId,
      requestId: req.requestId,
      metadata: {
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode,
        userAgent: req.headers['user-agent']
      }
    });
  });

  next();
}

module.exports = correlationMiddleware;
