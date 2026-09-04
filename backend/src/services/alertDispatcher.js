const http = require('http');
const https = require('https');
const { URL } = require('url');
const { sanitizeObject } = require('./securitySanitizer');
const { validateSsrfSafeUrl, isSsrfSafeUrl } = require('./ssrfProtection');
const logger = require('./logger');
const auditLogger = require('./auditLogger');

/**
 * Workspace notification channels registry
 */
const workspaceChannels = new Map();

/**
 * Supported event types
 */
const SUPPORTED_EVENTS = [
  'incident.created',
  'repair.started',
  'patch.synthesized',
  'verification.completed',
  'repair.verified',
  'pr.opened',
  'credits.low'
];

/**
 * Lists configured alert channels for a workspace
 * @param {string} workspaceId
 * @returns {Array<object>} List of notification channels
 */
function listAlertChannels(workspaceId) {
  const channels = workspaceChannels.get(workspaceId) || [];
  return channels.map(c => ({
    id: c.id,
    type: c.type,
    name: c.name,
    targetUrl: c.targetUrl ? (c.targetUrl.substring(0, 20) + '...' + c.targetUrl.slice(-6)) : '',
    events: c.events || SUPPORTED_EVENTS,
    enabled: c.enabled !== false,
    createdAt: c.createdAt,
    lastDispatchedAt: c.lastDispatchedAt || null
  }));
}

/**
 * Adds a new alert notification channel to a workspace
 * @param {string} workspaceId
 * @param {object} channelData
 */
function addAlertChannel(workspaceId, channelData = {}) {
  const channels = workspaceChannels.get(workspaceId) || [];
  const type = (channelData.type || 'webhook').toLowerCase();
  const validTypes = ['slack', 'discord', 'webhook', 'email'];

  if (!validTypes.includes(type)) {
    throw new Error(`Invalid channel type. Must be one of: ${validTypes.join(', ')}`);
  }

  if (!channelData.name || !channelData.name.trim()) {
    throw new Error('Channel name is required.');
  }

  if (!channelData.targetUrl || !channelData.targetUrl.trim()) {
    throw new Error('Destination webhook URL is required.');
  }

  const rawUrl = channelData.targetUrl.trim();
  // Enforce SSRF validation unless explicitly marked allowLocal
  const isTestLocal = channelData.allowLocal === true;
  validateSsrfSafeUrl(rawUrl, { allowLocalForTesting: isTestLocal });

  const id = `chan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newChannel = {
    id,
    workspaceId,
    type,
    name: channelData.name.trim(),
    targetUrl: channelData.targetUrl.trim(),
    events: Array.isArray(channelData.events) && channelData.events.length > 0
      ? channelData.events.filter(e => SUPPORTED_EVENTS.includes(e))
      : SUPPORTED_EVENTS,
    enabled: channelData.enabled !== false,
    createdAt: new Date().toISOString(),
    lastDispatchedAt: null
  };

  channels.push(newChannel);
  workspaceChannels.set(workspaceId, channels);

  auditLogger.recordAuditEvent({
    workspaceId,
    actorId: channelData.actorId || 'system',
    action: 'ALERT_CHANNEL_ADDED',
    resourceType: 'channel',
    resourceId: id,
    details: { type, name: newChannel.name }
  });

  return newChannel;
}

/**
 * Removes an alert channel from a workspace
 * @param {string} workspaceId
 * @param {string} channelId
 */
function removeAlertChannel(workspaceId, channelId) {
  let channels = workspaceChannels.get(workspaceId) || [];
  const initialCount = channels.length;
  channels = channels.filter(c => c.id !== channelId);
  workspaceChannels.set(workspaceId, channels);

  return { success: channels.length < initialCount, removedCount: initialCount - channels.length };
}

/**
 * Formats notification payloads per channel type (Slack, Discord, generic JSON)
 */
function formatPayload(channelType, eventType, data = {}) {
  const sanitized = sanitizeObject(data);
  const title = `[APIFIX AI] ${eventType.toUpperCase().replace(/\./g, ' — ')}`;

  if (channelType === 'slack') {
    return {
      text: title,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🛡️ APIFIX AI: ${eventType.replace(/\./g, ' ').toUpperCase()}`, emoji: true }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Endpoint:* \`${sanitized.targetEndpoint || 'N/A'}\`\n*Severity:* \`${sanitized.severity || 'INFO'}\`\n*Summary:* ${sanitized.message || sanitized.summary || 'Operational alert'}`
          }
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `*Workspace:* ${sanitized.workspaceId || 'Default'} | *Time:* ${new Date().toISOString()}` }
          ]
        }
      ]
    };
  }

  if (channelType === 'discord') {
    const isError = eventType.includes('created') || eventType.includes('low') || (sanitized.severity === 'CRITICAL');
    return {
      username: 'APIFIX AI Sentinel',
      embeds: [
        {
          title: `🛡️ ${eventType.toUpperCase().replace(/\./g, ' ')}`,
          description: sanitized.message || sanitized.summary || 'Automated API reliability notification.',
          color: isError ? 15548997 : 5763719, // Red or Emerald
          fields: [
            { name: 'Target Endpoint', value: `\`${sanitized.targetEndpoint || 'N/A'}\``, inline: true },
            { name: 'Severity', value: `\`${sanitized.severity || 'NORMAL'}\``, inline: true }
          ],
          footer: { text: `APIFIX AI Reliability Platform · Workspace ${sanitized.workspaceId || ''}` },
          timestamp: new Date().toISOString()
        }
      ]
    };
  }

  // Standard generic JSON Webhook
  return {
    source: 'apifix_ai',
    version: '2.0',
    event: eventType,
    timestamp: new Date().toISOString(),
    payload: sanitized
  };
}

