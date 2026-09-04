const fs = require('fs');
const path = require('path');
const { allocateAvailablePort } = require('../services/portManager');
const { ensureDependencies } = require('../services/dependencyInstaller');
const {
  startApplicationProcess,
  stopProcess,
  getProcessLogs
} = require('../services/processManager');
const { discoverProjectEndpoints } = require('../services/apiDiscoveryService');
const { probeProjectEndpoints } = require('../services/endpointProber');
const {
  getProjectById,
  createProjectRun,
  updateProjectRecord
} = require('../services/projectStore');
const { RunState, transitionRunState } = require('../services/runStateMachine');
const { isRunActive, getActiveRunMeta, addRunCleanupHandler } = require('../services/runController');
const { createProfiler } = require('../services/performanceProfiler');
const { sanitizeSecrets, validateSafePath } = require('../services/securitySanitizer');

// In-memory active SSE client connections: runId -> Array<Response>
const runEventClients = new Map();

/**
 * Register SSE client response object for a run
 * @param {string} runId 
 * @param {object} res 
 */
function registerRunSSE(runId, res) {
  if (!runEventClients.has(runId)) {
    runEventClients.set(runId, []);
  }
  runEventClients.get(runId).push(res);
}

/**
 * Emit an SSE event to connected clients for a run
 * @param {string} runId 
 * @param {string} event 
 * @param {object} data 
 */
