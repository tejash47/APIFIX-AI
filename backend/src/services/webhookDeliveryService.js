/**
 * APIFIX AI — Enterprise Outbound Webhook Delivery Platform
 * 
 * Manages webhook endpoint subscriptions, cryptographic HMAC SHA-256 signing,
 * exponential backoff retries with jitter, dead-letter states, SSRF defense,
 * delivery history logging, and manual replay.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isSsrfSafeUrl } = require('./ssrfProtection');
const { sanitizeSecrets } = require('./securitySanitizer');
const auditLedgerService = require('./auditLedgerService');

const DATA_DIR = path.resolve(__dirname, '../../data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'outbound_webhook_subscriptions.json');
const DELIVERIES_FILE = path.join(DATA_DIR, 'outbound_webhook_deliveries.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readJson(file, fallback = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.warn(`[WebhookDeliveryService] Read error for ${file}:`, e.message);
  }
  return fallback;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[WebhookDeliveryService] Write error for ${file}:`, e.message);
  }
}

/**
 * Supported Enterprise Outbound Webhook Events
 */
const SUPPORTED_EVENTS = [
  'incident.created',
  'incident.updated',
  'repair.started',
  'repair.completed',
  'repair.failed',
  'patch.created',
  'verification.started',
  'verification.completed',
  'approval.requested',
  'approval.approved',
  'approval.rejected',
  'deployment.started',
  'deployment.completed',
  'budget.warning',
  'budget.critical',
  'security.alert',
  'compliance.control_failed'
];

/**
 * Register a new outbound webhook subscription
 */
