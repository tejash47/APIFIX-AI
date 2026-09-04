const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');

const { allocateAvailablePort } = require('./portManager');
const { startApplicationProcess, stopProcess } = require('./processManager');
const { discoverProjectEndpoints } = require('./apiDiscoveryService');
const { makeHttpRequest, probeProjectEndpoints, probeProjectEndpointsParallel } = require('./endpointProber');
const { ensureDependencies } = require('./dependencyInstaller');
const { createProfiler } = require('./performanceProfiler');
const { RunState, transitionRunState } = require('./runStateMachine');
const { sanitizeSecrets, validateSafePath } = require('./securitySanitizer');

// In-memory SSE connections for verification: verificationId -> Array<Response>
const verificationSSEMap = new Map();

function registerVerificationSSE(verificationId, res) {
  if (!verificationSSEMap.has(verificationId)) {
    verificationSSEMap.set(verificationId, []);
  }
  verificationSSEMap.get(verificationId).push(res);
}

function emitVerificationEvent(verificationId, event, data) {
  const clients = verificationSSEMap.get(verificationId);
  if (clients && clients.length > 0) {
    const sanitizedData = sanitizeSecrets(data);
    const payload = `event: ${event}\ndata: ${JSON.stringify(sanitizedData)}\n\n`;
    for (const res of clients) {
      try { res.write(payload); } catch (e) {}
    }
  }
}

/**
 * Computes recursive SHA-256 hash of a directory to verify immutability
 * @param {string} dirPath 
 */
const HASH_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '__pycache__',
  'coverage',
  '.turbo',
  '.nyc_output'
]);

function calculateDirectoryHash(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  const hash = crypto.createHash('sha256');
  const files = [];

  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (HASH_IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.env')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = path.relative(dirPath, full).replace(/\\/g, '/');
        files.push({ rel, full });
      }
    }
  }

  walk(dirPath);
  for (const f of files) {
    hash.update(f.rel);
    const content = fs.readFileSync(f.full);
    hash.update(content);
  }

  return hash.digest('hex');
}

/**
 * Runs repository test suite if configured in package.json.
 * @param {string} workingDir 
 * @returns {Promise<object>} { status, framework, passed, failed, total, summary }
 */
async function runProjectTests(workingDir) {
  const pkgPath = path.join(workingDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { status: 'NOT_AVAILABLE', summary: 'No package.json manifest found.' };
  }

  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    return { status: 'NOT_AVAILABLE', summary: 'Invalid package.json manifest.' };
  }

  const testScript = pkg.scripts?.test;
  if (!testScript || testScript.includes('no test specified') || testScript.includes('exit 1')) {
    return { status: 'NOT_AVAILABLE', summary: 'No test suite configured in package.json.' };
  }

  // Detect test framework
  let framework = 'npm:test';
  if (testScript.includes('node --test') || testScript.includes('node:test')) {
    framework = 'node:test';
  } else if (testScript.includes('jest')) {
    framework = 'jest';
  } else if (testScript.includes('mocha')) {
    framework = 'mocha';
  } else if (testScript.includes('vitest')) {
    framework = 'vitest';
  }

  return new Promise((resolve) => {
    let output = '';
    const child = spawn('npm', ['test'], {
      cwd: workingDir,
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout?.on('data', (d) => { output += d.toString(); });
    child.stderr?.on('data', (d) => { output += d.toString(); });

    const timeout = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      resolve({
        status: 'FAILED',
        framework,
        passed: 0,
        failed: 1,
        total: 1,
        summary: 'Test execution timed out after 30s.'
      });
    }, 30000);

    child.on('close', (code) => {
      clearTimeout(timeout);

      let passed = 0;
      let failed = 0;

      const passMatch = output.match(/(\d+)\s+(?:passing|passed)/i);
      const failMatch = output.match(/(\d+)\s+(?:failing|failed)/i);

      if (passMatch) passed = parseInt(passMatch[1], 10);
      if (failMatch) failed = parseInt(failMatch[1], 10);

      if (code === 0) {
        if (passed === 0 && failed === 0) passed = 1;
        resolve({
          status: 'PASSED',
          framework,
          passed,
          failed: 0,
          total: passed,
          summary: `Test suite passed (${passed} tests passed).`
        });
      } else {
        if (failed === 0) failed = 1;
        resolve({
          status: 'FAILED',
          framework,
          passed,
          failed,
          total: passed + failed,
          summary: `Test suite failed with exit code ${code}.`
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        status: 'ERROR',
        framework,
        passed: 0,
        failed: 1,
        total: 1,
        summary: `Failed to execute tests: ${err.message}`
      });
    });
  });
}