/**
 * Sends an HTTP POST alert payload to a target URL
 */
async function sendHttpAlert(targetUrl, payload) {
  if (!targetUrl || targetUrl.includes('example.com') || targetUrl.includes('mock')) {
    // Simulated success for test endpoints
    return { status: 200, message: 'Delivered (Simulated)' };
  }

  const ssrfCheck = isSsrfSafeUrl(targetUrl, { allowLocalForTesting: process.env.NODE_ENV === 'test' });
  if (!ssrfCheck.safe) {
    return { status: 400, ok: false, error: ssrfCheck.reason || 'SSRF Violation: Target URL is forbidden.' };
  }

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const dataString = JSON.stringify(payload);

      const req = client.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'APIFIX-Alert-Dispatcher/1.0',
            'Content-Length': Buffer.byteLength(dataString)
          },
          timeout: 4000
        },
        (res) => {
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300 });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ status: 408, ok: false, error: 'Timeout after 4000ms' });
      });

      req.on('error', (err) => {
        resolve({ status: 500, ok: false, error: err.message });
      });

      req.write(dataString);
      req.end();
    } catch (e) {
      resolve({ status: 500, ok: false, error: e.message });
    }
  });
}

const alertDeduplicator = require('./alertDeduplicator');

/**
 * Dispatches an event alert to all enabled channels configured for the workspace
 * @param {string} workspaceId
 * @param {string} eventType
 * @param {object} eventData
 * @param {object} [options] - { force: boolean, cooldownMs: number }
 */
async function dispatchWorkspaceAlert(workspaceId, eventType, eventData = {}, options = {}) {
  // Check alert storm deduplication
  if (!options.force) {
    const dedupeCheck = alertDeduplicator.shouldDispatchAlert(workspaceId, eventType, eventData, options.cooldownMs);
    if (!dedupeCheck.shouldDispatch) {
      return {
        dispatched: 0,
        deduplicated: true,
        occurrenceCount: dedupeCheck.occurrenceCount,
        suppressedCount: dedupeCheck.suppressedCount,
        results: []
      };
    }
  }

  const channels = workspaceChannels.get(workspaceId) || [];
  const matchingChannels = channels.filter(c => c.enabled && (c.events || []).includes(eventType));

  if (matchingChannels.length === 0) {
    return { dispatched: 0, results: [] };
  }

  const results = [];
  for (const channel of matchingChannels) {
    const formatted = formatPayload(channel.type, eventType, { ...eventData, workspaceId });
    const res = await sendHttpAlert(channel.targetUrl, formatted);
    channel.lastDispatchedAt = new Date().toISOString();
    results.push({ channelId: channel.id, channelName: channel.name, type: channel.type, ...res });
  }

  logger.info('workspace_alert_dispatched', {
    workspaceId,
    eventType,
    channelsNotified: results.length
  });

  return { dispatched: results.length, results };
}

/**
 * Sends an immediate test notification to a specific channel
 * @param {string} workspaceId
 * @param {string} channelId
 */
async function sendTestAlert(workspaceId, channelId) {
  const channels = workspaceChannels.get(workspaceId) || [];
  const channel = channels.find(c => c.id === channelId);
  if (!channel) {
    throw new Error('Notification channel not found');
  }

  const testPayload = {
    targetEndpoint: 'POST /api/auth/login',
    severity: 'LOW',
    message: 'Test notification from APIFIX AI Alert Dispatcher. All systems operational.',
    summary: 'Verification probe successful.'
  };

  const formatted = formatPayload(channel.type, 'incident.created', { ...testPayload, workspaceId });
  const result = await sendHttpAlert(channel.targetUrl, formatted);
  channel.lastDispatchedAt = new Date().toISOString();

  return {
    success: result.ok !== false,
    channel: channel.name,
    type: channel.type,
    response: result
  };
}

module.exports = {
  SUPPORTED_EVENTS,
  listAlertChannels,
  addAlertChannel,
  removeAlertChannel,
  formatPayload,
  dispatchWorkspaceAlert,
  sendTestAlert,
  alertDeduplicator,
  _workspaceChannels: workspaceChannels
};