async function registerWebhookEndpoint({
  url,
  events = ['incident.created', 'repair.completed', 'security.alert'],
  organizationId,
  workspaceId,
  description = '',
  actor = {}
}) {
  if (!url || typeof url !== 'string') {
    throw new Error('Valid webhook destination URL is required.');
  }

  // SSRF Protection Check
  const ssrfCheck = isSsrfSafeUrl(url);
  if (!ssrfCheck.safe) {
    throw new Error(`SSRF_PROTECTION_VIOLATION: Webhook URL rejected. ${ssrfCheck.reason || 'Private or internal destination.'}`);
  }

  const validEvents = events.filter(e => SUPPORTED_EVENTS.includes(e) || e === '*');
  if (validEvents.length === 0) {
    throw new Error(`At least one valid event subscription required. Available events: ${SUPPORTED_EVENTS.join(', ')}`);
  }

  const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  const endpoint = {
    id: `whep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    url: url.trim(),
    events: validEvents,
    organizationId: organizationId || 'org_enterprise_primary',
    workspaceId: workspaceId || 'ws_demo_primary',
    description: description.trim(),
    secret,
    enabled: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.id || 'usr_anonymous',
    deliveryStats: {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      lastDeliveryAt: null,
      lastStatusCode: null
    }
  };

  const subs = readJson(SUBSCRIPTIONS_FILE, []);
  subs.push(endpoint);
  writeJson(SUBSCRIPTIONS_FILE, subs);

  try {
    await auditLedgerService.recordEvent({
      organizationId: endpoint.organizationId,
      workspaceId: endpoint.workspaceId,
      action: 'WEBHOOK_ENDPOINT_CREATED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'WEBHOOK_ENDPOINT',
      resourceId: endpoint.id,
      metadata: { url: endpoint.url, events: endpoint.events }
    });
  } catch (e) {}

  return {
    endpoint: sanitizeSecrets({
      id: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
      organizationId: endpoint.organizationId,
      workspaceId: endpoint.workspaceId,
      description: endpoint.description,
      enabled: endpoint.enabled,
      createdAt: endpoint.createdAt
    }),
    id: endpoint.id,
    url: endpoint.url,
    events: endpoint.events,
    enabled: endpoint.enabled,
    secret // Returned only upon initial creation
  };
}

/**
 * List all webhook subscriptions for workspace or org
 */
function listWebhookEndpoints({ organizationId, workspaceId }) {
  const subs = readJson(SUBSCRIPTIONS_FILE, []);
  let filtered = subs;
  if (organizationId) filtered = filtered.filter(s => s.organizationId === organizationId);
  if (workspaceId) filtered = filtered.filter(s => s.workspaceId === workspaceId);

  return filtered.map(s => sanitizeSecrets({
    id: s.id,
    url: s.url,
    events: s.events,
    organizationId: s.organizationId,
    workspaceId: s.workspaceId,
    description: s.description,
    enabled: s.enabled,
    createdAt: s.createdAt,
    deliveryStats: s.deliveryStats
  }));
}

/**
 * Get endpoint by ID
 */
function getWebhookEndpoint(id) {
  const subs = readJson(SUBSCRIPTIONS_FILE, []);
  return subs.find(s => s.id === id) || null;
}

/**
 * Update / Enable / Disable endpoint
 */
async function updateWebhookEndpoint(id, updates, actor = {}) {
  const subs = readJson(SUBSCRIPTIONS_FILE, []);
  const ep = subs.find(s => s.id === id);
  if (!ep) throw new Error(`Webhook endpoint ${id} not found.`);

  if (updates.url && updates.url !== ep.url) {
    const ssrfCheck = isSsrfSafeUrl(updates.url);
    if (!ssrfCheck.safe) throw new Error(`SSRF_PROTECTION_VIOLATION: ${ssrfCheck.reason}`);
    ep.url = updates.url.trim();
  }

  if (updates.events && Array.isArray(updates.events)) {
    ep.events = updates.events.filter(e => SUPPORTED_EVENTS.includes(e) || e === '*');
  }

  if (updates.enabled !== undefined) ep.enabled = Boolean(updates.enabled);
  if (updates.description !== undefined) ep.description = updates.description;

  writeJson(SUBSCRIPTIONS_FILE, subs);

  try {
    await auditLedgerService.recordEvent({
      organizationId: ep.organizationId,
      workspaceId: ep.workspaceId,
      action: 'WEBHOOK_ENDPOINT_UPDATED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'WEBHOOK_ENDPOINT',
      resourceId: ep.id,
      metadata: { enabled: ep.enabled, events: ep.events }
    });
  } catch (e) {}

  return sanitizeSecrets(ep);
}

/**
 * Delete webhook endpoint
 */
async function deleteWebhookEndpoint(id, actor = {}) {
  const subs = readJson(SUBSCRIPTIONS_FILE, []);
  const index = subs.findIndex(s => s.id === id);
  if (index === -1) throw new Error(`Webhook endpoint ${id} not found.`);

  const [deleted] = subs.splice(index, 1);
  writeJson(SUBSCRIPTIONS_FILE, subs);

  try {
    await auditLedgerService.recordEvent({
      organizationId: deleted.organizationId,
      workspaceId: deleted.workspaceId,
      action: 'WEBHOOK_ENDPOINT_DELETED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'WEBHOOK_ENDPOINT',
      resourceId: deleted.id,
      metadata: { url: deleted.url }
    });
  } catch (e) {}

  return { success: true, id };
}

/**
 * Computes HMAC SHA-256 signature for webhook payload
 */
function computeWebhookSignature(payloadString, secret, timestamp) {
  const signedPayload = `${timestamp}.${payloadString}`;
  return crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
}

/**
 * Dispatches an event to all matching subscribed endpoints
 */
async function dispatchWebhookEvent({
  eventType,
  organizationId,
  workspaceId,
  data = {}
}) {
  if (!SUPPORTED_EVENTS.includes(eventType)) {
    console.warn(`[WebhookDeliveryService] Unknown event type: ${eventType}`);
  }

  const subs = readJson(SUBSCRIPTIONS_FILE, []);
  const matchingEndpoints = subs.filter(ep => {
    if (!ep.enabled) return false;
    if (organizationId && ep.organizationId && ep.organizationId !== organizationId) return false;
    if (workspaceId && ep.workspaceId && ep.workspaceId !== workspaceId) return false;
    return ep.events.includes('*') || ep.events.includes(eventType);
  });

  const deliveryPromises = matchingEndpoints.map(ep => executeDelivery(ep, eventType, organizationId, workspaceId, data));
  return await Promise.all(deliveryPromises);
}

/**
 * Executes delivery attempt to a single endpoint with backoff retry
 */
async function executeDelivery(endpoint, eventType, organizationId, workspaceId, data, isReplay = false) {
  const deliveryId = `whd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const payload = {
    id: deliveryId,
    type: eventType,
    timestamp: new Date().toISOString(),
    organizationId: organizationId || endpoint.organizationId,
    workspaceId: workspaceId || endpoint.workspaceId,
    data: sanitizeSecrets(data)
  };

  const payloadString = JSON.stringify(payload);
  const signature = computeWebhookSignature(payloadString, endpoint.secret, timestamp);

  const deliveryRecord = {
    deliveryId,
    endpointId: endpoint.id,
    endpointUrl: endpoint.url,
    eventType,
    organizationId: payload.organizationId,
    workspaceId: payload.workspaceId,
    request: {
      headers: {
        'Content-Type': 'application/json',
        'X-APIFIX-Event': eventType,
        'X-APIFIX-Delivery': deliveryId,
        'X-APIFIX-Timestamp': timestamp,
        'X-APIFIX-Signature': `t=${timestamp},v1=${signature}`
      },
      payload
    },
    attempts: 0,
    maxAttempts: 3,
    status: 'PENDING',
    statusCode: null,
    latencyMs: 0,
    error: null,
    isReplay: Boolean(isReplay),
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  const startTime = Date.now();
  let success = false;
  let lastError = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= deliveryRecord.maxAttempts; attempt++) {
    deliveryRecord.attempts = attempt;
    try {
      // Execute fetch with 5s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: deliveryRecord.request.headers,
        body: payloadString,
        signal: controller.signal
      });

      clearTimeout(timeout);
      lastStatus = res.status;

      if (res.ok) {
        success = true;
        deliveryRecord.status = 'DELIVERED';
        deliveryRecord.statusCode = res.status;
        break;
      } else {
        lastError = `HTTP_${res.status}`;
      }
    } catch (err) {
      lastError = err.message || 'CONNECTION_ERROR';
    }

    // Exponential backoff with jitter before next attempt
    if (attempt < deliveryRecord.maxAttempts) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000) + Math.floor(Math.random() * 200);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }

  deliveryRecord.latencyMs = Date.now() - startTime;
  deliveryRecord.completedAt = new Date().toISOString();

  if (!success) {
    deliveryRecord.status = 'DEAD_LETTER';
    deliveryRecord.error = lastError;
    deliveryRecord.statusCode = lastStatus;
  }

  // Update endpoint delivery statistics
  updateEndpointStats(endpoint.id, success, lastStatus);

  // Store delivery record
  const deliveries = readJson(DELIVERIES_FILE, []);
  deliveries.unshift(deliveryRecord);
  // Keep last 500 deliveries
  if (deliveries.length > 500) deliveries.length = 500;
  writeJson(DELIVERIES_FILE, deliveries);

  return deliveryRecord;
}

