const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const AdmZip = require('adm-zip');

const {
  RunState,
  PIPELINE_ORDER,
  isValidTransition,
  transitionRunState,
  getRunTimeline,
  initRunStateMachine
} = require('../src/services/runStateMachine');

const {
  registerActiveRun,
  cancelRun,
  unregisterActiveRun,
  isRunActive,
  getActiveRunMeta
} = require('../src/services/runController');

const {
  sanitizeSecrets,
  validateSafePath
} = require('../src/services/securitySanitizer');

const {
  PerformanceProfiler,
  createProfiler
} = require('../src/services/performanceProfiler');

const {
  packageVerifiedZip,
  calculateDirectoryHash,
  runProjectTests
} = require('../src/services/realVerificationEngine');

const {
  parseGithubUrl,
  validateGithubToken,
  getRepositoryInfo,
  getBranchHeadSha,
  openPullRequest,
  executeGithubPullRequestFlow
} = require('../src/services/githubService');

const {
  createProjectRecord,
  getProjectById,
  createProjectRun,
  getProjectRun,
  createPullRequestRecord,
  getPullRequestByRunId
} = require('../src/services/projectStore');

const {
  initializeProjectWorkspace,
  prepareWorkingWorkspace
} = require('../src/services/workspaceManager');

const {
  generateRepairPatch,
  applyPatchTransaction,
  validatePatchSafety
} = require('../src/services/patchEngine');

const {
  validateAiResponseContract,
  parseAiJsonResponse,
  checkJsSyntax
} = require('../src/services/aiProviderClient');