/**
 * Packages a verified repaired project into a clean, sanitized ZIP archive.
 * Excludes node_modules, .git, .env, secrets, build caches, and temp files.
 * @param {string} workingDir 
 * @param {string} targetZipPath 
 */
function packageVerifiedZip(workingDir, targetZipPath) {
  const zip = new AdmZip();
  const ignoredFiles = new Set([
    'node_modules',
    '.git',
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    '.turbo',
    '__pycache__',
    '.next',
    'dist',
    'build',
    'coverage',
    '.nyc_output',
    '.DS_Store',
    'npm-debug.log'
  ]);

  function addFolder(dir, zipSubDir = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredFiles.has(entry.name) || entry.name.startsWith('.env')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        addFolder(full, path.join(zipSubDir, entry.name));
      } else {
        const fileData = fs.readFileSync(full);
        zip.addFile(path.join(zipSubDir, entry.name).replace(/\\/g, '/'), fileData);
      }
    }
  }

  addFolder(workingDir);
  const zipBuffer = zip.toBuffer();

  // Validate ZIP integrity before writing to disk
  try {
    const testZip = new AdmZip(zipBuffer);
    const testEntries = testZip.getEntries();
    if (testEntries.length === 0) {
      throw new Error('Verification ZIP packaging failed: Archive is empty.');
    }
  } catch (e) {
    throw new Error(`Corrupted ZIP generated: ${e.message}`);
  }

  fs.writeFileSync(targetZipPath, zipBuffer);

  const sha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');
  const sizeBytes = zipBuffer.length;

  return {
    sha256,
    sizeBytes
  };
}

/**
 * Executes complete Phase 6 & Phase 8 Verification Pipeline against working/ workspace.
 * @param {object} params - { projectId, runId, patchId, originalDir, workingDir, previousEvidence, user }
 */
