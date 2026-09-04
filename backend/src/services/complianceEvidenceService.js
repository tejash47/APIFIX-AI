/**
 * APIFIX AI — Compliance Evidence Engine (Phase 20)
 * Automatically captures cryptographically hashed, secret-sanitized
 * evidence records across all operational, security, and governance activities.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sanitizeSecrets } = require('./securitySanitizer');

const DATA_DIR = path.resolve(__dirname, '../../data');
const EVIDENCE_FILE = path.join(DATA_DIR, 'compliance_evidence.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readJson(file, def = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return def;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

function computeEvidenceHash(payload) {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Records a compliance evidence item
 */
async function recordEvidence({
  controlId,
  organizationId = 'org_enterprise_primary',
  workspaceId = 'ws_default',
  actor = 'system',
  eventType,
  result = 'SUCCESS', // SUCCESS, FAILURE
  details = {}
}) {
  if (!controlId || !eventType) {
    throw new Error('controlId and eventType are required for compliance evidence.');
  }

  const sanitizedDetails = sanitizeSecrets(details);
  const now = new Date().toISOString();
  const id = `evi_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const canonicalPayload = {
    id,
    controlId,
    organizationId,
    workspaceId,
    actor,
    eventType,
    result,
    timestamp: now,
    details: sanitizedDetails
  };

  const evidenceHash = computeEvidenceHash(canonicalPayload);

  const evidenceRecord = {
    ...canonicalPayload,
    evidenceHash
  };

  const evidenceList = readJson(EVIDENCE_FILE, []);
  evidenceList.unshift(evidenceRecord);
  if (evidenceList.length > 5000) evidenceList.pop();
  writeJson(EVIDENCE_FILE, evidenceList);

  return evidenceRecord;
}

/**
 * Lists evidence records with filtering and pagination
 */
function listEvidence({ orgId, controlId, page = 1, limit = 20 }) {
  const evidenceList = readJson(EVIDENCE_FILE, []);
  let filtered = evidenceList;

  if (orgId) {
    filtered = filtered.filter(e => e.organizationId === orgId);
  }
  if (controlId) {
    filtered = filtered.filter(e => e.controlId === controlId);
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  return {
    items: filtered.slice(offset, offset + safeLimit),
    total: filtered.length,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(filtered.length / safeLimit) || 1
  };
}

/**
 * Verifies cryptographic integrity of an evidence item
 */
function verifyEvidenceIntegrity(evidenceId) {
  const evidenceList = readJson(EVIDENCE_FILE, []);
  const item = evidenceList.find(e => e.id === evidenceId);
  if (!item) return { valid: false, reason: 'Evidence item not found' };

  const { evidenceHash, ...canonical } = item;
  const recalculated = computeEvidenceHash(canonical);

  const isValid = (recalculated === evidenceHash);
  return {
    valid: isValid,
    evidenceId,
    storedHash: evidenceHash,
    computedHash: recalculated
  };
}

module.exports = {
  recordEvidence,
  listEvidence,
  verifyEvidenceIntegrity,
  computeEvidenceHash
};
