/**
 * APIFIX V2 — Phase 10: Repair Memory
 * 
 * Secure, anonymized persistent memory of verified repair strategies and failure patterns.
 * Strictly NEVER stores secrets, tokens, passwords, or raw user payloads.
 */

const fs = require('fs');
const path = require('path');
const { sanitizeSecrets } = require('./securitySanitizer');

const MEMORY_FILE = path.join(__dirname, '..', '..', 'data', 'repair_memory.json');

// In-memory fallback
let memoryCache = [];

/**
 * Initializes and loads repair memory from storage.
 */
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf8');
      memoryCache = JSON.parse(data);
    }
  } catch (err) {
    memoryCache = [];
  }
  return memoryCache;
}

/**
 * Persists memory cache to disk safely.
 */
function persistMemory() {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryCache, null, 2), 'utf8');
  } catch (err) {
    // Non-fatal fallback
  }
}

/**
 * Records a verified repair pattern into memory.
 * 
 * @param {Object} entry
 * @param {string} entry.failureType - Failure category
 * @param {string} entry.rootCausePattern - Abstracted root cause pattern
 * @param {string} [entry.framework='Node/Express'] - Technology framework
 * @param {string} entry.repairStrategy - Applied repair strategy
 * @param {string} [entry.verification='PASSED'] - Verification outcome
 * @param {Object} [entry.metadata] - Anonymized metadata (strictly scrubbed)
 * @returns {Object} Stored sanitized memory record
 */
function recordRepairPattern({
  failureType,
  rootCausePattern,
  framework = 'Node/Express',
  repairStrategy,
  verification = 'PASSED',
  metadata = {}
}) {
  loadMemory();

  const record = sanitizeSecrets({
    id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    failureType: failureType || 'RUNTIME_ERROR',
    rootCausePattern: rootCausePattern || 'UNHANDLED_EXCEPTION',
    framework,
    repairStrategy: repairStrategy || 'APPLY_TARGETED_GUARD',
    verification,
    timestamp: new Date().toISOString()
  });

  memoryCache.push(record);
  persistMemory();

  return record;
}

/**
 * Retrieves all stored repair patterns.
 * @returns {Array<Object>}
 */
function getAllPatterns() {
  return loadMemory();
}

/**
 * Clears memory cache (for tests).
 */
function clearMemory() {
  memoryCache = [];
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      fs.unlinkSync(MEMORY_FILE);
    }
  } catch (e) {}
}

module.exports = {
  recordRepairPattern,
  getAllPatterns,
  clearMemory
};