describe('APIFIX V2 — Phase 8: Production Readiness & Final Intelligence Tests', () => {
  const testProjectId = `proj_phase8_${Date.now()}`;
  let mockServer = null;
  let mockServerPort = 0;
  const mockCalls = [];

  before(async () => {
    // Setup Mock GitHub API Server for deterministic testing
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        mockCalls.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body || '{}') : null
        });

        // Router for Mock GitHub API
        if (req.url === '/user') {
          if (req.headers.authorization?.includes('invalid')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ message: 'Bad credentials' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ login: 'apifix-bot', id: 998877 }));
        }

        if (req.url.startsWith('/repos/valid-org/non-existent-repo')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Not Found' }));
        }

        if (req.url.startsWith('/repos/valid-org/no-perms-repo')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Must have push access to repository' }));
        }

        if (req.url === '/repos/valid-org/valid-repo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            owner: { login: 'valid-org' },
            name: 'valid-repo',
            full_name: 'valid-org/valid-repo',
            default_branch: 'main',
            private: false,
            permissions: { push: true }
          }));
        }

        if (req.url === '/repos/valid-org/valid-repo/git/ref/heads/main' || req.url === '/repos/valid-org/valid-repo/branches/main') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            object: { sha: 'base_commit_sha_12345' },
            commit: { sha: 'base_commit_sha_12345' }
          }));
        }

        if (req.url.includes('/git/ref/heads/apifix/')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Not Found' }));
        }

        if (req.url === '/repos/valid-org/valid-repo/git/commits/base_commit_sha_12345') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            sha: 'base_commit_sha_12345',
            tree: { sha: 'base_tree_sha_67890' }
          }));
        }

        if (req.url === '/repos/valid-org/valid-repo/git/blobs') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ sha: 'blob_sha_111222' }));
        }

        if (req.url === '/repos/valid-org/valid-repo/git/trees') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ sha: 'new_tree_sha_333444' }));
        }

        if (req.url === '/repos/valid-org/valid-repo/git/commits') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ sha: 'new_commit_sha_555666' }));
        }

        if (req.url === '/repos/valid-org/valid-repo/git/refs') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ref: 'refs/heads/apifix/fix-login', object: { sha: 'new_commit_sha_555666' } }));
        }

        if (req.url === '/repos/valid-org/valid-repo/pulls') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            number: 42,
            html_url: 'https://github.com/valid-org/valid-repo/pull/42',
            state: 'open',
            title: 'fix: APIFIX verified repair for POST /api/auth/login',
            created_at: new Date().toISOString()
          }));
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not mapped in mock server' }));
      });
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockServerPort = mockServer.address().port;
        process.env.GITHUB_API_BASE = `http://127.0.0.1:${mockServerPort}`;
        resolve();
      });
    });
  });

  after(() => {
    if (mockServer) mockServer.close();
  });

  // TEST 1: State Machine & Transition Validation
  test('TEST 1: Deterministic Run State Machine enforces valid transitions and records timeline', async () => {
    const runId = `run_sm_test_${Date.now()}`;
    await initRunStateMachine(runId, RunState.QUEUED, { message: 'Run queued in system' });

    assert.equal(isValidTransition(RunState.QUEUED, RunState.DETECTED), true);
    assert.equal(isValidTransition(RunState.DETECTED, RunState.INVESTIGATING), true);
    assert.equal(isValidTransition(RunState.INVESTIGATING, RunState.ROOT_CAUSE), true);
    assert.equal(isValidTransition(RunState.ROOT_CAUSE, RunState.PATCHING), true);
    assert.equal(isValidTransition(RunState.PATCHING, RunState.TESTING), true);
    assert.equal(isValidTransition(RunState.TESTING, RunState.VERIFIED), true);
    assert.equal(isValidTransition(RunState.VERIFIED, RunState.COMPLETED), true);

    // Invalid transition: cannot jump from QUEUED directly to VERIFIED
    assert.equal(isValidTransition(RunState.QUEUED, RunState.VERIFIED), false);

    // Execute sequential transitions
    await transitionRunState(runId, RunState.DETECTED, { event: 'Workspace Ready' });
    await transitionRunState(runId, RunState.INVESTIGATING, { event: 'Investigating Telemetry' });
    await transitionRunState(runId, RunState.ROOT_CAUSE, { event: 'RCA Confirmed' });
    await transitionRunState(runId, RunState.PATCHING, { event: 'Patch Synthesized' });
    await transitionRunState(runId, RunState.TESTING, { event: 'Probes Running' });
    await transitionRunState(runId, RunState.VERIFIED, { event: 'Fix Verified' });
    const result = await transitionRunState(runId, RunState.COMPLETED, { event: 'Repair Complete' });

    assert.equal(result.state, RunState.COMPLETED);
    const timeline = getRunTimeline(runId);
    assert.equal(timeline.length, 8);
    assert.equal(timeline[0].stage, RunState.QUEUED);
    assert.equal(timeline[timeline.length - 1].stage, RunState.COMPLETED);
    assert.ok(timeline[0].timestamp);
  });

  // TEST 2: Real Run Control (Abort, Cancel, Concurrency Locking)
  test('TEST 2: Real-time run cancellation aborts execution and releases concurrency locks', async () => {
    const runId = `run_cancel_test_${Date.now()}`;
    const workspaceKey = `workspace/project_lock_${Date.now()}`;

    // Register active run
    const abortCtrl = registerActiveRun(runId, workspaceKey, '/tmp/mock/workspace');
    assert.equal(isRunActive(runId), true);
    assert.equal(abortCtrl.signal.aborted, false);

    // Duplicate run on same target must fail with 409 conflict
    assert.throws(() => {
      registerActiveRun(`run_dup_${Date.now()}`, workspaceKey, '/tmp/mock/workspace');
    }, /CONFLICT: Target.*already has an active run/);

    let cleanupCalled = false;
    const { addRunCleanupHandler } = require('../src/services/runController');
    addRunCleanupHandler(runId, () => {
      cleanupCalled = true;
    });

    // Execute cancellation
    const cancelRes = await cancelRun(runId, 'User requested abort from UI');
    assert.equal(cancelRes.status, RunState.CANCELLED);
    assert.equal(abortCtrl.signal.aborted, true);
    assert.equal(cleanupCalled, true);
    assert.equal(isRunActive(runId), false);

    // Concurrency lock released: now new run can register
    const newRunId = `run_new_${Date.now()}`;
    const newAbort = registerActiveRun(newRunId, workspaceKey, '/tmp/mock/workspace');
    assert.equal(isRunActive(newRunId), true);
    unregisterActiveRun(newRunId);
  });

  // TEST 3: Security Sanitizer — Redacts all keys & tokens and blocks path traversal
  test('TEST 3: Security sanitizer scrubs secrets and rejects path traversal sequences', () => {
    const fakeGhp = ['ghp', '1234567890abcdefghijklmnopqrstuvwxyz'].join('_');
    const fakeGsk = ['gsk', '1234567890abcdefghijklmnopqrstuvwxyz123456'].join('_');
    const rawSecretLog = `Error connecting with ${fakeGhp} to repo with key ${fakeGsk}`;
    const sanitized = sanitizeSecrets(rawSecretLog);

    assert.ok(!sanitized.includes(fakeGhp));
    assert.ok(!sanitized.includes(fakeGsk));
    assert.ok(sanitized.includes('[REDACTED_CREDENTIAL]'));

    // Object sanitization
    const fakeGskObj = ['gsk', 'secret123456789012345678901234567890123456'].join('_');
    const fakeGhpObj = ['ghp', 'secret1234567890123456789012345678901234'].join('_');
    const sensitiveObj = {
      apiKey: fakeGskObj,
      githubToken: fakeGhpObj,
      safeData: 'User details'
    };
    const sanitizedObj = sanitizeSecrets(sensitiveObj);
    assert.equal(sanitizedObj.apiKey, '[REDACTED]');
    assert.equal(sanitizedObj.githubToken, '[REDACTED]');
    assert.equal(sanitizedObj.safeData, 'User details');

    // Path traversal safety
    const baseDir = path.resolve(__dirname, '../src');
    assert.throws(() => {
      validateSafePath(baseDir, '../../etc/passwd');
    }, /Security Violation/);

    assert.throws(() => {
      validateSafePath(baseDir, '/root/secret.key');
    }, /Security Violation/);

    const safePath = validateSafePath(baseDir, 'services/securitySanitizer.js');
    assert.ok(safePath.startsWith(baseDir));
  });

  // TEST 4: Performance Profiler — Accurate stage breakdown and top 3 bottlenecks
  test('TEST 4: Performance profiler records stage metrics and identifies bottlenecks', async () => {
    const profiler = createProfiler('run_prof_test');

    profiler.startStage('ai_request');
    await new Promise(r => setTimeout(r, 25));
    profiler.endStage('ai_request');

    profiler.startStage('probes');
    await new Promise(r => setTimeout(r, 10));
    profiler.endStage('probes');

    profiler.startStage('patch_generation');
    await new Promise(r => setTimeout(r, 5));
    profiler.endStage('patch_generation');

    const report = profiler.getReport();
    assert.equal(report.stages.length, 3);
    assert.ok(report.totalDurationMs >= 35);
    assert.equal(report.topBottlenecks.length, 3);
    assert.equal(report.topBottlenecks[0].stage, 'ai_request');
  });

  // TEST 5: Artifact Packaging — Strict exclusion of secrets, node_modules, .env, and integrity check
  test('TEST 5: packageVerifiedZip strictly excludes .env, node_modules, and passes ZIP integrity check', () => {
    const tempDir = path.resolve(__dirname, '../storage/temp_test_pkg');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // Create test files
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name":"test-api"}');
    fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET_KEY=leaked_secret');
    fs.writeFileSync(path.join(tempDir, '.env.local'), 'ANOTHER_SECRET=123');

    const nmDir = path.join(tempDir, 'node_modules', 'fake-pkg');
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(path.join(nmDir, 'index.js'), 'module.exports = {};');

    const gitDir = path.join(tempDir, '.git');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main');

    const targetZip = path.resolve(__dirname, '../storage/test_verified_archive.zip');
    const zipInfo = packageVerifiedZip(tempDir, targetZip);

    assert.ok(fs.existsSync(targetZip));
    assert.ok(zipInfo.sha256);
    assert.ok(zipInfo.sizeBytes > 0);

    const readZip = new AdmZip(targetZip);
    const entryNames = readZip.getEntries().map(e => e.entryName);

    assert.ok(entryNames.includes('package.json'));
    assert.ok(!entryNames.some(e => e.includes('.env')));
    assert.ok(!entryNames.some(e => e.includes('node_modules')));
    assert.ok(!entryNames.some(e => e.includes('.git')));

    // Cleanup
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.unlinkSync(targetZip); } catch (e) {}
  });

  // TEST 6: GitHub PR Flow with actionable error recovery
  test('TEST 6: GitHub Automation handles invalid token, missing repos, and successful PR creation', async () => {
    // 1. Invalid Token Error
    await assert.rejects(async () => {
      await validateGithubToken('invalid_token');
    }, (err) => {
      assert.equal(err.code, 'GITHUB_TOKEN_INVALID');
      assert.ok(err.suggestedAction.includes('Personal Access Token'));
      assert.equal(err.isRetryable, true);
      return true;
    });

    // 2. Repository Not Found
    await assert.rejects(async () => {
      await getRepositoryInfo('valid-org', 'non-existent-repo', 'valid_token');
    }, (err) => {
      assert.equal(err.code, 'GITHUB_REPOSITORY_NOT_FOUND');
      return true;
    });

    // 3. Permission Denied
    await assert.rejects(async () => {
      await getRepositoryInfo('valid-org', 'no-perms-repo', 'valid_token');
    }, (err) => {
      assert.equal(err.code, 'GITHUB_PERMISSION_DENIED');
      return true;
    });

    // 4. Successful PR Pipeline Execution
    const demoDir = path.resolve(__dirname, '../../demo-api');
    const prResult = await executeGithubPullRequestFlow({
      owner: 'valid-org',
      repo: 'valid-repo',
      baseBranch: 'main',
      githubToken: 'valid_token',
      workingDir: demoDir,
      patch: {
        changes: [{ file: 'src/controllers/authController.js' }],
        reason: 'Added null check'
      },
      verification: {
        target: { method: 'POST', path: '/api/auth/login' },
        before: { status: 500 },
        after: { status: 401, responseBody: { error: 'Invalid credentials' } },
        tests: { status: 'PASSED', passed: 1, total: 1 }
      },
      investigation: {
        rootCause: { summary: 'Null dereference', explanation: 'Missing null check on user record.' }
      },
      project: { name: 'demo-api' },
      runId: `run_gh_test_${Date.now()}`
    });

    assert.equal(prResult.success, true);
    assert.equal(prResult.pullRequestNumber, 42);
    assert.equal(prResult.pullRequestUrl, 'https://github.com/valid-org/valid-repo/pull/42');
    assert.ok(prResult.branch.startsWith('apifix/fix-'));
  });

  // TEST 7: AI Contract & Syntax Validation
  test('TEST 7: AI Response Contract validator enforces strict schemas and validates JS syntax', () => {
    assert.equal(checkJsSyntax('function add(a, b) { return a + b; }'), true);
    assert.equal(checkJsSyntax('if (user && user.password === password) { return true; }'), true);
    assert.equal(checkJsSyntax('if (user && { unclosed'), false);

    const validAiPayload = {
      rootCause: {
        summary: 'Null pointer dereference',
        file: 'src/controllers/authController.js',
        line: 14,
        explanation: 'User is null'
      },
      patch: {
        filePath: 'src/controllers/authController.js',
        oldText: 'if (user.password === password) {',
        newText: 'if (user && user.password === password) {',
        reason: 'Prevents null dereference'
      },
      confidence: null,
      verificationPlan: ['Step 1', 'Step 2']
    };

    const validated = validateAiResponseContract(validAiPayload);
    assert.equal(validated.rootCause.summary, 'Null pointer dereference');

    // Rejection of traversal in patch path
    const maliciousPayload = {
      ...validAiPayload,
      patch: {
        ...validAiPayload.patch,
        filePath: '../../etc/passwd'
      }
    };
    assert.throws(() => {
      validateAiResponseContract(maliciousPayload);
    }, /path traversal/);
  });
});
