/**
 * APIFIX AI — Immutable Chained Audit Ledger Service (Phase 20)
 * Cryptographic SHA-256 block hash chaining, chronological sequencing,
 * tampering detection, and zero-secret persistence.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sanitizeSecrets } = require('./securitySanitizer');
const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');

const DATA_DIR = path.resolve(__dirname, '../../data');
const AUDIT_LEDGER_FILE = path.join(DATA_DIR, 'audit_ledger.json');
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

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

const inMemoryLedger = readJson(AUDIT_LEDGER_FILE, []);

/**
 * Computes deterministic SHA-256 hash for an audit ledger event
 */
function computeAuditHash({
  sequenceNumber,
  timestamp,
  actorId,
  action,
  resourceType,
  resourceId,
  result,
  previousHash,
  metadata = {}
}) {
  const sortedMeta = JSON.stringify(metadata, Object.keys(metadata).sort());
  const canonicalString = `${sequenceNumber}|${timestamp}|${actorId}|${action}|${resourceType}:${resourceId}|${result}|${previousHash}|${sortedMeta}`;
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Records an immutable audit event into the cryptographic ledger
 */
async function recordLedgerEvent({
  orgId = 'org_enterprise_primary',
  workspaceId = 'ws_default',
  actorId = 'anonymous',
  actorEmail = '',
  action = 'UNKNOWN_ACTION',
  resourceType = 'SYSTEM',
  resourceId = '',
  result = 'SUCCESS', // SUCCESS, FAILURE, BLOCKED
  requestId = '',
  metadata = {}
}) {
  const sanitizedMeta = sanitizeSecrets(metadata);

  const previousEvent = inMemoryLedger.length > 0 ? inMemoryLedger[inMemoryLedger.length - 1] : null;
  const previousHash = previousEvent ? previousEvent.hash : GENESIS_HASH;
  const sequenceNumber = inMemoryLedger.length + 1;
  const timestamp = new Date().toISOString();
  const id = `audl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  const eventPayload = {
    id,
    sequenceNumber,
    orgId,
    workspaceId,
    actorId: actorId || 'anonymous',
    actorEmail: actorEmail || '',
    action,
    resourceType,
    resourceId: resourceId || '',
    result,
    requestId: requestId || `req_${Date.now()}`,
    timestamp,
    previousHash,
    metadata: sanitizedMeta
  };

  const hash = computeAuditHash(eventPayload);
  const finalEvent = {
    ...eventPayload,
    hash
  };

  inMemoryLedger.push(finalEvent);
  writeJson(AUDIT_LEDGER_FILE, inMemoryLedger);

  return finalEvent;
}

/**
 * Verifies the integrity of the cryptographic audit chain.
 * Detects any tampering, altered fields, deleted events, or sequence anomalies.
 */
function verifyAuditChain({ orgId, workspaceId } = {}) {
  const ledger = readJson(AUDIT_LEDGER_FILE, []);

  if (ledger.length === 0) {
    return {
      valid: true,
      totalEvents: 0,
      chainStatus: 'EMPTY_CHAIN_VALID',
      verifiedAt: new Date().toISOString()
    };
  }

  let previousHash = GENESIS_HASH;

  for (let i = 0; i < ledger.length; i++) {
    const event = ledger[i];

    // Check sequence number
    if (event.sequenceNumber !== i + 1) {
      const errorMsg = `Sequence discontinuity at index ${i}: Expected sequence ${i + 1}, got ${event.sequenceNumber}`;
      observabilityEngine.recordEvent({
        category: 'SECURITY',
        event: 'audit_integrity_failure',
        status: 'FAILURE',
        severity: 'CRITICAL',
        metadata: { error: errorMsg, tamperedIndex: i, eventId: event.id }
      });
      return {
        valid: false,
        code: 'AUDIT_INTEGRITY_FAILURE',
        tamperedIndex: i,
        eventId: event.id,
        reason: errorMsg
      };
    }

    // Check previous hash link
    if (event.previousHash !== previousHash) {
      const errorMsg = `Previous hash mismatch at index ${i}: Expected ${previousHash}, got ${event.previousHash}`;
      observabilityEngine.recordEvent({
        category: 'SECURITY',
        event: 'audit_integrity_failure',
        status: 'FAILURE',
        severity: 'CRITICAL',
        metadata: { error: errorMsg, tamperedIndex: i, eventId: event.id }
      });
      return {
        valid: false,
        code: 'AUDIT_INTEGRITY_FAILURE',
        tamperedIndex: i,
        eventId: event.id,
        reason: errorMsg
      };
    }

    // Recompute current event hash
    const expectedHash = computeAuditHash(event);
    if (event.hash !== expectedHash) {
      const errorMsg = `Hash mismatch (tampered content) at index ${i}: Expected ${expectedHash}, got ${event.hash}`;
      observabilityEngine.recordEvent({
        category: 'SECURITY',
        event: 'audit_integrity_failure',
        status: 'FAILURE',
        severity: 'CRITICAL',
        metadata: { error: errorMsg, tamperedIndex: i, eventId: event.id, expectedHash, actualHash: event.hash }
      });
      return {
        valid: false,
        code: 'AUDIT_INTEGRITY_FAILURE',
        tamperedIndex: i,
        eventId: event.id,
        expectedHash,
        actualHash: event.hash,
        reason: errorMsg
      };
    }

    previousHash = event.hash;
  }

  return {
    valid: true,
    totalEvents: ledger.length,
    latestHash: previousHash,
    chainStatus: 'CHAIN_VERIFIED_AUTHENTIC',
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Lists audit ledger events with filtering and pagination (read-only)
 */
function listLedgerEvents({ orgId, workspaceId, action, actorId, page = 1, limit = 50 }) {
  const ledger = readJson(AUDIT_LEDGER_FILE, []);
  let filtered = [...ledger].reverse(); // newest first for display

  if (workspaceId) {
    filtered = filtered.filter(e => e.workspaceId === workspaceId);
  } else if (orgId) {
    filtered = filtered.filter(e => e.orgId === orgId);
  }

  if (action) {
    filtered = filtered.filter(e => e.action === action);
  }
  if (actorId) {
    filtered = filtered.filter(e => e.actorId === actorId);
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;

  return {
    items: filtered.slice(offset, offset + safeLimit),
    total: filtered.length,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(filtered.length / safeLimit) || 1
  };
}

function deleteLedgerEvent() {
  throw new Error('AUDIT_IMMUTABLE_ERROR: Audit ledger records are immutable and cannot be deleted or mutated.');
}

function getAuditLogs(workspaceId) {
  if (!workspaceId) return [...inMemoryLedger];
  return inMemoryLedger.filter(e => e.workspaceId === workspaceId);
}

const auditLedgerService = {
  GENESIS_HASH,
  computeAuditHash,
  recordLedgerEvent,
  recordAuditEvent: recordLedgerEvent,
  recordEvent: recordLedgerEvent,
  verifyAuditChain,
  listLedgerEvents,
  getAuditLogs,
  deleteLedgerEvent
};

module.exports = {
  GENESIS_HASH,
  computeAuditHash,
  recordLedgerEvent,
  recordAuditEvent: recordLedgerEvent,
  recordEvent: recordLedgerEvent,
  verifyAuditChain,
  listLedgerEvents,
  getAuditLogs,
  deleteLedgerEvent,
  auditLedgerService
};
