const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const {
  calculateDirectoryHash,
  runProjectTests,
  packageVerifiedZip,
  executeVerificationPipeline
} = require('../src/services/realVerificationEngine');

const {
  createVerificationRecord,
  getVerificationById,
  getVerificationByRunId,
  createArtifactRecord,
  getArtifactByRunId
} = require('../src/services/projectStore');

const { initializeProjectWorkspace, prepareWorkingWorkspace } = require('../src/services/workspaceManager');
const { generateRepairPatch, applyPatchTransaction } = require('../src/services/patchEngine');

const TEST_SCRATCH = path.resolve(__dirname, '../data/test_phase6_scratch');

describe('APIFIX V2 — Phase 6: Real Repair Verification & Regression Testing', () => {
  before(() => {
    if (!fs.existsSync(TEST_SCRATCH)) {
      fs.mkdirSync(TEST_SCRATCH, { recursive: true });
    }
  });

  after(() => {
    try {
      fs.rmSync(TEST_SCRATCH, { recursive: true, force: true });
    } catch (e) {}
  });

  test('TEST 1: calculateDirectoryHash accurately calculates deterministic SHA-256', () => {
    const testDir = path.join(TEST_SCRATCH, 'hash_test');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/a.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(testDir, 'package.json'), '{"name":"test"}');

    const hash1 = calculateDirectoryHash(testDir);
    const hash2 = calculateDirectoryHash(testDir);

    assert.ok(hash1);
    assert.strictEqual(hash1, hash2);

    // Modify a file and ensure hash changes
    fs.writeFileSync(path.join(testDir, 'src/a.js'), 'console.log("modified");');
    const hash3 = calculateDirectoryHash(testDir);
    assert.notStrictEqual(hash1, hash3);
  });

  test('TEST 2: runProjectTests reports NOT_AVAILABLE when no test script configured', async () => {
    const testDir = path.join(TEST_SCRATCH, 'no_test_script');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'no-tests',
      scripts: {}
    }));

    const result = await runProjectTests(testDir);
    assert.strictEqual(result.status, 'NOT_AVAILABLE');
    assert.ok(result.summary.includes('No test suite configured'));
  });

  test('TEST 3: runProjectTests executes test script and captures truthful passed status', async () => {
    const testDir = path.join(TEST_SCRATCH, 'real_test_script');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'real-tests',
      scripts: {
        test: 'node -e "process.exit(0)"'
      }
    }));

    const result = await runProjectTests(testDir);
    assert.strictEqual(result.status, 'PASSED');
    assert.ok(result.passed >= 1);
  });

  test('TEST 4: runProjectTests executes failing test script and captures truthful failed status', async () => {
    const testDir = path.join(TEST_SCRATCH, 'failing_test_script');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'fail-tests',
      scripts: {
        test: 'node -e "process.exit(1)"'
      }
    }));

    const result = await runProjectTests(testDir);
    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.failed >= 1);
  });

  test('TEST 5: packageVerifiedZip excludes secrets, .env, and node_modules', () => {
    const testDir = path.join(TEST_SCRATCH, 'zip_sanitize_test');
    fs.mkdirSync(path.join(testDir, 'node_modules/fake_dep'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });

    fs.writeFileSync(path.join(testDir, 'src/app.js'), 'const app = 1;');
    fs.writeFileSync(path.join(testDir, '.env'), 'SUPABASE_SERVICE_ROLE_KEY=secret_key');
    fs.writeFileSync(path.join(testDir, 'node_modules/fake_dep/index.js'), 'module.exports = 1;');

    const targetZip = path.join(TEST_SCRATCH, 'verified_output.zip');
    const zipInfo = packageVerifiedZip(testDir, targetZip);

    assert.ok(fs.existsSync(targetZip));
    assert.ok(zipInfo.sha256);
    assert.ok(zipInfo.sizeBytes > 0);

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(targetZip);
    const entries = zip.getEntries().map(e => e.entryName);

    assert.ok(entries.includes('src/app.js'));
    assert.ok(!entries.some(e => e.startsWith('.env')));
    assert.ok(!entries.some(e => e.startsWith('node_modules')));
  });

  test('TEST 6: Verification Persistence in ProjectStore', async () => {
    const mockVerification = {
      verificationId: `verif_test_${Date.now()}`,
      projectId: 'proj_test_1',
      runId: 'run_test_1',
      patchId: 'patch_test_1',
      status: 'VERIFIED',
      target: { method: 'POST', path: '/api/auth/login' },
      before: { status: 500, category: 'RUNTIME_EXCEPTION' },
      after: { status: 401, error: null },
      targetFailureResolved: true,
      tests: { status: 'PASSED', passed: 1, failed: 0 },
      regressions: [],
      originalWorkspaceUnchanged: true,
      decisionReason: 'Crash resolved with 401',
      verifiedAt: new Date().toISOString()
    };

    await createVerificationRecord(mockVerification);
    const saved = await getVerificationById(mockVerification.verificationId);
    assert.ok(saved);
    assert.strictEqual(saved.status, 'VERIFIED');

    const byRun = await getVerificationByRunId('run_test_1');
    assert.ok(byRun);
    assert.strictEqual(byRun.verificationId, mockVerification.verificationId);
  });

  test('TEST 7: Artifact Persistence in ProjectStore', async () => {
    const mockArtifact = {
      artifactId: `art_test_${Date.now()}`,
      verificationId: 'verif_test_1',
      projectId: 'proj_test_1',
      runId: 'run_test_art_1',
      status: 'VERIFIED',
      zipPath: 'C:\\fake\\path\\verified.zip',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sizeBytes: 4096,
      createdAt: new Date().toISOString()
    };

    await createArtifactRecord(mockArtifact);
    const saved = await getArtifactByRunId('run_test_art_1');
    assert.ok(saved);
    assert.strictEqual(saved.sha256, mockArtifact.sha256);
  });

  test('TEST 8: Demo API Complete End-to-End Verification Pipeline (500 TypeError -> 401 Controlled Response)', async () => {
    const demoDir = path.resolve(__dirname, '../../demo-api');
    if (!fs.existsSync(demoDir)) return;

    const projectId = `proj_phase6_demo_${Date.now()}`;
    const paths = initializeProjectWorkspace(projectId);

    // 1. Copy demo-api into original/ and working/
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(demoDir);
    zip.extractAllTo(paths.originalDir, true);
    prepareWorkingWorkspace(projectId, '.');

    // 2. Generate and apply patch to working/
    const mockInvestigation = {
      investigationId: 'inv_demo_phase6',
      rootCause: {
        file: 'src/controllers/authController.js',
        line: 14,
        summary: 'User null check missing before password dereference',
        explanation: 'Missing null check'
      },
      repairStrategy: {
        summary: 'Insert null check',
        filesLikelyAffected: ['src/controllers/authController.js']
      }
    };

    const patch = await generateRepairPatch({
      projectId,
      runId: 'run_phase6_demo',
      investigation: mockInvestigation,
      workingDir: paths.workingDir
    });

    await applyPatchTransaction(paths.workingDir, patch);

    const originalHashBefore = calculateDirectoryHash(paths.originalDir);

    // 3. Execute Phase 6 Real Verification Pipeline
    const report = await executeVerificationPipeline({
      projectId,
      runId: 'run_phase6_demo',
      patchId: patch.patchId,
      originalDir: paths.originalDir,
      workingDir: paths.workingDir,
      previousEvidence: {
        endpoint: { method: 'POST', path: '/api/auth/login' },
        httpStatus: 500,
        category: 'RUNTIME_EXCEPTION',
        evidence: {
          error: 'TypeError: Cannot read properties of null (reading \'password\')',
          payload: { email: 'nonexistent@test.com', password: 'password123' }
        }
      }
    });

    console.log('[TEST 8 Report Debug]', JSON.stringify({
      status: report.status,
      targetProbeResult: report.after,
      tests: report.tests,
      regressions: report.regressions,
      decisionReason: report.decisionReason
    }, null, 2));

    // 4. Validate verification report
    assert.strictEqual(report.status, 'VERIFIED');
    assert.strictEqual(report.before.status, 500);
    assert.ok(report.after.status === 404 || report.after.status === 401);
    assert.strictEqual(report.targetFailureResolved, true);
    assert.ok(report.decisionReason.includes('eliminated'));

    // 5. Validate original workspace remains strictly unmodified
    const originalHashAfter = calculateDirectoryHash(paths.originalDir);
    assert.strictEqual(originalHashBefore, originalHashAfter);

    // 6. Validate verified ZIP artifact was generated
    assert.ok(report.artifact);
    assert.ok(fs.existsSync(report.artifact.zipPath));
    assert.ok(report.artifact.sha256);
    assert.ok(report.artifact.sizeBytes > 0);

    // Clean up
    try { fs.rmSync(paths.projectDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('TEST 9: Unresolved failure (endpoint still returning 500) triggers VERIFICATION_FAILED', async () => {
    const demoDir = path.resolve(__dirname, '../../demo-api');
    if (!fs.existsSync(demoDir)) return;

    const projectId = `proj_phase6_fail_${Date.now()}`;
    const paths = initializeProjectWorkspace(projectId);

    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(demoDir);
    zip.extractAllTo(paths.originalDir, true);
    prepareWorkingWorkspace(projectId, '.');

    // DO NOT apply patch (leave the bug in working/)
    const report = await executeVerificationPipeline({
      projectId,
      runId: 'run_phase6_fail',
      patchId: 'patch_dummy',
      originalDir: paths.originalDir,
      workingDir: paths.workingDir,
      previousEvidence: {
        endpoint: { method: 'POST', path: '/api/auth/login' },
        httpStatus: 500,
        category: 'RUNTIME_EXCEPTION',
        evidence: {
          error: 'TypeError: Cannot read properties of null (reading \'password\')',
          payload: { email: 'nonexistent@test.com', password: 'password123' }
        }
      }
    });

    assert.strictEqual(report.status, 'VERIFICATION_FAILED');
    assert.strictEqual(report.targetFailureResolved, false);
    assert.strictEqual(report.after.status, 500);
    assert.ok(report.decisionReason.includes('still returned HTTP 500'));
    assert.strictEqual(report.artifact, null);

    try { fs.rmSync(paths.projectDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('TEST 10: packageVerifiedZip strictly excludes node_modules, .git, .env, and build artifacts', () => {
    const testDir = path.join(TEST_SCRATCH, 'zip_sanitization_test');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'node_modules/express'), { recursive: true });
    fs.mkdirSync(path.join(testDir, '.git/objects'), { recursive: true });
    fs.mkdirSync(path.join(testDir, '.next/server'), { recursive: true });

    fs.writeFileSync(path.join(testDir, 'src/server.js'), 'console.log("clean source");');
    fs.writeFileSync(path.join(testDir, 'package.json'), '{"name":"clean-pkg"}');
    fs.writeFileSync(path.join(testDir, '.env'), 'SECRET_KEY=leak_me_not');
    fs.writeFileSync(path.join(testDir, '.env.local'), 'LOCAL_SECRET=super_secret');
    fs.writeFileSync(path.join(testDir, 'node_modules/express/index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(testDir, '.git/objects/abc'), 'git binary');

    const outputZip = path.join(TEST_SCRATCH, 'clean_output.zip');
    const zipInfo = packageVerifiedZip(testDir, outputZip);

    assert.ok(fs.existsSync(outputZip));
    assert.ok(zipInfo.sizeBytes > 0);
    assert.ok(zipInfo.sha256);

    const AdmZip = require('adm-zip');
    const extractedZip = new AdmZip(outputZip);
    const entries = extractedZip.getEntries().map(e => e.entryName);

    // Verify included files
    assert.ok(entries.includes('src/server.js') || entries.includes('src\\server.js'));
    assert.ok(entries.includes('package.json'));

    // Verify strictly excluded files
    assert.ok(!entries.some(e => e.startsWith('node_modules')));
    assert.ok(!entries.some(e => e.startsWith('.git')));
    assert.ok(!entries.some(e => e.startsWith('.env')));
    assert.ok(!entries.some(e => e.startsWith('.next')));
  });

  test('TEST 11: Artifact metadata is persisted and retrieved across store lookups', async () => {
    const runId = `run_test_art_${Date.now()}`;
    const testZip = path.join(TEST_SCRATCH, 'persisted_artifact.zip');
    fs.writeFileSync(testZip, 'dummy zip content');

    const meta = {
      artifactId: `art_${Date.now()}`,
      runId,
      zipPath: testZip,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sizeBytes: 17,
      status: 'VERIFIED',
      createdAt: new Date().toISOString()
    };

    await createArtifactRecord(meta);
    const retrieved = await getArtifactByRunId(runId);

    assert.ok(retrieved);
    assert.strictEqual(retrieved.runId, runId);
    assert.strictEqual(retrieved.zipPath, testZip);
    assert.strictEqual(retrieved.status, 'VERIFIED');
  });
});

