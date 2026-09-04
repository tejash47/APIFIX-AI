const { updateProjectRun, getProjectRun } = require('./projectStore');
const { sanitizeSecrets } = require('./securitySanitizer');

/**
 * Canonical deterministic Run States for APIFIX
 */
const RunState = Object.freeze({
  QUEUED: 'QUEUED',
  DETECTED: 'DETECTED',
  INVESTIGATING: 'INVESTIGATING',
  ROOT_CAUSE: 'ROOT_CAUSE',
  PATCHING: 'PATCHING',
  TESTING: 'TESTING',
  VERIFIED: 'VERIFIED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMEOUT: 'TIMEOUT'
});

/**
 * Ordered happy-path progression pipeline
 */
const PIPELINE_ORDER = [
  RunState.QUEUED,
  RunState.DETECTED,
  RunState.INVESTIGATING,
  RunState.ROOT_CAUSE,
  RunState.PATCHING,
  RunState.TESTING,
  RunState.VERIFIED,
  RunState.COMPLETED
];

/**
 * Allowed state transitions
 */
const ALLOWED_TRANSITIONS = {
  [RunState.QUEUED]: [RunState.DETECTED, RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT],
  [RunState.DETECTED]: [RunState.INVESTIGATING, RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT],
  [RunState.INVESTIGATING]: [RunState.ROOT_CAUSE, RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT],
  [RunState.ROOT_CAUSE]: [RunState.PATCHING, RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT],
  [RunState.PATCHING]: [RunState.TESTING, RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT],
  [RunState.TESTING]: [RunState.VERIFIED, RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT],
  [RunState.VERIFIED]: [RunState.COMPLETED, RunState.TESTING, RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT],
  [RunState.COMPLETED]: [],
  [RunState.FAILED]: [RunState.QUEUED, RunState.DETECTED], // Retry allowed
  [RunState.CANCELLED]: [RunState.QUEUED, RunState.DETECTED], // Retry allowed
  [RunState.TIMEOUT]: [RunState.QUEUED, RunState.DETECTED] // Retry allowed
};

// In-memory timelines mapped by runId
const runTimelines = new Map();

/**
 * Validates if a state transition is legal
 * @param {string} currentState 
 * @param {string} nextState 
 * @returns {boolean}
 */
function isValidTransition(currentState, nextState) {
  if (!currentState) return true; // Initial creation
  if (currentState === nextState) return true; // Idempotent
  const allowed = ALLOWED_TRANSITIONS[currentState];
  return Array.isArray(allowed) && allowed.includes(nextState);
}

/**
 * Records a state transition with timeline event and backend persistence.
 * @param {string} runId 
 * @param {string} nextState 
 * @param {object} metadata - { event, details, durationMs, error }
 * @returns {Promise<object>} Updated run and timeline event
 */
async function transitionRunState(runId, nextState, metadata = {}) {
  if (!RunState[nextState]) {
    throw new Error(`Invalid run state: "${nextState}". Must be one of: ${Object.keys(RunState).join(', ')}`);
  }

  const sanitizedMeta = sanitizeSecrets(metadata);
  const now = new Date().toISOString();

  let timeline = runTimelines.get(runId);
  if (!timeline) {
    timeline = [];
    runTimelines.set(runId, timeline);
  }

  const lastEvent = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const stageDurationMs = lastEvent && lastEvent.timestamp
    ? Date.now() - new Date(lastEvent.timestamp).getTime()
    : (sanitizedMeta.durationMs || 0);

  const timelineEvent = {
    timestamp: now,
    stage: nextState,
    event: sanitizedMeta.event || `Transition to ${nextState}`,
    durationMs: stageDurationMs,
    status: [RunState.FAILED, RunState.CANCELLED, RunState.TIMEOUT].includes(nextState) ? 'FAILED' : 'SUCCESS',
    details: sanitizedMeta.details || sanitizedMeta.message || null,
    error: sanitizedMeta.error || null
  };

  timeline.push(timelineEvent);

  // Update persistent run record
  try {
    await updateProjectRun(runId, {
      status: nextState,
      updatedAt: now,
      timeline
    });
  } catch (err) {
    console.warn(`[RunStateMachine] Warning updating persistent store for run ${runId}:`, err.message);
  }

  return {
    runId,
    state: nextState,
    event: timelineEvent,
    timeline
  };
}

/**
 * Retrieves the full timeline for a run
 * @param {string} runId 
 * @returns {Array<object>}
 */
function getRunTimeline(runId) {
  return runTimelines.get(runId) || [];
}

/**
 * Initializes a new run in the state machine
 * @param {string} runId 
 * @param {string} initialState 
 * @param {object} initialDetails 
 */
async function initRunStateMachine(runId, initialState = RunState.QUEUED, initialDetails = {}) {
  runTimelines.set(runId, []);
  return transitionRunState(runId, initialState, {
    event: 'Run Initialized',
    details: initialDetails.message || 'Run registered in state machine.'
  });
}

module.exports = {
  RunState,
  PIPELINE_ORDER,
  isValidTransition,
  transitionRunState,
  getRunTimeline,
  initRunStateMachine
};