function emitRunEvent(runId, event, data) {
  const clients = runEventClients.get(runId);
  if (clients && clients.length > 0) {
    const sanitizedData = sanitizeSecrets(data);
    const payload = `event: ${event}\ndata: ${JSON.stringify(sanitizedData)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch (e) {}
    }
  }
}

/**
 * Executes the complete Phase 3 project analysis pipeline.
 * @param {object} params - { projectId, user, authToken, runId }
 * @returns {Promise<object>} Analysis summary
 */
async function executeProjectAnalysis({ projectId, user, authToken = null, runId = null }) {
  const effectiveRunId = runId || `run_analysis_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const profiler = createProfiler(effectiveRunId);

  await transitionRunState(effectiveRunId, RunState.QUEUED, {
    event: 'Analysis Run Queued',
    details: `Target project: ${projectId}`
  });

  emitRunEvent(effectiveRunId, 'RUN_CREATED', {
    runId: effectiveRunId,
    projectId,
    status: 'RUN_CREATED',
    message: 'Initializing project analysis run...'
  });

  // 1. Fetch Project Record
  const project = await getProjectById(projectId, user);
  if (!project) {
    await transitionRunState(effectiveRunId, RunState.FAILED, {
      event: 'Project Not Found',
      error: `Project "${projectId}" not found or unauthorized.`
    });
    throw new Error(`Project "${projectId}" not found or unauthorized.`);
  }

  // 2. Validate Runtime Guard
  if (project.technology === 'python' || project.supported === false) {
    const reason = 'EXECUTION NOT YET SUPPORTED FOR PYTHON: Python autonomous execution sandbox is scheduled for a future phase.';
    await transitionRunState(effectiveRunId, RunState.FAILED, {
      event: 'Unsupported Technology Guard',
      error: reason
    });
    emitRunEvent(effectiveRunId, 'RUN_FAILED', {
      runId: effectiveRunId,
      status: 'RUN_FAILED',
      reason
    });
    throw new Error(reason);
  }

  const workingDir = project.workingPath;
  if (!fs.existsSync(workingDir)) {
    const reason = `Working workspace directory does not exist: ${workingDir}`;
    await transitionRunState(effectiveRunId, RunState.FAILED, {
      event: 'Workspace Missing',
      error: reason
    });
    throw new Error(reason);
  }

  // Record Run in Store
  await createProjectRun({
    id: effectiveRunId,
    projectId,
    userId: user?.id,
    userEmail: user?.email,
    status: RunState.DETECTED,
    selectedProjectPath: project.selectedProjectPath || '.'
  });

  await transitionRunState(effectiveRunId, RunState.DETECTED, {
    event: 'Workspace Detected and Prepared',
    details: `${project.name} (${project.technologyDisplay || 'Node.js'} / ${project.frameworkDisplay || 'Express'})`
  });

  let allocatedPort = null;
  let executionSuccess = false;
  let analysisSummary = null;

  try {
    // 3. Prepare Dependencies
    profiler.startStage('dependency_preparation');
    emitRunEvent(effectiveRunId, 'INSTALLING_DEPENDENCIES', {
      runId: effectiveRunId,
      message: 'Checking and preparing project dependencies...'
    });

    await ensureDependencies(workingDir, (msg) => {
      emitRunEvent(effectiveRunId, 'INSTALL_LOG', { message: msg });
    });
    profiler.endStage('dependency_preparation');

    // Check cancellation
    const runMeta = getActiveRunMeta(effectiveRunId);
    if (runMeta && runMeta.status === 'CANCELLED') {
      throw new Error('Analysis cancelled by user.');
    }

    // 4. Allocate Dynamic Port
    profiler.startStage('port_allocation');
    allocatedPort = await allocateAvailablePort();
    profiler.endStage('port_allocation', { port: allocatedPort });

    // 5. Start Application Process in Working Workspace
    profiler.startStage('process_startup');
    emitRunEvent(effectiveRunId, 'STARTING_APPLICATION', {
      runId: effectiveRunId,
      port: allocatedPort,
      framework: project.frameworkDisplay || 'Node.js',
      message: `Starting application process on dynamic port ${allocatedPort}...`
    });

    await startApplicationProcess(effectiveRunId, workingDir, allocatedPort, (msg) => {
      emitRunEvent(effectiveRunId, 'PROCESS_LOG', { message: msg });
    });
    profiler.endStage('process_startup');

    emitRunEvent(effectiveRunId, 'APPLICATION_READY', {
      runId: effectiveRunId,
      port: allocatedPort,
      message: `Application is active and listening on port ${allocatedPort}.`
    });

    // 6. Discover API Endpoints
    profiler.startStage('api_discovery');
    emitRunEvent(effectiveRunId, 'DISCOVERING_APIS', {
      runId: effectiveRunId,
      message: 'Scanning OpenAPI specifications and source route definitions...'
    });

    const discoveredEndpoints = discoverProjectEndpoints(workingDir);
    profiler.endStage('api_discovery', { count: discoveredEndpoints.length });

    emitRunEvent(effectiveRunId, 'APIS_DISCOVERED', {
      runId: effectiveRunId,
      totalDiscovered: discoveredEndpoints.length,
      endpoints: discoveredEndpoints
    });

    // 7. Probe Discovered Endpoints via Real HTTP Requests
    profiler.startStage('live_probing');
    const logs = getProcessLogs(effectiveRunId);
    emitRunEvent(effectiveRunId, 'PROBING_ENDPOINTS', {
      runId: effectiveRunId,
      totalToProbe: discoveredEndpoints.length,
      message: `Performing live HTTP verification against port ${allocatedPort}...`
    });

    const probeResults = await probeProjectEndpoints(
      discoveredEndpoints,
      allocatedPort,
      authToken,
      logs.stderr,
      (finding) => {
        emitRunEvent(effectiveRunId, 'ENDPOINT_RESULT', finding);
      }
    );
    profiler.endStage('live_probing', { probedCount: probeResults.totalProbed });

    // 8. Identify Primary Failure & Root Cause Evidence
    const failedFindings = probeResults.results.filter(r => r.isFailure);
    const primaryFailure = failedFindings.length > 0 ? failedFindings[0] : null;

    const perfReport = profiler.getReport();

    analysisSummary = {
      runId: effectiveRunId,
      projectId,
      projectName: project.name,
      port: allocatedPort,
      framework: project.frameworkDisplay,
      executionDurationMs: perfReport.totalDurationMs,
      performance: perfReport,
      metrics: {
        totalDiscovered: probeResults.totalDiscovered,
        totalProbed: probeResults.totalProbed,
        healthyCount: probeResults.healthyCount,
        failedCount: probeResults.failedCount,
        authRequiredCount: probeResults.authRequiredCount,
        notVerifiedCount: 0
      },
      primaryFailure: primaryFailure ? {
        endpoint: `${primaryFailure.method} ${primaryFailure.path}`,
        httpStatus: primaryFailure.httpStatus,
        category: primaryFailure.category,
        severity: primaryFailure.severity,
        sourceFile: primaryFailure.sourceFile,
        sourceLine: primaryFailure.sourceLine,
        evidence: primaryFailure.evidence
      } : null,
      findings: probeResults.results
    };

    // 9. Save Evidence to Runs Storage
    const runArtifactsDir = path.resolve(workingDir, '../runs', effectiveRunId);
    if (!fs.existsSync(runArtifactsDir)) {
      fs.mkdirSync(runArtifactsDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(runArtifactsDir, 'evidence.json'),
      JSON.stringify(analysisSummary, null, 2),
      'utf8'
    );

    executionSuccess = true;

    await transitionRunState(effectiveRunId, RunState.COMPLETED, {
      event: 'API Discovery & Analysis Completed',
      details: `Probed ${probeResults.totalProbed} endpoints (${probeResults.failedCount} failures reproduced).`
    });

    emitRunEvent(effectiveRunId, 'RUN_COMPLETED', {
      runId: effectiveRunId,
      status: 'COMPLETED',
      summary: analysisSummary
    });

    return analysisSummary;
  } catch (err) {
    const isCancelled = err.message?.includes('cancelled');
    const finalState = isCancelled ? RunState.CANCELLED : RunState.FAILED;

    await transitionRunState(effectiveRunId, finalState, {
      event: isCancelled ? 'Run Cancelled' : 'Analysis Failed',
      details: err.message,
      error: err.message
    });

    emitRunEvent(effectiveRunId, 'RUN_FAILED', {
      runId: effectiveRunId,
      status: finalState,
      reason: err.message
    });
    throw err;
  } finally {
    // 10. Guaranteed Cleanup: Stop child process tree
    emitRunEvent(effectiveRunId, 'RUN_CLEANUP', {
      runId: effectiveRunId,
      message: 'Terminating application child process and freeing port...'
    });
    await stopProcess(effectiveRunId);
  }
}

module.exports = {
  registerRunSSE,
  emitRunEvent,
  executeProjectAnalysis
};
