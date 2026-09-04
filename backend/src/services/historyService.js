const { supabase, isSupabaseConfigured } = require('../config/supabase');

// In-Memory history store (empty by default, populated only by real executions)
const memoryHistory = [];

/**
 * Record initiation of a new run
 */
function recordRunStart({
  userId,
  userEmail,
  runId,
  mode = 'repair',
  type = 'custom_run',
  repository = 'Local Codebase',
  targetEndpoint = 'POST /api/auth/login',
  workspacePath = ''
}) {
  const historyItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    runId,
    userId: userId || 'anonymous',
    userEmail: userEmail || 'dev@apifix.ai',
    mode,
    type,
    repository,
    targetEndpoint,
    workspacePath,
    status: 'in_progress',
    createdAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    confidence: null,
    risk: 'Unassessed',
    patchSummary: 'Investigation in progress...',
    rootCause: null,
    repairedFile: null,
    testsPassed: null,
    testsFailed: null,
    apiChecksPassed: null
  };

  memoryHistory.unshift(historyItem);

  if (isSupabaseConfigured()) {
    supabase
      .from('user_history')
      .insert({
        run_id: runId,
        user_id: userId,
        user_email: userEmail,
        mode,
        type,
        repository,
        target_endpoint: targetEndpoint,
        status: 'in_progress',
        created_at: historyItem.createdAt
      })
      .then(({ error }) => {
        if (error) console.error('[Supabase History Insert Error]', error);
      })
      .catch(err => console.error('[Supabase History Catch]', err));
  }

  return historyItem;
}

/**
 * Update history item with completion or progression details
 */
function updateRunHistory(runId, updates) {
  const item = memoryHistory.find(h => h.runId === runId);
  if (item) {
    Object.assign(item, updates);
    if (updates.status === 'completed' && !item.completedAt) {
      item.completedAt = new Date().toISOString();
      if (item.createdAt) {
        item.durationMs = new Date(item.completedAt).getTime() - new Date(item.createdAt).getTime();
      }
    }
  }

  if (isSupabaseConfigured()) {
    supabase
      .from('user_history')
      .update({
        status: updates.status || item?.status,
        confidence: updates.confidence || item?.confidence,
        risk: updates.risk || item?.risk,
        patch_summary: updates.patchSummary || item?.patchSummary,
        root_cause: updates.rootCause || item?.rootCause,
        repaired_file: updates.repairedFile || item?.repairedFile,
        tests_passed: updates.testsPassed || item?.testsPassed,
        completed_at: item?.completedAt
      })
      .eq('run_id', runId)
      .then(({ error }) => {
        if (error) console.error('[Supabase History Update Error]', error);
      })
      .catch(err => console.error('[Supabase History Update Catch]', err));
  }
}

/**
 * Fetch history records for a given user
 */
async function getUserHistory(userIdentifier) {
  if (!userIdentifier) return [];

  const normalized = userIdentifier.toLowerCase().trim();

  const results = memoryHistory.filter(h =>
    (h.userId && h.userId.toLowerCase() === normalized) ||
    (h.userEmail && h.userEmail.toLowerCase() === normalized)
  );

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('user_history')
        .select('*')
        .or(`user_id.eq.${userIdentifier},user_email.eq.${normalized}`)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.error('[Supabase getUserHistory Error]', e);
    }
  }

  return results;
}

/**
 * Get single history item by runId
 */
function getHistoryItem(runId, userIdentifier) {
  const item = memoryHistory.find(h => h.runId === runId);
  if (!item) return null;

  if (!userIdentifier) return item;
  const normalized = userIdentifier.toLowerCase().trim();

  if (
    normalized === 'admin@apifix.ai' ||
    item.userId === normalized ||
    (item.userEmail && item.userEmail.toLowerCase() === normalized)
  ) {
    return item;
  }
  return item;
}

/**
 * Delete a history item
 */
function deleteHistoryItem(runId, userIdentifier) {
  const index = memoryHistory.findIndex(h => h.runId === runId);
  if (index !== -1) {
    memoryHistory.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Calculate user aggregate statistics
 */
async function getUserStats(userIdentifier) {
  const history = await getUserHistory(userIdentifier);
  const totalRuns = history.length;
  const completedRuns = history.filter(h => h.status === 'completed');
  const totalRepairs = history.filter(h => h.mode === 'repair' && h.status === 'completed').length;
  const totalScans = history.filter(h => h.mode === 'scan').length;

  const successRate = totalRuns > 0
    ? Math.round((completedRuns.length / totalRuns) * 100)
    : 100;

  const totalDuration = completedRuns.reduce((acc, curr) => acc + (curr.durationMs || 3500), 0);
  const avgResolutionTimeMs = completedRuns.length > 0
    ? Math.round(totalDuration / completedRuns.length)
    : 3200;

  return {
    totalRuns,
    totalRepairs,
    totalScans,
    successRate,
    avgResolutionTimeMs
  };
}

module.exports = {
  recordRunStart,
  updateRunHistory,
  getUserHistory,
  getHistoryItem,
  deleteHistoryItem,
  getUserStats,
  memoryHistory
};
