/**
 * APIFIX AI — Enterprise Feature Flags & Safe Rollout System (Phase 22)
 * 
 * Supports hierarchical scopes (GLOBAL, ORGANIZATION, WORKSPACE, USER),
 * deterministic percentage-based rollouts, RBAC protection, and full audit logging.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { recordAuditEvent } = require('./auditLedgerService');

const DATA_DIR = path.resolve(__dirname, '../../data');
const FLAGS_FILE = path.join(DATA_DIR, 'feature_flags.json');

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readJson(file, def = []) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return def;
}

function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

const DEFAULT_FLAGS = [
  {
    name: 'autonomous_repair_v22',
    description: 'Enables advanced autonomous patch synthesis and bounded self-healing',
    enabled: true,
    scope: 'GLOBAL',
    rolloutPercentage: 100,
    targetEntities: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    actorId: 'system_init'
  },
  {
    name: 'finops_predictive_budgeting',
    description: 'Enables predictive budget burn-rate tracking and anomaly alerts',
    enabled: true,
    scope: 'GLOBAL',
    rolloutPercentage: 100,
    targetEntities: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    actorId: 'system_init'
  },
  {
    name: 'persistent_job_queue_v22',
    description: 'Routes background repair workloads through the durable job queue',
    enabled: true,
    scope: 'GLOBAL',
    rolloutPercentage: 100,
    targetEntities: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    actorId: 'system_init'
  }
];

class FeatureFlagService {
  constructor() {
    this._initDefaultFlags();
  }

  _initDefaultFlags() {
    const existing = readJson(FLAGS_FILE, []);
    if (existing.length === 0) {
      writeJson(FLAGS_FILE, DEFAULT_FLAGS);
    }
  }

  /**
   * Deterministically evaluates if a flag is active for a specific entity context.
   */
  isEnabled(flagName, context = {}) {
    const flags = readJson(FLAGS_FILE, DEFAULT_FLAGS);
    const flag = flags.find(f => f.name === flagName);

    if (!flag) return false;
    if (!flag.enabled) return false;

    // Entity targeting
    const entityId = context.userId || context.workspaceId || context.orgId || 'global_user';
    if (flag.targetEntities && flag.targetEntities.includes(entityId)) {
      return true;
    }

    // Scope check
    if (flag.scope === 'ORGANIZATION' && context.orgId) {
      if (flag.targetEntities && !flag.targetEntities.includes(context.orgId)) return false;
    } else if (flag.scope === 'WORKSPACE' && context.workspaceId) {
      if (flag.targetEntities && !flag.targetEntities.includes(context.workspaceId)) return false;
    }

    // Percentage Rollout (Deterministic SHA-256 hash modulo 100)
    if (flag.rolloutPercentage < 100) {
      const hash = crypto.createHash('sha256').update(`${flagName}:${entityId}`).digest('hex');
      const bucket = parseInt(hash.substring(0, 4), 16) % 100;
      return bucket < flag.rolloutPercentage;
    }

    return true;
  }

  listFlags() {
    return readJson(FLAGS_FILE, DEFAULT_FLAGS);
  }

  getFlag(flagName) {
    const flags = readJson(FLAGS_FILE, DEFAULT_FLAGS);
    return flags.find(f => f.name === flagName) || null;
  }

  async setFlag(flagData, actor = { id: 'admin', role: 'ADMIN' }) {
    const flags = readJson(FLAGS_FILE, DEFAULT_FLAGS);
    const idx = flags.findIndex(f => f.name === flagData.name);
    const now = new Date().toISOString();

    let updatedFlag;
    if (idx !== -1) {
      updatedFlag = {
        ...flags[idx],
        ...flagData,
        updatedAt: now,
        actorId: actor.id
      };
      flags[idx] = updatedFlag;
    } else {
      updatedFlag = {
        name: flagData.name,
        description: flagData.description || '',
        enabled: flagData.enabled !== undefined ? flagData.enabled : true,
        scope: flagData.scope || 'GLOBAL',
        rolloutPercentage: flagData.rolloutPercentage !== undefined ? flagData.rolloutPercentage : 100,
        targetEntities: flagData.targetEntities || [],
        createdAt: now,
        updatedAt: now,
        actorId: actor.id
      };
      flags.push(updatedFlag);
    }

    writeJson(FLAGS_FILE, flags);

    logger.info('feature_flag_updated', {
      name: updatedFlag.name,
      enabled: updatedFlag.enabled,
      actor: actor.id
    });

    try {
      recordAuditEvent({
        workspaceId: 'global',
        eventType: 'FEATURE_FLAG_MUTATED',
        actor,
        details: updatedFlag
      });
    } catch {}

    return updatedFlag;
  }

  setGlobalFlag(name, enabled = true) {
    return this.setFlag({
      name,
      enabled,
      scope: 'GLOBAL',
      rolloutPercentage: 100
    });
  }

  async deleteFlag(flagName, actor = { id: 'admin' }) {
    let flags = readJson(FLAGS_FILE, DEFAULT_FLAGS);
    const beforeLen = flags.length;
    flags = flags.filter(f => f.name !== flagName);

    if (flags.length !== beforeLen) {
      writeJson(FLAGS_FILE, flags);
      try {
        recordAuditEvent({
          workspaceId: 'global',
          eventType: 'FEATURE_FLAG_DELETED',
          actor,
          details: { flagName }
        });
      } catch {}
      return { success: true };
    }
    return { success: false, message: 'Flag not found' };
  }
}

const featureFlagService = new FeatureFlagService();

module.exports = {
  featureFlagService
};
