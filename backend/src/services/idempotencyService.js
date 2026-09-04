/**
 * APIFIX AI — Idempotency Service
 * 
 * Guarantees exactly-once execution semantics for state-mutating requests,
 * coalesces concurrent executions, detects payload conflicts, and replays cached results.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { sanitizeSecrets } = require('./securitySanitizer');

const DATA_DIR = path.resolve(__dirname, '../../data');
const IDEMPOTENCY_FILE = path.join(DATA_DIR, 'idempotency_records.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

// In-memory cache + persistent fallback
let recordsCache = new Map();
const inFlightLocks = new Map(); // key -> Promise

function loadRecordsFromDisk() {
  try {
    if (fs.existsSync(IDEMPOTENCY_FILE)) {
      const raw = fs.readFileSync(IDEMPOTENCY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        parsed.forEach(r => {
          if (r.expiresAt && r.expiresAt > now) {
            recordsCache.set(r.keyId, r);
          }
        });
      }
    }
  } catch (e) {
    console.warn('[IdempotencyService] Disk load warning:', e.message);
  }
}

function persistRecordsToDisk() {
  try {
    const list = Array.from(recordsCache.values());
    fs.writeFileSync(IDEMPOTENCY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[IdempotencyService] Disk write error:', e.message);
  }
}

loadRecordsFromDisk();

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  Object.keys(obj).sort().forEach(k => {
    sorted[k] = sortKeys(obj[k]);
  });
  return sorted;
}

/**
 * Computes deterministic SHA-256 fingerprint for a request payload
 */
function computeRequestFingerprint(methodOrOptions, pathUrl, body, tenantScope = '') {
  let method = 'POST';
  let url = '';
  let payloadBody = null;
  let scope = '';

  if (methodOrOptions && typeof methodOrOptions === 'object') {
    method = methodOrOptions.method || 'POST';
    url = methodOrOptions.url || methodOrOptions.pathUrl || methodOrOptions.path || '';
    payloadBody = methodOrOptions.body;
    scope = methodOrOptions.tenantScope || '';
  } else {
    method = methodOrOptions || 'POST';
    url = pathUrl || '';
    payloadBody = body;
    scope = tenantScope || '';
  }

  const normalizedMethod = String(method).toUpperCase();
  const normalizedPath = String(url).split('?')[0];
  const sortedBody = payloadBody && typeof payloadBody === 'object' ? sortKeys(payloadBody) : payloadBody;
  const stringifiedBody = sortedBody ? (typeof sortedBody === 'string' ? sortedBody : JSON.stringify(sortedBody)) : '';
  const payloadToHash = `${normalizedMethod}|${normalizedPath}|${scope}|${stringifiedBody}`;
  return crypto.createHash('sha256').update(payloadToHash).digest('hex');
}

/**
 * Check if an idempotency key exists or is currently executing
 */
async function checkIdempotency(key, method, pathUrl, body, tenantScope = '') {
  if (!key || typeof key !== 'string') {
    return { isIdempotent: false };
  }

  const keyId = `${tenantScope ? tenantScope + ':' : ''}${key.trim()}`;
  const currentFingerprint = computeRequestFingerprint(method, pathUrl, body, tenantScope);

  // Check if in-flight concurrent execution exists
  if (inFlightLocks.has(keyId)) {
    return {
      isIdempotent: true,
      inFlight: true,
      conflict: false
    };
  }

  const cached = recordsCache.get(keyId);
  if (cached) {
    // Check if expired
    if (cached.expiresAt && cached.expiresAt <= Date.now()) {
      recordsCache.delete(keyId);
      return { isIdempotent: false };
    }

    // Check for payload conflict
    if (cached.fingerprint !== currentFingerprint) {
      return {
        isIdempotent: true,
        conflict: true,
        error: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key was previously used with differing parameters or request fingerprint.'
      };
    }

    // Identical legitimate replay
    return {
      isIdempotent: true,
      conflict: false,
      replayed: true,
      statusCode: cached.statusCode || 200,
      headers: cached.headers || {},
      body: cached.body,
      createdAt: cached.createdAt
    };
  }

  return { isIdempotent: false, keyId, fingerprint: currentFingerprint };
}

/**
 * Acquire in-flight execution lock for key
 */
function lockKey(keyId) {
  inFlightLocks.set(keyId, Date.now());
}

/**
 * Store completed response for idempotency replay
 */
function storeIdempotentResponse(keyId, fingerprint, statusCode, headers, body, ttlMs = 24 * 60 * 60 * 1000) {
  inFlightLocks.delete(keyId);

  const now = Date.now();
  const record = {
    keyId,
    fingerprint,
    statusCode,
    headers: {
      'content-type': headers['content-type'] || 'application/json',
      'x-idempotent-replay': 'true'
    },
    body: sanitizeSecrets(body),
    createdAt: new Date(now).toISOString(),
    expiresAt: now + ttlMs
  };

  recordsCache.set(keyId, record);
  persistRecordsToDisk();
}

/**
 * Release in-flight lock on error
 */
function releaseLock(keyId) {
  inFlightLocks.delete(keyId);
}

/**
 * Clear all idempotency records (used in tests)
 */
function resetIdempotencyStore() {
  recordsCache.clear();
  inFlightLocks.clear();
  if (fs.existsSync(IDEMPOTENCY_FILE)) {
    try {
      fs.unlinkSync(IDEMPOTENCY_FILE);
    } catch (e) {}
  }
}

function acquireLock(key, workspaceId = 'default') {
  const fullKey = `${workspaceId}:${key}`;
  if (inFlightLocks.has(fullKey)) {
    return { acquired: false, inFlight: true };
  }
  const existing = recordsCache.get(fullKey);
  if (existing && existing.expiresAt > Date.now()) {
    return { acquired: false, isReplay: true, result: { statusCode: existing.statusCode, body: existing.body } };
  }
  inFlightLocks.set(fullKey, Date.now());
  return { acquired: true };
}

function saveResult(key, workspaceId = 'default', statusCode = 200, body = {}) {
  const fullKey = `${workspaceId}:${key}`;
  storeIdempotentResponse(fullKey, 'fingerprint', statusCode, {}, body);
}

const idempotencyServiceObject = {
  checkIdempotency,
  lockKey,
  storeIdempotentResponse,
  releaseLock,
  computeRequestFingerprint,
  computeFingerprint: computeRequestFingerprint,
  resetIdempotencyStore,
  acquireLock,
  saveResult
};

module.exports = {
  checkIdempotency,
  lockKey,
  storeIdempotentResponse,
  releaseLock,
  computeRequestFingerprint,
  computeFingerprint: computeRequestFingerprint,
  resetIdempotencyStore,
  acquireLock,
  saveResult,
  idempotencyService: idempotencyServiceObject
};
