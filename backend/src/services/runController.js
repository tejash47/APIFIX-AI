/**
 * APIFIX AI — Autonomous Run Controller & Concurrency Lock Manager (Phase 18)
 * Manages active run lifecycles, graceful cancellation, abort signals,
 * target locking, per-workspace concurrency limits, and auto-expiring lock TTLs.
 */

const { RunState, transitionRunState } = require('./runStateMachine');
const { stopProcess } = require('./processManager');
const { rollbackAllWorkspacePatches } = require('../tools/controlledTools');
const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');

const MAX_GLOBAL_CONCURRENT_RUNS = parseInt(process.env.MAX_GLOBAL_CONCURRENT_RUNS || '10', 10);
const MAX_WORKSPACE_CONCURRENT_RUNS = parseInt(process.env.MAX_WORKSPACE_CONCURRENT_RUNS || '3', 10);
const RUN_LOCK_TTL_MS = parseInt(process.env.RUN_LOCK_TTL_MS || '900000', 10); // 15 mins

/**
 * Registry of active runs:
 * runId -> {
 *   runId,
 *   workspaceId,
 *   targetKey,
 *   workspacePath,
 *   abortController,
 *   cleanupHandlers: Array<Function>,
 *   startedAt,
 *   expiresAt,
 *   status
 * }
 */
const activeRuns = new Map();

/**
 * Lock map to prevent duplicate active runs on the same project/workspace:
 * targetKey -> { runId, expiresAt, workspaceId }
 */
const targetLocks = new Map();

/**
 * Checks and cleans up any expired locks before registering new runs
 */
function cleanupStaleRunLocks(maxAgeMs = RUN_LOCK_TTL_MS) {
  const now = Date.now();
  const cleaned = [];

  for (const [key, lock] of targetLocks.entries()) {
    const lockAge = lock.expiresAt ? (now - (lock.expiresAt - RUN_LOCK_TTL_MS)) : 0;
    if (lock.expiresAt && (now >= lock.expiresAt || lockAge >= maxAgeMs)) {
      targetLocks.delete(key);
      cleaned.push(key);
    }
  }

  for (const [runId, runMeta] of activeRuns.entries()) {
    const runAge = runMeta.expiresAt ? (now - (runMeta.expiresAt - RUN_LOCK_TTL_MS)) : 0;
    if (runMeta.expiresAt && (now >= runMeta.expiresAt || runAge >= maxAgeMs) && runMeta.status === 'RUNNING') {
      runMeta.status = 'TIMED_OUT';
      if (runMeta.targetKey) {
        targetLocks.delete(runMeta.targetKey);
      }
      activeRuns.delete(runId);
    }
  }

  return cleaned;
}

/**
 * Registers an active run and acquires a target lock with concurrency limit enforcement.
 * @param {string} runId 
 * @param {string} targetKey - Unique identifier for the target (e.g. projectId or endpoint)
 * @param {string} workspacePath - Path to working workspace
 * @param {string} [workspaceId] - Workspace identifier for tenant scoping
 * @returns {AbortController} Abort controller for the run
 * @throws {Error} if concurrency limits are exceeded or target is locked
 */
function registerActiveRun(runId, targetKey, workspacePath, workspaceId = 'system') {
  cleanupStaleRunLocks();

  // 1. Global Concurrency Limit Check
  const runningCount = Array.from(activeRuns.values()).filter(r => r.status === 'RUNNING').length;
  if (runningCount >= MAX_GLOBAL_CONCURRENT_RUNS) {
    const err = new Error(`GLOBAL_CONCURRENCY_LIMIT: Server has reached maximum concurrent repair capacity (${MAX_GLOBAL_CONCURRENT_RUNS}). Please retry shortly.`);
    err.code = 'GLOBAL_CONCURRENCY_LIMIT';
    err.status = 429;
    err.retryAfterSeconds = 15;
    throw err;
  }

  // 2. Per-Workspace Concurrency Limit Check
  if (workspaceId && workspaceId !== 'system') {
    const wsActiveCount = Array.from(activeRuns.values()).filter(
      r => r.status === 'RUNNING' && r.workspaceId === workspaceId
    ).length;

    if (wsActiveCount >= MAX_WORKSPACE_CONCURRENT_RUNS) {
      const err = new Error(`WORKSPACE_CONCURRENCY_LIMIT: Workspace "${workspaceId}" has reached maximum concurrent repair limit (${MAX_WORKSPACE_CONCURRENT_RUNS}).`);
      err.code = 'WORKSPACE_CONCURRENCY_LIMIT';
      err.status = 429;
      err.retryAfterSeconds = 15;
      throw err;
    }
  }

  const normalizedKey = (targetKey || workspacePath || runId).replace(/\\/g, '/').toLowerCase();

  // 3. Duplicate Target Lock Check
  const existingLock = targetLocks.get(normalizedKey);
  if (existingLock && existingLock.runId !== runId) {
    const existingRun = activeRuns.get(existingLock.runId);
    if (existingRun && existingRun.status === 'RUNNING') {
      const lockErr = new Error(`CONFLICT: Target "${targetKey}" already has an active run in progress (${existingLock.runId}).`);
      lockErr.code = 'CONCURRENT_RUN_CONFLICT';
      lockErr.status = 409;
      lockErr.activeRunId = existingLock.runId;
      throw lockErr;
    }
  }

  const abortController = new AbortController();
  const now = Date.now();

  const runMeta = {
    runId,
    workspaceId,
    targetKey: normalizedKey,
    workspacePath,
    abortController,
    cleanupHandlers: [],
    startedAt: now,
    expiresAt: now + RUN_LOCK_TTL_MS,
    status: 'RUNNING'
  };

  activeRuns.set(runId, runMeta);
  targetLocks.set(normalizedKey, {
    runId,
    workspaceId,
    expiresAt: now + RUN_LOCK_TTL_MS
  });

  observabilityEngine.recordEvent({
    event: 'repair_run_registered',
    category: 'REPAIR',
    stage: 'STARTING',
    status: 'SUCCESS',
    workspaceId,
    metadata: {
      runId,
      targetKey: normalizedKey,
      globalInFlight: runningCount + 1
    }
  });

  return abortController;
}

