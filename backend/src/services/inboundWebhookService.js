const crypto = require('crypto');
const incidentService = require('./incidentService');
const workspaceService = require('./workspaceService');
const auditLogger = require('./auditLogger');
const logger = require('./logger');
const { sanitizeObject } = require('./securitySanitizer');

/**
 * In-memory / persistent registry for workspace webhook secrets and config
 */
const workspaceWebhookConfigs = new Map();

/**
 * Bounded Deduplication Cache (Phase 18)
 * fingerprint -> { incident, normalized, timestamp }
 */
const webhookDedupCache = new Map();
const inFlightDeduplication = new Map();
const MAX_DEDUP_CACHE_SIZE = 2000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Workspace Webhook Rate Limiter (Phase 18)
 * workspaceId -> { count, windowStart }
 */
const workspaceRateLimits = new Map();
const MAX_WEBHOOKS_PER_MINUTE = 100;

/**
 * Generates a secure HMAC SHA-256 webhook secret with whsec_ prefix
 */
function generateWebhookSecret() {
  const bytes = crypto.randomBytes(24).toString('hex');
  return `whsec_${bytes}`;
}

/**
 * Computes deterministic SHA-256 fingerprint for alert payload deduplication
 */
function computeWebhookFingerprint(workspaceId, normalized) {
  const payloadKey = `${workspaceId}:${normalized.targetEndpoint}:${normalized.errorSignature}:${normalized.culpritFile}:${normalized.severity}`;
  return crypto.createHash('sha256').update(payloadKey).digest('hex');
}

/**
 * Checks and updates rate limits for workspace webhooks
 */
function checkWorkspaceRateLimit(workspaceId) {
  const now = Date.now();
  let rateData = workspaceRateLimits.get(workspaceId);

  if (!rateData || now - rateData.windowStart >= 60000) {
    rateData = { count: 1, windowStart: now };
    workspaceRateLimits.set(workspaceId, rateData);
    return;
  }

  rateData.count++;
  if (rateData.count > MAX_WEBHOOKS_PER_MINUTE) {
    const err = new Error(`WEBHOOK_RATE_LIMIT_EXCEEDED: Workspace "${workspaceId}" exceeded maximum rate of ${MAX_WEBHOOKS_PER_MINUTE} webhooks/minute.`);
    err.code = 'WEBHOOK_RATE_LIMIT_EXCEEDED';
    err.status = 429;
    err.retryAfterSeconds = Math.ceil((60000 - (now - rateData.windowStart)) / 1000);
    throw err;
  }
}

/**
 * Gets or initializes inbound webhook configuration for a workspace
 * @param {string} workspaceId
 * @returns {object} { webhookUrl, secret, createdAt, isConfigured }
 */
async function getWebhookConfig(workspaceId) {
  let config = workspaceWebhookConfigs.get(workspaceId);
  if (!config) {
    const secret = generateWebhookSecret();
    config = {
      workspaceId,
      secret,
      createdAt: new Date().toISOString(),
      lastRotatedAt: null,
      lastReceivedAt: null,
      totalReceived: 0,
      enabled: true
    };
    workspaceWebhookConfigs.set(workspaceId, config);
  }

  const BASE_URL = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;
  return {
    workspaceId: config.workspaceId,
    webhookUrl: `${BASE_URL}/api/workspaces/${workspaceId}/webhooks/inbound`,
    secret: config.secret,
    maskedSecret: config.secret.substring(0, 10) + '...' + config.secret.slice(-4),
    createdAt: config.createdAt,
    lastRotatedAt: config.lastRotatedAt,
    lastReceivedAt: config.lastReceivedAt,
    totalReceived: config.totalReceived,
    enabled: config.enabled
  };
}

/**
 * Rotates the webhook secret for a workspace
 * @param {string} workspaceId
 * @param {string} actorId
 */
async function rotateWebhookSecret(workspaceId, actorId) {
  const newSecret = generateWebhookSecret();
  const existing = workspaceWebhookConfigs.get(workspaceId) || {
    workspaceId,
    createdAt: new Date().toISOString(),
    totalReceived: 0
  };

  const updated = {
    ...existing,
    secret: newSecret,
    lastRotatedAt: new Date().toISOString()
  };

  workspaceWebhookConfigs.set(workspaceId, updated);

  auditLogger.recordAuditEvent({
    workspaceId,
    actorId: actorId || 'system',
    action: 'WEBHOOK_SECRET_ROTATED',
    resourceType: 'webhook',
    resourceId: workspaceId,
    details: { timestamp: new Date().toISOString() }
  });

  return getWebhookConfig(workspaceId);
}

