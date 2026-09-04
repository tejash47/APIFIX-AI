const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const { sanitizeSecrets } = require('./securitySanitizer');

const DATA_DIR = path.resolve(__dirname, '../../data');
const AUDIT_LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function loadAuditLogs() {
  try {
    if (fs.existsSync(AUDIT_LOGS_FILE)) {
      const data = fs.readFileSync(AUDIT_LOGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[AuditLogger] Error reading audit_logs.json:', err.message);
  }
  return [];
}

function saveAuditLogs(logs) {
  try {
    fs.writeFileSync(AUDIT_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (err) {
    console.error('[AuditLogger] Error writing audit_logs.json:', err.message);
  }
}

/**
 * Sanitizes object keys and values to ensure zero credentials exist in audit logs
 */
function sanitizeAuditPayload(data) {
  if (!data || typeof data !== 'object') return data;
  const sanitized = {};
  for (const [k, v] of Object.entries(data)) {
    const lower = k.toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('key') ||
      lower.includes('auth') ||
      lower.includes('credential')
    ) {
      sanitized[k] = '[REDACTED_SECRET]';
    } else if (typeof v === 'string') {
      sanitized[k] = sanitizeSecrets(v);
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitizeAuditPayload(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Record an audit log event
 */
async function recordAuditEvent({
  workspaceId,
  actorId = 'anonymous',
  actorEmail = '',
  action,
  resourceType,
  resourceId = '',
  requestId = '',
  metadata = {}
}) {
  const sanitizedMeta = sanitizeAuditPayload(metadata);

  const entry = {
    id: `aud_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    workspaceId: workspaceId || 'ws_global',
    actorId: actorId || 'anonymous',
    actorEmail: actorEmail || '',
    action: action || 'UNKNOWN_ACTION',
    resourceType: resourceType || 'SYSTEM',
    resourceId: resourceId || '',
    timestamp: new Date().toISOString(),
    requestId: requestId || '',
    metadata: sanitizedMeta
  };

  // Local disk persistence
  const logs = loadAuditLogs();
  logs.unshift(entry);
  if (logs.length > 5000) logs.pop(); // safe cap on local memory
  saveAuditLogs(logs);

  // Supabase PostgreSQL persistence
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('audit_logs').insert({
        id: entry.id,
        workspace_id: entry.workspaceId,
        actor_id: entry.actorId,
        actor_email: entry.actorEmail,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        timestamp: entry.timestamp,
        request_id: entry.requestId,
        metadata: entry.metadata
      });
    } catch (err) {
      console.warn('[AuditLogger] Supabase audit insert error:', err.message);
    }
  }

  return entry;
}

/**
 * List audit logs with pagination and filtering
 */
async function listAuditLogs({
  workspaceId,
  action,
  actorId,
  page = 1,
  limit = 20
}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' });

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }
      if (action) {
        query = query.eq('action', action);
      }
      if (actorId) {
        query = query.eq('actor_id', actorId);
      }

      query = query
        .order('timestamp', { ascending: false })
        .range(offset, offset + safeLimit - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        const total = count || 0;
        return {
          items: data.map(d => ({
            id: d.id,
            workspaceId: d.workspace_id,
            actorId: d.actor_id,
            actorEmail: d.actor_email,
            action: d.action,
            resourceType: d.resource_type,
            resourceId: d.resource_id,
            timestamp: d.timestamp,
            requestId: d.request_id,
            metadata: d.metadata
          })),
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit) || 1
        };
      }
    } catch (err) {
      console.warn('[AuditLogger] Supabase list error, falling back to disk:', err.message);
    }
  }

  // Local disk fallback
  let logs = loadAuditLogs();
  if (workspaceId) {
    logs = logs.filter(l => l.workspaceId === workspaceId);
  }
  if (action) {
    logs = logs.filter(l => l.action === action);
  }
  if (actorId) {
    logs = logs.filter(l => l.actorId === actorId);
  }

  const total = logs.length;
  const items = logs.slice(offset, offset + safeLimit);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1
  };
}

module.exports = {
  recordAuditEvent,
  listAuditLogs,
  sanitizeAuditPayload
};
