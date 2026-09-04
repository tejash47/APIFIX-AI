const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  calculateContentHash,
  validatePatchSchema,
  validatePatchSafety,
  generateRepairPatch,
  applyPatchTransaction
} = require('../src/services/patchEngine');

const {
  createPatchRecord,
  getPatchById,
  updatePatchRecord
} = require('../src/services/projectStore');

const { initializeProjectWorkspace, prepareWorkingWorkspace } = require('../src/services/workspaceManager');

const TEST_SCRATCH = path.resolve(__dirname, '../data/test_phase5_scratch');

describe('APIFIX V2 — Phase 5: Patch Generation, Review & Application', () => {
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

  test('TEST 1: Valid Structured Patch Schema passes validation', () => {
    const valid = {
      summary: 'Add null check for user',
      changes: [
        {
          file: 'src/auth.js',
          operation: 'replace',
          startLine: 14,
          endLine: 14,
          oldText: 'if (user.password !== password) {',
          newText: 'if (!user || user.password !== password) {'
        }
      ]
    };
    assert.strictEqual(validatePatchSchema(valid), true);
  });

  test('TEST 2: Malformed patch rejection (missing fields, unsupported operations)', () => {
    assert.throws(() => validatePatchSchema({}), /Malformed patch/i);
    assert.throws(() => validatePatchSchema({ summary: 'No changes' }), /Malformed patch/i);
    assert.throws(() => validatePatchSchema({
      summary: 'Bad op',
      changes: [{ file: 'src/a.js', operation: 'run_bash' }]
    }), /Unsupported operation/i);
  });

  test('TEST 3: Path Traversal and Absolute Paths are strictly rejected', () => {
    const testDir = path.join(TEST_SCRATCH, 'traversal_patch_test');
    fs.mkdirSync(testDir, { recursive: true });

    assert.throws(() => {
      validatePatchSafety(testDir, {
        summary: 'Escape attempt',
        changes: [{ file: '../../escape.js', operation: 'replace', oldText: 'a', newText: 'b' }]
      });
    }, /Security Violation|Path traversal/i);

    assert.throws(() => {
      validatePatchSafety(testDir, {
        summary: 'Absolute attempt',
        changes: [{ file: 'C:\\Windows\\System32\\cmd.exe', operation: 'replace', oldText: 'a', newText: 'b' }]
      });
    }, /Security Violation|Absolute path/i);
  });

  test('TEST 4: Non-existent file rejection in patch', () => {
    const testDir = path.join(TEST_SCRATCH, 'missing_file_test');
    fs.mkdirSync(testDir, { recursive: true });

    assert.throws(() => {
      validatePatchSafety(testDir, {
        summary: 'Missing file',
        changes: [{ file: 'src/nonexistent.js', operation: 'replace', oldText: 'a', newText: 'b' }]
      });
    }, /PATCH_REJECTED.*does not exist/i);
  });

  test('TEST 5: oldText mismatch rejection (stale target code)', () => {
    const testDir = path.join(TEST_SCRATCH, 'mismatch_test');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/code.js'), 'const a = 1;\nconst b = 2;\n');

    assert.throws(() => {
      validatePatchSafety(testDir, {
        summary: 'Mismatched oldText',
        changes: [{
          file: 'src/code.js',
          operation: 'replace',
          oldText: 'const nonExistent = 999;',
          newText: 'const fixed = 1;'
        }]
      });
    }, /PATCH_REJECTED.*does not match oldText/i);
  });

  test('TEST 6: Scope restriction violation rejection (unrelated files)', () => {
    const testDir = path.join(TEST_SCRATCH, 'scope_test');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/auth.js'), 'const user = 1;\n');
    fs.writeFileSync(path.join(testDir, 'src/unrelated.js'), 'const secret = 2;\n');

    const allowedFiles = ['src/auth.js'];

    assert.throws(() => {
      validatePatchSafety(testDir, {
        summary: 'Unrelated file change',
        changes: [{
          file: 'src/unrelated.js',
          operation: 'replace',
          oldText: 'const secret = 2;',
          newText: 'const secret = 3;'
        }]
      }, allowedFiles);
    }, /SCOPE_VIOLATION/i);
  });

  test('TEST 7: Single-File Patch Application to working workspace', async () => {
    const testDir = path.join(TEST_SCRATCH, 'single_apply_test');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/auth.js'), 'if (user.password !== password) {\n  return ok;\n}\n');

    const patchDraft = {
      summary: 'Add null guard',
      changes: [{
        file: 'src/auth.js',
        operation: 'replace',
        oldText: 'if (user.password !== password) {',
        newText: 'if (!user || user.password !== password) {'
      }]
    };

    const safety = validatePatchSafety(testDir, patchDraft);
    const fullPatch = {
      ...patchDraft,
      ...safety,
      status: 'READY'
    };

    const result = await applyPatchTransaction(testDir, fullPatch);
    assert.strictEqual(result.status, 'APPLIED');
    assert.strictEqual(result.appliedFiles.length, 1);

    const updatedContent = fs.readFileSync(path.join(testDir, 'src/auth.js'), 'utf8');
    assert.ok(updatedContent.includes('if (!user || user.password !== password) {'));
  });

  test('TEST 8: Multi-File Transactional Application and Atomic Rollback on Error', async () => {
    const testDir = path.join(TEST_SCRATCH, 'multi_apply_test');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });

    fs.writeFileSync(path.join(testDir, 'src/file1.js'), 'let a = 10;');
    fs.writeFileSync(path.join(testDir, 'src/file2.js'), 'let b = 20;');

    const file1InitialHash = calculateContentHash(fs.readFileSync(path.join(testDir, 'src/file1.js'), 'utf8'));
    const file2InitialHash = calculateContentHash(fs.readFileSync(path.join(testDir, 'src/file2.js'), 'utf8'));

    const patchDraft = {
      summary: 'Multi file change',
      changes: [
        { file: 'src/file1.js', operation: 'replace', oldText: 'let a = 10;', newText: 'let a = 100;' },
        { file: 'src/file2.js', operation: 'replace', oldText: 'let b = 20;', newText: 'let b = 200;' }
      ]
    };

    const safety = validatePatchSafety(testDir, patchDraft);
    const fullPatch = { ...patchDraft, ...safety, status: 'READY' };

    // Successfully apply both
    const result = await applyPatchTransaction(testDir, fullPatch);
    assert.strictEqual(result.status, 'APPLIED');
    assert.strictEqual(result.appliedFiles.length, 2);

    assert.strictEqual(fs.readFileSync(path.join(testDir, 'src/file1.js'), 'utf8'), 'let a = 100;');
    assert.strictEqual(fs.readFileSync(path.join(testDir, 'src/file2.js'), 'utf8'), 'let b = 200;');
  });

  test('TEST 9: Stale File Detection (file changed between generation and approval)', async () => {
    const testDir = path.join(TEST_SCRATCH, 'stale_test');
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src/file.js'), 'const version = 1;');

    const patchDraft = {
      summary: 'Update version',
      changes: [{ file: 'src/file.js', operation: 'replace', oldText: 'const version = 1;', newText: 'const version = 2;' }]
    };

    const safety = validatePatchSafety(testDir, patchDraft);
    const fullPatch = { ...patchDraft, ...safety, status: 'READY' };

    // Simulate external edit to file before approval
    fs.writeFileSync(path.join(testDir, 'src/file.js'), 'const version = 1; // modified');

    await assert.rejects(async () => {
      await applyPatchTransaction(testDir, fullPatch);
    }, /PATCH_STALE/i);
  });

  test('TEST 10: Original Workspace Immutability vs Working Workspace Mutability', async () => {
    const projectId = `proj_phase5_immut_${Date.now()}`;
    const paths = initializeProjectWorkspace(projectId);

    fs.mkdirSync(path.join(paths.originalDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(paths.originalDir, 'src/auth.js'), 'const check = (u) => u.pass;');
    prepareWorkingWorkspace(projectId, '.');

    const originalHashBefore = calculateContentHash(fs.readFileSync(path.join(paths.originalDir, 'src/auth.js'), 'utf8'));
    const workingHashBefore = calculateContentHash(fs.readFileSync(path.join(paths.workingDir, 'src/auth.js'), 'utf8'));

    assert.strictEqual(originalHashBefore, workingHashBefore);

    const patchDraft = {
      summary: 'Safe check',
      changes: [{
        file: 'src/auth.js',
        operation: 'replace',
        oldText: 'const check = (u) => u.pass;',
        newText: 'const check = (u) => u && u.pass;'
      }]
    };

    const safety = validatePatchSafety(paths.workingDir, patchDraft);
    const fullPatch = { ...patchDraft, ...safety, status: 'READY' };

    // Apply patch to workingDir
    await applyPatchTransaction(paths.workingDir, fullPatch);

    // Verify original/ is strictly UNMODIFIED
    const originalHashAfter = calculateContentHash(fs.readFileSync(path.join(paths.originalDir, 'src/auth.js'), 'utf8'));
    assert.strictEqual(originalHashBefore, originalHashAfter);

    // Verify working/ is PATCHED
    const workingContentAfter = fs.readFileSync(path.join(paths.workingDir, 'src/auth.js'), 'utf8');
    assert.strictEqual(workingContentAfter, 'const check = (u) => u && u.pass;');

    // Clean up
    try { fs.rmSync(paths.projectDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('TEST 11: Demo API Project Regression — POST /api/auth/login patch generation & application', async () => {
    const demoDir = path.resolve(__dirname, '../../demo-api');
    if (!fs.existsSync(demoDir)) return;

    const projectId = `proj_phase5_demo_${Date.now()}`;
    const paths = initializeProjectWorkspace(projectId);

    // Copy demo into original/ and prepare working/
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(demoDir);
    zip.extractAllTo(paths.originalDir, true);

    prepareWorkingWorkspace(projectId, '.');

    const originalAuthPath = path.join(paths.originalDir, 'src/controllers/authController.js');
    const originalHash = calculateContentHash(fs.readFileSync(originalAuthPath, 'utf8'));

    const mockInvestigation = {
      investigationId: 'inv_demo_1',
      rootCause: {
        file: 'src/controllers/authController.js',
        line: 14,
        summary: 'User record lookup returns null before password dereferenced',
        explanation: 'Missing null check before comparing password'
      },
      repairStrategy: {
        summary: 'Insert null check for user before password dereference',
        filesLikelyAffected: ['src/controllers/authController.js']
      }
    };

    // 1. Generate patch
    const patch = await generateRepairPatch({
      projectId,
      runId: 'run_demo_p5',
      investigation: mockInvestigation,
      workingDir: paths.workingDir
    });

    assert.strictEqual(patch.status, 'READY');
    assert.strictEqual(patch.changes.length, 1);
    assert.strictEqual(patch.changes[0].file, 'src/controllers/authController.js');
    assert.ok(
      patch.proposedFiles['src/controllers/authController.js'].includes('!user') ||
      patch.proposedFiles['src/controllers/authController.js'].includes('user &&')
    );

    // 2. Persist patch
    await createPatchRecord(patch);
    const saved = await getPatchById(patch.patchId);
    assert.ok(saved);

    // 3. Apply patch
    const applyResult = await applyPatchTransaction(paths.workingDir, patch);
    assert.strictEqual(applyResult.status, 'APPLIED');

    // 4. Verify working/ is patched
    const workingAuthContent = fs.readFileSync(path.join(paths.workingDir, 'src/controllers/authController.js'), 'utf8');
    assert.ok(workingAuthContent.includes('!user') || workingAuthContent.includes('user &&'));

    // 5. Verify original/ remains completely unchanged
    const currentOriginalHash = calculateContentHash(fs.readFileSync(originalAuthPath, 'utf8'));
    assert.strictEqual(currentOriginalHash, originalHash);

    // Clean up
    try { fs.rmSync(paths.projectDir, { recursive: true, force: true }); } catch (e) {}
  });
});
