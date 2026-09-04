/**
 * APIFIX AI — Enterprise API Key Management Service
 * 
 * Provides cryptographically secure API key generation, SHA-256 hashing,
 * fine-grained scope authorization, lifecycle management (rotation/revocation),
 * and immutable Phase 20 audit logging.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const auditLedgerService = require('./auditLedgerService');
const { sanitizeSecrets } = require('./securitySanitizer');

const DATA_DIR = path.resolve(__dirname, '../../data');
const API_KEYS_FILE = path.join(DATA_DIR, 'api_keys.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

function readApiKeys() {
  try {
    if (fs.existsSync(API_KEYS_FILE)) {
      const content = fs.readFileSync(API_KEYS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('[ApiKeyService] Read error:', e.message);
  }
  return [];
}

function writeApiKeys(keys) {
  try {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
  } catch (e) {
    console.error('[ApiKeyService] Write error:', e.message);
  }
}

/**
 * Standard Available API Scopes
 */
const AVAILABLE_SCOPES = [
  'projects:read',
  'projects:write',
  'read:projects',
  'write:projects',
  'incidents:read',
  'incidents:write',
  'read:incidents',
  'write:incidents',
  'runs:read',
  'runs:create',
  'runs:write',
  'read:runs',
  'write:runs',
  'repairs:read',
  'repairs:execute',
  'repairs:write',
  'read:repairs',
  'write:repairs',
  'verify:all',
  'verification:verify',
  'webhooks:manage',
  'read:webhooks',
  'write:webhooks',
  'audit:read',
  'read:audit',
  'billing:read',
  'read:billing',
  'read:all',
  'write:all',
  'admin:all',
  'admin:*',
  '*'
];

/**
 * Hashes raw API key with SHA-256
 */
function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Create a new API Key
 * Returns key record + rawSecret (strictly displayed once)
 */
async function createApiKey({
  name,
  organizationId,
  orgId,
  workspaceId,
  scopes = ['projects:read', 'incidents:read', 'runs:read'],
  role = 'DEVELOPER',
  expiresInDays = 365,
  isTest = false,
  environment = 'live',
  actor = {}
}) {
  if (!name || !name.trim()) {
    throw new Error('API Key name is required.');
  }

  const isTestMode = isTest || environment === 'test';
  const prefix = isTestMode ? 'apifix_test_' : 'apifix_live_';
  const randomSecret = crypto.randomBytes(24).toString('hex');
  const rawKey = `${prefix}${randomSecret}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, 16) + '...';

  const now = new Date();
  const expiresAt = expiresInDays ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const validScopes = scopes && scopes.length > 0 ? scopes : ['projects:read'];

  const apiKeyRecord = {
    id: `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    name: name.trim(),
    keyPrefix,
    keyHash,
    organizationId: organizationId || orgId || 'org_enterprise_primary',
    workspaceId: workspaceId || 'ws_demo_primary',
    scopes: validScopes,
    role: role || 'DEVELOPER',
    expiresAt,
    revokedAt: null,
    createdAt: now.toISOString(),
    createdBy: {
      id: actor.id || 'usr_anonymous',
      email: actor.email || 'developer@apifix.ai',
      name: actor.name || 'System User'
    },
    lastUsedAt: null,
    lastUsedIp: null
  };

  const keys = readApiKeys();
  keys.push(apiKeyRecord);
  writeApiKeys(keys);

  // Record immutable audit event
  try {
    await auditLedgerService.recordEvent({
      organizationId: apiKeyRecord.organizationId,
      workspaceId: apiKeyRecord.workspaceId,
      action: 'API_KEY_CREATED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'API_KEY',
      resourceId: apiKeyRecord.id,
      metadata: {
        keyName: apiKeyRecord.name,
        keyPrefix: apiKeyRecord.keyPrefix,
        scopes: apiKeyRecord.scopes,
        role: apiKeyRecord.role,
        expiresAt: apiKeyRecord.expiresAt
      }
    });
  } catch (e) {
    console.warn('[ApiKeyService] Audit record warning:', e.message);
  }  const sanitizedKey = sanitizeSecrets({
    id: apiKeyRecord.id,
    name: apiKeyRecord.name,
    keyPrefix: apiKeyRecord.keyPrefix,
    organizationId: apiKeyRecord.organizationId,
    workspaceId: apiKeyRecord.workspaceId,
    scopes: apiKeyRecord.scopes,
    role: apiKeyRecord.role,
    expiresAt: apiKeyRecord.expiresAt,
    createdAt: apiKeyRecord.createdAt,
    createdBy: apiKeyRecord.createdBy,
    status: 'ACTIVE'
  });

  return {
    apiKey: sanitizedKey,
    rawSecret: rawKey,
    keyId: apiKeyRecord.id,
    rawKey,
    prefix: apiKeyRecord.keyPrefix,
    scopes: apiKeyRecord.scopes,
    status: 'ACTIVE'
  };
}

/**
 * Validates a raw API Key against stored hashes
 */
function validateApiKey(rawKey, clientIp = null) {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('apifix_')) {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }

  const computedHash = hashApiKey(rawKey);
  const keys = readApiKeys();
  const keyRecord = keys.find(k => k.keyHash === computedHash);

  if (!keyRecord) {
    return { valid: false, reason: 'KEY_NOT_FOUND' };
  }

  if (keyRecord.revokedAt) {
    return { valid: false, reason: 'KEY_REVOKED', revokedAt: keyRecord.revokedAt };
  }

  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    return { valid: false, reason: 'KEY_EXPIRED', expiresAt: keyRecord.expiresAt };
  }

  // Update last used metadata asynchronously
  keyRecord.lastUsedAt = new Date().toISOString();
  if (clientIp) keyRecord.lastUsedIp = clientIp;
  writeApiKeys(keys);

  const sanitized = {
    id: keyRecord.id,
    name: keyRecord.name,
    orgId: keyRecord.organizationId,
    organizationId: keyRecord.organizationId,
    workspaceId: keyRecord.workspaceId,
    scopes: keyRecord.scopes,
    role: keyRecord.role,
    expiresAt: keyRecord.expiresAt,
    createdAt: keyRecord.createdAt
  };

  return {
    valid: true,
    key: sanitized,
    keyRecord: sanitized
  };
}