function updateEndpointStats(endpointId, success, statusCode) {
  const subs = readJson(SUBSCRIPTIONS_FILE, []);
  const ep = subs.find(s => s.id === endpointId);
  if (ep) {
    ep.deliveryStats = ep.deliveryStats || { totalDeliveries: 0, successfulDeliveries: 0, failedDeliveries: 0 };
    ep.deliveryStats.totalDeliveries += 1;
    if (success) {
      ep.deliveryStats.successfulDeliveries += 1;
    } else {
      ep.deliveryStats.failedDeliveries += 1;
    }
    ep.deliveryStats.lastDeliveryAt = new Date().toISOString();
    ep.deliveryStats.lastStatusCode = statusCode;
    writeJson(SUBSCRIPTIONS_FILE, subs);
  }
}

/**
 * Replay a past delivery
 */
async function replayWebhookDelivery(deliveryId, actor = {}) {
  const deliveries = readJson(DELIVERIES_FILE, []);
  const original = deliveries.find(d => d.deliveryId === deliveryId);

  if (!original) {
    throw new Error(`Delivery record ${deliveryId} not found.`);
  }

  const endpoint = getWebhookEndpoint(original.endpointId);
  if (!endpoint) {
    throw new Error(`Original webhook endpoint ${original.endpointId} no longer exists.`);
  }

  const replayResult = await executeDelivery(
    endpoint,
    original.eventType,
    original.organizationId,
    original.workspaceId,
    original.request.payload.data,
    true
  );

  try {
    await auditLedgerService.recordEvent({
      organizationId: original.organizationId,
      workspaceId: original.workspaceId,
      action: 'WEBHOOK_DELIVERY_REPLAYED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'WEBHOOK_DELIVERY',
      resourceId: replayResult.deliveryId,
      metadata: { originalDeliveryId: deliveryId, status: replayResult.status }
    });
  } catch (e) {}

  return replayResult;
}