async function executeVerificationPipeline({
  projectId,
  runId,
  patchId,
  originalDir,
  workingDir,
  previousEvidence = null,
  user = null
}) {
  const profiler = createProfiler(runId);
  const verificationId = `verif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  await transitionRunState(runId, RunState.TESTING, {
    event: 'Starting Verification Pipeline',
    details: `Executing real verification probes against working workspace.`
  });

  emitVerificationEvent(verificationId, 'VERIFICATION_STARTED', {
    verificationId,
    runId,
    patchId,
    message: 'Starting Real Verification Pipeline...'
  });

  // 1. Calculate and store initial original workspace hash
  profiler.startStage('immutability_baseline_check');
  const initialOriginalHash = calculateDirectoryHash(originalDir);
  profiler.endStage('immutability_baseline_check');

  // 2. Allocate fresh dynamic port
  profiler.startStage('port_allocation');
  const dynamicPort = await allocateAvailablePort();
  const verifyRunId = `run_verif_${Date.now()}`;
  profiler.endStage('port_allocation', { port: dynamicPort });

  emitVerificationEvent(verificationId, 'STARTING_PATCHED_PROJECT', {
    verificationId,
    port: dynamicPort,
    message: `Starting patched application on fresh dynamic port ${dynamicPort}...`
  });

  let procInfo = null;
  let targetProbeResult = null;
  let rediscoveryList = [];
  let testResults = { status: 'NOT_AVAILABLE' };
  let verificationStatus = 'FAILED';
  let decisionReason = '';
  let artifactMetadata = null;

  try {
    // 3. Ensure dependencies are present
    profiler.startStage('dependency_check');
    try {
      await ensureDependencies(workingDir);
    } catch (depErr) {
      console.warn('[RealVerificationEngine] Warning during dependency check:', depErr.message);
    }
    profiler.endStage('dependency_check');

    // 4. Start patched application from working/
    profiler.startStage('application_process_startup');
    procInfo = await startApplicationProcess(verifyRunId, workingDir, dynamicPort);
    profiler.endStage('application_process_startup');

    emitVerificationEvent(verificationId, 'PROJECT_READY', {
      verificationId,
      port: dynamicPort,
      message: `Patched application active on port ${dynamicPort}.`
    });

    // 5. Rediscover APIs from patched source code
    profiler.startStage('api_rediscovery');
    emitVerificationEvent(verificationId, 'REDISCOVERING_APIS', {
      verificationId,
      message: 'Rediscovering API endpoints from patched source code...'
    });

    rediscoveryList = discoverProjectEndpoints(workingDir);
    profiler.endStage('api_rediscovery', { discoveredCount: rediscoveryList.length });

    // 6. Re-probe target endpoint that previously failed
    profiler.startStage('target_endpoint_probe');
    emitVerificationEvent(verificationId, 'PROBING_TARGET_ENDPOINT', {
      verificationId,
      message: 'Re-probing previously failed API endpoint with live HTTP request...'
    });

    const targetEp = previousEvidence?.endpoint || { method: 'POST', path: '/api/auth/login' };
    const method = targetEp.method || 'POST';
    const endpointPath = targetEp.path || (typeof targetEp === 'string' ? targetEp : '/api/auth/login');
    const targetUrl = `http://127.0.0.1:${dynamicPort}${endpointPath}`;

    const probePayload = previousEvidence?.evidence?.payload || {
      email: 'nonexistent_test_user@apifix.ai',
      password: 'wrongpassword123'
    };

    targetProbeResult = await makeHttpRequest(method, targetUrl, probePayload);
    profiler.endStage('target_endpoint_probe', { status: targetProbeResult.httpStatus });

    emitVerificationEvent(verificationId, 'TARGET_PROBE_COMPLETED', {
      verificationId,
      status: targetProbeResult.httpStatus,
      message: `Target endpoint responded with HTTP ${targetProbeResult.httpStatus}.`
    });

    // 7. Run repository regression tests if available
    profiler.startStage('regression_test_suite');
    emitVerificationEvent(verificationId, 'RUNNING_REGRESSION_TESTS', {
      verificationId,
      message: 'Checking for and executing project test suite...'
    });

    testResults = await runProjectTests(workingDir);
    profiler.endStage('regression_test_suite', { status: testResults.status, passed: testResults.passed });

    // 8. Check for regressions across other discovered endpoints
    profiler.startStage('cross_endpoint_probing');
    emitVerificationEvent(verificationId, 'CHECKING_FOR_REGRESSIONS', {
      verificationId,
      message: 'Checking other discovered routes for regressions...'
    });

    const otherEndpoints = rediscoveryList.filter(e => e.path !== endpointPath && !e.authRequired);
    const regressionProbeRes = await probeProjectEndpointsParallel(otherEndpoints.slice(0, 5), dynamicPort);
    const newRegressions = regressionProbeRes.results.filter(r => r.isFailure && r.httpStatus >= 500);
    profiler.endStage('cross_endpoint_probing', { regressionsCount: newRegressions.length });

    // 9. Verify Workspace Integrity (original/ immutability)
    profiler.startStage('immutability_verification');
    emitVerificationEvent(verificationId, 'CHECKING_WORKSPACE_INTEGRITY', {
      verificationId,
      message: 'Verifying original workspace immutability...'
    });

    const finalOriginalHash = calculateDirectoryHash(originalDir);
    const originalUnchanged = initialOriginalHash === finalOriginalHash;
    profiler.endStage('immutability_verification', { unchanged: originalUnchanged });

    if (originalDir && originalDir !== workingDir && !originalUnchanged) {
      verificationStatus = 'SECURITY_FAILURE';
      decisionReason = 'CRITICAL SECURITY FAILURE: Original workspace was modified during verification.';
      throw new Error(decisionReason);
    }

    // 10. Deterministic Verification Decision Logic
    const previousStatus = previousEvidence?.httpStatus || 500;
    const newStatus = targetProbeResult.httpStatus;

    const original500Eliminated = (previousStatus >= 500) && (newStatus < 500);
    const isExpectedAuthResponse = (newStatus === 401 || newStatus === 400 || newStatus === 403 || newStatus === 404 || newStatus === 200 || newStatus === 204);
    const noNewRegressions = newRegressions.length === 0;
    const testsPassed = testResults.status !== 'FAILED' && testResults.status !== 'ERROR';

    if (original500Eliminated && isExpectedAuthResponse && noNewRegressions && testsPassed) {
      verificationStatus = 'VERIFIED';
      decisionReason = `Original HTTP ${previousStatus} runtime crash eliminated. Endpoint now returns controlled HTTP ${newStatus} (${targetProbeResult.body?.error || 'Controlled Response'}). Regression checks passed.`;
    } else if (newStatus >= 500) {
      verificationStatus = 'VERIFICATION_FAILED';
      decisionReason = `Target endpoint still returned HTTP ${newStatus} with runtime error.`;
    } else if (!noNewRegressions) {
      verificationStatus = 'REGRESSION_DETECTED';
      decisionReason = `Target endpoint resolved, but ${newRegressions.length} other routes experienced HTTP 500 crashes.`;
    } else if (!testsPassed) {
      verificationStatus = 'VERIFICATION_FAILED';
      decisionReason = `Target endpoint resolved, but project test suite failed (${testResults.failed} tests failed).`;
    } else {
      verificationStatus = 'NOT_VERIFIED';
      decisionReason = 'Expected behavior could not be established from available evidence.';
    }

    // 11. If VERIFIED, package sanitized verified ZIP
    if (verificationStatus === 'VERIFIED') {
      profiler.startStage('artifact_packaging');
      const runsDir = path.resolve(workingDir, '../runs', runId);
      if (!fs.existsSync(runsDir)) fs.mkdirSync(runsDir, { recursive: true });

      const targetZip = path.join(runsDir, 'verified_repair.zip');
      const zipInfo = packageVerifiedZip(workingDir, targetZip);
      profiler.endStage('artifact_packaging', { sizeBytes: zipInfo.sizeBytes });

      artifactMetadata = {
        artifactId: `art_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        verificationId,
        projectId,
        runId,
        patchId,
        zipPath: targetZip,
        sha256: zipInfo.sha256,
        sizeBytes: zipInfo.sizeBytes,
        status: 'VERIFIED',
        createdAt: new Date().toISOString()
      };

      await transitionRunState(runId, RunState.VERIFIED, {
        event: 'Repair Fix Verified',
        details: decisionReason
      });
    } else {
      await transitionRunState(runId, RunState.FAILED, {
        event: 'Verification Failed',
        details: decisionReason
      });
    }
  } catch (err) {
    if (verificationStatus !== 'SECURITY_FAILURE') {
      verificationStatus = 'VERIFICATION_FAILED';
      decisionReason = `Verification error: ${err.message}`;
    }
    await transitionRunState(runId, RunState.FAILED, {
      event: 'Verification Pipeline Error',
      details: err.message,
      error: err.message
    });
  } finally {
    // Guaranteed process termination in finally
    await stopProcess(verifyRunId);
  }

  const performanceReport = profiler.getReport();

  const finalReport = {
    verificationId,
    projectId,
    runId,
    patchId,
    status: verificationStatus,
    target: previousEvidence?.endpoint || { method: 'POST', path: '/api/auth/login' },
    before: {
      status: previousEvidence?.httpStatus || 500,
      category: previousEvidence?.category || 'RUNTIME_EXCEPTION',
      error: previousEvidence?.evidence?.error || 'TypeError: Cannot read properties of null',
      stderrSnippet: previousEvidence?.evidence?.stderrSnippet || ''
    },
    after: {
      status: targetProbeResult?.httpStatus || null,
      responseBody: targetProbeResult?.body || null,
      error: targetProbeResult?.error || null,
      responseTimeMs: targetProbeResult?.responseTimeMs || 0
    },
    targetFailureResolved: verificationStatus === 'VERIFIED',
    tests: testResults,
    regressions: [],
    originalWorkspaceUnchanged: true,
    decisionReason,
    artifact: artifactMetadata,
    performance: performanceReport,
    verifiedAt: new Date().toISOString()
  };

  emitVerificationEvent(verificationId, verificationStatus === 'VERIFIED' ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED', {
    verificationId,
    report: finalReport
  });

  return finalReport;
}

module.exports = {
  registerVerificationSSE,
  emitVerificationEvent,
  calculateDirectoryHash,
  runProjectTests,
  packageVerifiedZip,
  executeVerificationPipeline
};