/**
 * Normalizes scope strings (e.g. read:projects <-> projects:read)
 */
function normalizeScope(scope) {
  if (!scope) return '';
  if (scope.includes(':')) {
    const [a, b] = scope.split(':');
    if (['read', 'write', 'create', 'execute', 'delete'].includes(a)) {
      return `${b}:${a}`;
    }
  }
  return scope;
}

/**
 * Checks if key has required scope
 */
function hasScope(keyScopes, requiredScope) {
  if (!keyScopes || !Array.isArray(keyScopes)) return false;
  if (keyScopes.includes('admin:*') || keyScopes.includes('*') || keyScopes.includes('admin:all') || keyScopes.includes('read:all') && requiredScope.includes('read')) return true;
  if (keyScopes.includes(requiredScope)) return true;

  const normalizedRequired = normalizeScope(requiredScope);
  const normalizedKeyScopes = keyScopes.map(normalizeScope);

  if (normalizedKeyScopes.includes(normalizedRequired)) return true;

  // Wildcard subscope matching (e.g. 'projects:*' matches 'projects:read')
  const [resource] = requiredScope.split(':');
  if (keyScopes.includes(`${resource}:*`) || keyScopes.includes(`${resource}:all`)) return true;

  return false;
}

function hasRequiredScopes(keyScopes, requiredScopes = []) {
  if (!requiredScopes || requiredScopes.length === 0) return true;
  return requiredScopes.every(reqScope => hasScope(keyScopes, reqScope));
}

/**
 * List API keys for an organization or workspace
 */
function listApiKeys({ organizationId, workspaceId }) {
  const keys = readApiKeys();
  let filtered = keys;

  if (organizationId) {
    filtered = filtered.filter(k => k.organizationId === organizationId);
  }
  if (workspaceId) {
    filtered = filtered.filter(k => k.workspaceId === workspaceId);
  }

  return filtered.map(k => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    organizationId: k.organizationId,
    workspaceId: k.workspaceId,
    scopes: k.scopes,
    role: k.role,
    expiresAt: k.expiresAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
    createdBy: k.createdBy,
    lastUsedAt: k.lastUsedAt,
    lastUsedIp: k.lastUsedIp,
    status: k.revokedAt ? 'REVOKED' : (k.expiresAt && new Date(k.expiresAt) < new Date() ? 'EXPIRED' : 'ACTIVE')
  }));
}

/**
 * Revoke an API key
 */
async function revokeApiKey(keyId, actor = {}) {
  const keys = readApiKeys();
  const key = keys.find(k => k.id === keyId);

  if (!key) {
    throw new Error(`API key with ID ${keyId} not found.`);
  }

  if (key.revokedAt) {
    return { success: true, keyId, status: 'REVOKED', message: 'API key is already revoked.' };
  }

  key.revokedAt = new Date().toISOString();
  writeApiKeys(keys);

  try {
    await auditLedgerService.recordEvent({
      organizationId: key.organizationId,
      workspaceId: key.workspaceId,
      action: 'API_KEY_REVOKED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'API_KEY',
      resourceId: key.id,
      metadata: { keyName: key.name, keyPrefix: key.keyPrefix }
    });
  } catch (e) {}

  return { success: true, keyId, status: 'REVOKED', revokedAt: key.revokedAt };
}

/**
 * Rotate an API key (revokes old key, creates new one with identical metadata/scopes)
 */
async function rotateApiKey(keyId, actor = {}) {
  const keys = readApiKeys();
  const oldKey = keys.find(k => k.id === keyId);

  if (!oldKey) {
    throw new Error(`API key with ID ${keyId} not found.`);
  }

  // Revoke old key
  oldKey.revokedAt = new Date().toISOString();
  writeApiKeys(keys);

  // Generate new key
  const newKeyResult = await createApiKey({
    name: `${oldKey.name} (Rotated)`,
    organizationId: oldKey.organizationId,
    workspaceId: oldKey.workspaceId,
    scopes: oldKey.scopes,
    role: oldKey.role,
    isTest: oldKey.keyPrefix.startsWith('apifix_test_'),
    actor
  });

  try {
    await auditLedgerService.recordEvent({
      organizationId: oldKey.organizationId,
      workspaceId: oldKey.workspaceId,
      action: 'API_KEY_ROTATED',
      actorId: actor.id || 'usr_anonymous',
      actorEmail: actor.email || 'system',
      resourceType: 'API_KEY',
      resourceId: oldKey.id,
      metadata: {
        oldKeyId: oldKey.id,
        newKeyId: newKeyResult.apiKey.id,
        keyPrefix: newKeyResult.apiKey.keyPrefix
      }
    });
  } catch (e) {}

  return {
    oldKeyId: oldKey.id,
    newApiKey: newKeyResult.apiKey,
    rawSecret: newKeyResult.rawSecret,
    newKey: newKeyResult
  };
}

module.exports = {
  createApiKey,
  validateApiKey,
  hasScope,
  hasRequiredScopes,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  hashApiKey,
  AVAILABLE_SCOPES
};