/**
 * List past delivery records
 */
function listWebhookDeliveries({ organizationId, workspaceId, endpointId, status, limit = 50 }) {
  const deliveries = readJson(DELIVERIES_FILE, []);
  let filtered = deliveries;

  if (organizationId) filtered = filtered.filter(d => d.organizationId === organizationId);
  if (workspaceId) filtered = filtered.filter(d => d.workspaceId === workspaceId);
  if (endpointId) filtered = filtered.filter(d => d.endpointId === endpointId);
  if (status) filtered = filtered.filter(d => d.status === status);

  return filtered.slice(0, Math.min(limit, 100));
}

/**
 * Webhook delivery telemetry metrics summary
 */
function getWebhookDeliveryMetrics({ organizationId, workspaceId } = {}) {
  const deliveries = listWebhookDeliveries({ organizationId, workspaceId, limit: 500 });
  const total = deliveries.length;
  const delivered = deliveries.filter(d => d.status === 'DELIVERED').length;
  const deadLetter = deliveries.filter(d => d.status === 'DEAD_LETTER').length;
  const successRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : '100.0';
  const totalLatency = deliveries.reduce((acc, d) => acc + (d.latencyMs || 0), 0);
  const avgLatencyMs = total > 0 ? Math.round(totalLatency / total) : 0;

  return {
    totalDeliveries: total,
    successfulDeliveries: delivered,
    deadLetterDeliveries: deadLetter,
    successRatePercentage: parseFloat(successRate),
    avgLatencyMs,
    activeEndpoints: listWebhookEndpoints({ organizationId, workspaceId }).filter(e => e.enabled).length
  };
}

function signWebhookPayload(payloadString, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = computeWebhookSignature(payloadString, secret, timestamp);
  return `t=${timestamp},v1=${sig}`;
}

function verifySignature(payloadString, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',');
  const tPart = parts.find(p => p.startsWith('t='));
  const v1Part = parts.find(p => p.startsWith('v1='));
  if (!tPart || !v1Part) return false;

  const timestamp = parseInt(tPart.replace('t=', ''), 10);
  const signature = v1Part.replace('v1=', '');

  if (toleranceSeconds > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }
  }

  const expectedSignature = computeWebhookSignature(payloadString, secret, timestamp);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
  } catch {
    return signature === expectedSignature;
  }
}

module.exports = {
  registerWebhookEndpoint,
  listWebhookEndpoints,
  getWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  dispatchWebhookEvent,
  executeDelivery,
  replayWebhookDelivery,
  listWebhookDeliveries,
  getWebhookDeliveryMetrics,
  computeWebhookSignature,
  signWebhookPayload,
  verifySignature,
  SUPPORTED_EVENTS
};