/**
 * Registers a cleanup handler to run when the run terminates or is cancelled.
 * @param {string} runId 
 * @param {Function} handlerFn 
 */
function addRunCleanupHandler(runId, handlerFn) {
  const runMeta = activeRuns.get(runId);
  if (runMeta && typeof handlerFn === 'function') {
    runMeta.cleanupHandlers.push(handlerFn);
  }
}

/**
 * Cancels an active run, aborts in-flight requests, terminates child processes, rolls back patches.
 * @param {string} runId 
 * @param {string} reason 
 * @returns {Promise<object>} Result of cancellation
 */
async function cancelRun(runId, reason = 'Cancelled by user request.') {
  const runMeta = activeRuns.get(runId);

  if (!runMeta) {
    await transitionRunState(runId, RunState.CANCELLED, {
      event: 'Run Cancelled',
      details: reason
    });
    return { runId, status: RunState.CANCELLED, message: 'Run marked as cancelled.' };
  }

  runMeta.status = 'CANCELLED';

  // 1. Signal Abort
  if (runMeta.abortController && !runMeta.abortController.signal.aborted) {
    try {
      runMeta.abortController.abort();
    } catch (e) {}
  }

  // 2. Stop child processes
  try {
    await stopProcess(runId);
  } catch (e) {}

  // 3. Roll back any workspace patch modifications
  if (runMeta.workspacePath) {
    try {
      rollbackAllWorkspacePatches(runMeta.workspacePath);
    } catch (e) {}
  }

  // 4. Run registered cleanup handlers
  for (const handler of runMeta.cleanupHandlers) {
    try {
      await handler();
    } catch (e) {}
  }

  // 5. Release target lock
  if (runMeta.targetKey) {
    targetLocks.delete(runMeta.targetKey);
  }

  // 6. Transition state machine
  await transitionRunState(runId, RunState.CANCELLED, {
    event: 'Run Cancelled',
    details: reason
  });

  return {
    runId,
    status: RunState.CANCELLED,
    message: `Run ${runId} cancelled successfully.`
  };
}

/**
 * Unregisters a completed run and releases its target lock.
 * @param {string} runId 
 */
function unregisterActiveRun(runId) {
  const runMeta = activeRuns.get(runId);
  if (runMeta) {
    if (runMeta.targetKey) {
      targetLocks.delete(runMeta.targetKey);
    }
    activeRuns.delete(runId);
  }
}

/**
 * Checks if a run is currently active
 * @param {string} runId 
 * @returns {boolean}
 */
function isRunActive(runId) {
  const run = activeRuns.get(runId);
  return !!run && run.status === 'RUNNING';
}

/**
 * Gets active run metadata
 * @param {string} runId 
 */
function getActiveRunMeta(runId) {
  return activeRuns.get(runId) || null;
}

/**
 * Gets count of active runs
 * @param {string} [workspaceId]
 * @returns {number}
 */
function getActiveRunCount(filterKey) {
  if (!filterKey) {
    return Array.from(activeRuns.values()).filter(r => r.status === 'RUNNING').length;
  }
  let count = 0;
  for (const meta of activeRuns.values()) {
    if (meta.status === 'RUNNING') {
      if (
        meta.workspaceId === filterKey ||
        (meta.workspacePath && meta.workspacePath.includes(filterKey)) ||
        (meta.targetKey && meta.targetKey.includes(filterKey.toLowerCase()))
      ) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Resets all active runs and target locks (for testing purposes)
 */
function resetActiveRuns() {
  activeRuns.clear();
  targetLocks.clear();
}

module.exports = {
  MAX_GLOBAL_CONCURRENT_RUNS,
  MAX_WORKSPACE_CONCURRENT_RUNS,
  registerActiveRun,
  addRunCleanupHandler,
  cancelRun,
  unregisterActiveRun,
  isRunActive,
  getActiveRunMeta,
  getActiveRunCount,
  cleanupStaleRunLocks,
  resetActiveRuns,
  _activeRuns: activeRuns,
  _targetLocks: targetLocks
};