/**
 * Verifies HMAC SHA-256 signature for inbound webhook payloads
 * @param {string|Buffer} rawBody - Raw unparsed request body string or buffer
 * @param {string} signature - Header signature value (e.g. sha256=... or raw hex)
 * @param {string} secret - Workspace webhook secret
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  try {
    const rawString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawString)
      .digest('hex');

    // Support both 'sha256=abcdef...' and raw 'abcdef...' formats
    const cleanSignature = signature.startsWith('sha256=')
      ? signature.substring(7)
      : signature;

    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const providedBuf = Buffer.from(cleanSignature, 'hex');

    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch (err) {
    logger.warn('webhook_signature_verification_failed', { error: err.message });
    return false;
  }
}

/**
 * Normalizes varied third-party alert schemas (Sentry, DataDog, PagerDuty, Generic)
 * into a standardized APIFIX Incident payload
 * @param {object} payload
 * @returns {object} Normalized incident data
 */
function normalizeAlertPayload(payload = {}) {
  // 1. Sentry Issue Alert format
  if (payload.event_id || payload.issue || (payload.data && payload.data.issue)) {
    const issue = payload.data?.issue || payload.issue || payload;
    const culprit = issue.culprit || payload.culprit || payload.location || 'src/controllers/api.js';
    const errorMsg = issue.title || payload.message || 'Unhandled Exception';
    const endpointMatch = errorMsg.match(/(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
    const endpoint = endpointMatch
      ? `${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}`
      : `POST /api/${culprit.split('/').pop().replace(/\.[^.]+$/, '')}`;

    return {
      provider: 'sentry',
      title: `Sentry Alert: ${errorMsg}`,
      targetEndpoint: endpoint,
      category: 'RUNTIME_EXCEPTION',
      severity: issue.level === 'error' || issue.level === 'fatal' ? 'CRITICAL' : 'HIGH',
      errorSignature: errorMsg,
      culpritFile: culprit,
      details: {
        eventId: payload.event_id,
        issueId: issue.id,
        url: payload.url || issue.permalink,
        raw: sanitizeObject(payload)
      }
    };
  }

  // 2. DataDog Monitor Alert format
  if (payload.alert_type || payload.event_title || payload.monitor_id) {
    const title = payload.event_title || payload.title || 'DataDog Monitor Triggered';
    const endpointMatch = title.match(/(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
    const endpoint = endpointMatch
      ? `${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}`
      : 'POST /api/service';

    return {
      provider: 'datadog',
      title: `DataDog Alert: ${title}`,
      targetEndpoint: endpoint,
      category: 'HIGH_ERROR_RATE',
      severity: payload.alert_type === 'error' ? 'CRITICAL' : 'HIGH',
      errorSignature: payload.event_msg || title,
      culpritFile: payload.tags?.find(t => t.startsWith('service:'))?.replace('service:', '') || 'api-service',
      details: {
        monitorId: payload.monitor_id,
        link: payload.link,
        raw: sanitizeObject(payload)
      }
    };
  }

  // 3. PagerDuty Incident format
  if (payload.event_type === 'incident.trigger' || (payload.messages && payload.messages[0]?.event)) {
    const incidentData = payload.messages?.[0]?.incident || payload.incident || payload;
    const title = incidentData.title || incidentData.summary || 'PagerDuty Incident Triggered';
    const endpointMatch = title.match(/(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);

    return {
      provider: 'pagerduty',
      title: `PagerDuty: ${title}`,
      targetEndpoint: endpointMatch ? `${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}` : 'POST /api/auth/login',
      category: 'OUTAGE',
      severity: 'CRITICAL',
      errorSignature: title,
      culpritFile: incidentData.service?.summary || 'src/server.js',
      details: {
        incidentNumber: incidentData.incident_number,
        htmlUrl: incidentData.html_url,
        raw: sanitizeObject(payload)
      }
    };
  }

  // 4. Standard / Generic APIFIX Inbound Alert format
  const endpoint = payload.endpoint || payload.targetEndpoint || payload.path || 'POST /api/auth/login';
  const errorMsg = payload.error || payload.message || payload.errorSignature || 'HTTP 500 Runtime Exception';
  const category = payload.category || 'RUNTIME_EXCEPTION';
  const severity = (payload.severity || 'HIGH').toUpperCase();

  return {
    provider: payload.provider || 'custom_webhook',
    title: payload.title || `Inbound Alert: ${endpoint}`,
    targetEndpoint: endpoint,
    category,
    severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity) ? severity : 'HIGH',
    errorSignature: errorMsg,
    culpritFile: payload.file || payload.culpritFile || 'src/controllers/authController.js',
    details: {
      headers: payload.headers ? sanitizeObject(payload.headers) : undefined,
      statusCode: payload.statusCode || 500,
      timestamp: payload.timestamp || new Date().toISOString(),
      raw: sanitizeObject(payload)
    }
  };
}

/**
 * Processes an inbound webhook alert for a workspace, records the incident,
 * deduplicates bursts with SHA-256 sliding window, and enforces rate limits.
 * 
 * @param {string} workspaceId
 * @param {object} rawPayload
 * @returns {object} { incident, autoRepairTriggered, runId, deduplicated }
 */
async function processInboundAlert(workspaceId, rawPayload) {
  // 1. Rate Limit Check
  checkWorkspaceRateLimit(workspaceId);

  // 2. Update config stats
  const config = workspaceWebhookConfigs.get(workspaceId);
  if (config) {
    config.lastReceivedAt = new Date().toISOString();
    config.totalReceived = (config.totalReceived || 0) + 1;
  }

  const normalized = normalizeAlertPayload(rawPayload);

  // 3. Deduplication Check (Cache & In-Flight Coalescing)
  const fingerprint = computeWebhookFingerprint(workspaceId, normalized);
  const now = Date.now();
  const cached = webhookDedupCache.get(fingerprint);

  if (cached && (now - cached.timestamp) < DEDUP_WINDOW_MS) {
    logger.info('inbound_webhook_deduplicated', {
      workspaceId,
      fingerprint,
      originalIncidentId: cached.incident.id,
      targetEndpoint: normalized.targetEndpoint
    });

    return {
      success: true,
      deduplicated: true,
      incident: cached.incident,
      normalized
    };
  }

  const inFlight = inFlightDeduplication.get(fingerprint);
  if (inFlight) {
    const res = await inFlight;
    return {
      ...res,
      deduplicated: true
    };
  }

  const creationPromise = (async () => {
    // 4. File New Incident
    const incident = await incidentService.createIncident({
      workspaceId,
      repositoryId: rawPayload.repositoryId || null,
      targetEndpoint: normalized.targetEndpoint,
      category: normalized.category,
      severity: normalized.severity,
      errorDetails: {
        provider: normalized.provider,
        title: normalized.title,
        signature: normalized.errorSignature,
        culpritFile: normalized.culpritFile,
        ...normalized.details
      }
    });

    // 5. Store in Deduplication Cache with Capacity Boundary
    if (webhookDedupCache.size >= MAX_DEDUP_CACHE_SIZE) {
      const oldestKey = webhookDedupCache.keys().next().value;
      if (oldestKey) webhookDedupCache.delete(oldestKey);
    }
    webhookDedupCache.set(fingerprint, {
      incident,
      normalized,
      timestamp: Date.now()
    });

    logger.info('inbound_webhook_incident_created', {
      workspaceId,
      incidentId: incident.id,
      targetEndpoint: normalized.targetEndpoint,
      provider: normalized.provider
    });

    auditLogger.recordAuditEvent({
      workspaceId,
      actorId: 'webhook_ingest',
      action: 'INBOUND_ALERT_INGESTED',
      resourceType: 'incident',
      resourceId: incident.id,
      details: {
        provider: normalized.provider,
        targetEndpoint: normalized.targetEndpoint,
        severity: normalized.severity
      }
    });

    return {
      success: true,
      deduplicated: false,
      incident,
      normalized
    };
  })();

  inFlightDeduplication.set(fingerprint, creationPromise);
  try {
    return await creationPromise;
  } finally {
    inFlightDeduplication.delete(fingerprint);
  }
}

/**
 * Resets deduplication and rate limit caches (for deterministic testing)
 */
function resetWebhookDeduplicationCache() {
  webhookDedupCache.clear();
  inFlightDeduplication.clear();
  workspaceRateLimits.clear();
}

module.exports = {
  getWebhookConfig,
  rotateWebhookSecret,
  generateWebhookSecret,
  verifyWebhookSignature,
  normalizeAlertPayload,
  processInboundAlert,
  computeWebhookFingerprint,
  resetWebhookDeduplicationCache,
  _workspaceWebhookConfigs: workspaceWebhookConfigs,
  _webhookDedupCache: webhookDedupCache
};
