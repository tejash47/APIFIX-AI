const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

const DATA_DIR = path.resolve(__dirname, '../../data');
const INCIDENTS_FILE = path.join(DATA_DIR, 'incidents.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readIncidents() {
  try {
    if (fs.existsSync(INCIDENTS_FILE)) {
      return JSON.parse(fs.readFileSync(INCIDENTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[IncidentService] Read error for incidents.json:', e.message);
  }
  return [];
}

function writeIncidents(data) {
  try {
    fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[IncidentService] Write error for incidents.json:', e.message);
  }
}

// Initial seed
function initializeSeedIncidents() {
  const existing = readIncidents();
  if (existing.length === 0) {
    const seed = [
      {
        id: 'inc_500_auth_login',
        workspaceId: 'ws_demo_primary',
        repositoryId: null,
        runId: null,
        endpoint: '/api/auth/login',
        method: 'POST',
        status: 500,
        severity: 'CRITICAL',
        classification: 'NULL_POINTER_EXCEPTION',
        latency: '142ms',
        errorRate: '14.2%',
        errorMessage: 'TypeError: Cannot read properties of null (reading password)',
        state: 'OPEN',
        createdAt: new Date().toISOString(),
        resolvedAt: null
      },
      {
        id: 'inc_200_users',
        workspaceId: 'ws_demo_primary',
        repositoryId: null,
        runId: null,
        endpoint: '/api/users',
        method: 'GET',
        status: 200,
        severity: 'LOW',
        classification: 'HEALTHY',
        latency: '18ms',
        errorRate: '0.0%',
        errorMessage: null,
        state: 'RESOLVED',
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString()
      },
      {
        id: 'inc_200_products',
        workspaceId: 'ws_demo_primary',
        repositoryId: null,
        runId: null,
        endpoint: '/api/products',
        method: 'GET',
        status: 200,
        severity: 'LOW',
        classification: 'HEALTHY',
        latency: '24ms',
        errorRate: '0.0%',
        errorMessage: null,
        state: 'RESOLVED',
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString()
      }
    ];
    writeIncidents(seed);
  }
}

initializeSeedIncidents();

async function createIncidentRecord(workspaceIdOrData, maybeData) {
  let workspaceId = 'ws_default';
  let incidentData = {};

  if (maybeData && typeof maybeData === 'object') {
    workspaceId = workspaceIdOrData;
    incidentData = maybeData;
  } else if (workspaceIdOrData && typeof workspaceIdOrData === 'object') {
    incidentData = workspaceIdOrData;
    workspaceId = incidentData.workspaceId || 'ws_default';
  } else if (typeof workspaceIdOrData === 'string') {
    workspaceId = workspaceIdOrData;
  }

  // Parse endpoint/method if provided as "POST /api/auth/login" or "targetEndpoint"
  let method = incidentData.method || 'POST';
  let endpoint = incidentData.endpoint || incidentData.targetEndpoint || '/api/auth/login';
  if (endpoint.includes(' ')) {
    const parts = endpoint.split(' ');
    method = parts[0].toUpperCase();
    endpoint = parts[1];
  }

  const classification = incidentData.classification || incidentData.category || 'RUNTIME_EXCEPTION';
  const errorMessage = incidentData.errorMessage || incidentData.error || (incidentData.errorDetails?.signature) || null;
  const correlationId = incidentData.correlationId || incidentData.traceId || null;
  const nowIso = new Date().toISOString();

  // Compute grouping fingerprint
  const fingerprint = `${workspaceId}::${method}::${endpoint}::${classification}`;

  const list = readIncidents();

  // If incidentGrouping is enabled (or by default for matching open incidents), group if matching open incident exists
  const existingIdx = list.findIndex(i =>
    i.workspaceId === workspaceId &&
    i.endpoint === endpoint &&
    i.method === method &&
    i.state === 'OPEN' &&
    (i.fingerprint === fingerprint || i.classification === classification)
  );

  if (existingIdx !== -1 && !incidentData.forceNew) {
    const existing = list[existingIdx];
    existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
    existing.lastOccurrenceAt = nowIso;
    existing.errorMessage = errorMessage || existing.errorMessage;
    if (correlationId && !existing.correlationIds?.includes(correlationId)) {
      existing.correlationIds = existing.correlationIds || [existing.correlationId].filter(Boolean);
      existing.correlationIds.push(correlationId);
    }
    existing.correlationId = correlationId || existing.correlationId;
    list[existingIdx] = existing;
    writeIncidents(list);

    if (isSupabaseConfigured()) {
      try {
        await supabase
          .from('incidents')
          .update({
            error_message: existing.errorMessage,
            updated_at: nowIso
          })
          .eq('id', existing.id);
      } catch (e) {}
    }

    return existing;
  }

  const incident = {
    id: incidentData.id || `inc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    workspaceId: workspaceId,
    repositoryId: incidentData.repositoryId || null,
    runId: incidentData.runId || null,
    endpoint: endpoint,
    method: method,
    status: incidentData.status || 500,
    severity: incidentData.severity || 'HIGH',
    classification: classification,
    latency: incidentData.latency || '120ms',
    errorRate: incidentData.errorRate || '10.0%',
    errorMessage: errorMessage,
    state: incidentData.state || 'OPEN',
    fingerprint,
    occurrenceCount: 1,
    firstDetectedAt: nowIso,
    lastOccurrenceAt: nowIso,
    correlationId: correlationId,
    correlationIds: correlationId ? [correlationId] : [],
    createdAt: nowIso,
    resolvedAt: null
  };

  list.unshift(incident);
  writeIncidents(list);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('incidents').insert({
        id: incident.id,
        workspace_id: incident.workspaceId,
        repository_id: incident.repositoryId,
        run_id: incident.runId,
        endpoint: incident.endpoint,
        method: incident.method,
        status: incident.status,
        severity: incident.severity,
        classification: incident.classification,
        latency: incident.latency,
        error_rate: incident.errorRate,
        error_message: incident.errorMessage,
        state: incident.state,
        created_at: incident.createdAt
      });
    } catch (e) {}
  }

  return incident;
}

async function updateIncidentRecord(incidentId, updates) {
  const list = readIncidents();
  const idx = list.findIndex(i => i.id === incidentId);
  if (idx === -1) return null;

  const incident = list[idx];
  Object.assign(incident, updates);

  if (updates.state === 'RESOLVED' && !incident.resolvedAt) {
    incident.resolvedAt = new Date().toISOString();
  }

  list[idx] = incident;
  writeIncidents(list);

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('incidents')
        .update({
          status: incident.status,
          severity: incident.severity,
          classification: incident.classification,
          latency: incident.latency,
          error_rate: incident.errorRate,
          error_message: incident.errorMessage,
          state: incident.state,
          resolved_at: incident.resolvedAt
        })
        .eq('id', incidentId);
    } catch (e) {}
  }

  return incident;
}

async function getIncidentById(workspaceId, incidentId) {
  const list = readIncidents();
  return list.find(i => (!workspaceId || i.workspaceId === workspaceId) && i.id === incidentId) || null;
}

async function listIncidents(workspaceId, { page = 1, limit = 20, state, severity, repositoryId } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('incidents')
        .select('*', { count: 'exact' });

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }
      if (state) {
        query = query.eq('state', state);
      }
      if (severity) {
        query = query.eq('severity', severity);
      }
      if (repositoryId) {
        query = query.eq('repository_id', repositoryId);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + safeLimit - 1);

      const { data, count, error } = await query;
      if (!error && data && data.length > 0) {
        return {
          items: data.map(d => ({
            id: d.id,
            workspaceId: d.workspace_id,
            repositoryId: d.repository_id,
            runId: d.run_id,
            endpoint: d.endpoint,
            method: d.method,
            status: d.status,
            severity: d.severity,
            classification: d.classification,
            latency: d.latency,
            errorRate: d.error_rate,
            errorMessage: d.error_message,
            state: d.state,
            createdAt: d.created_at,
            resolvedAt: d.resolved_at
          })),
          total: count || 0,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil((count || 0) / safeLimit) || 1
        };
      }
    } catch (e) {}
  }

  let incidents = readIncidents();
  if (workspaceId) incidents = incidents.filter(i => i.workspaceId === workspaceId);
  if (state) incidents = incidents.filter(i => i.state === state);
  if (severity) incidents = incidents.filter(i => i.severity === severity);
  if (repositoryId) incidents = incidents.filter(i => i.repositoryId === repositoryId);

  const total = incidents.length;
  const items = incidents.slice(offset, offset + safeLimit);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1
  };
}

module.exports = {
  createIncidentRecord,
  createIncident: createIncidentRecord,
  updateIncidentRecord,
  getIncidentById,
  listIncidents
};
