const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const { safeExtractZip, validateZipHeader } = require('../src/services/zipSecurity');
const { discoverProjects } = require('../src/services/projectDiscoveryService');
const {
  initializeProjectWorkspace,
  prepareWorkingWorkspace,
  getProjectPaths
} = require('../src/services/workspaceManager');
const {
  createProjectRecord,
  getProjectById,
  updateProjectRecord
} = require('../src/services/projectStore');

const TEST_DIR = path.resolve(__dirname, '../data/test_scratch');

function createZipBuffer(files) {
  const zip = new AdmZip();
  for (const [filePath, content] of Object.entries(files)) {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    zip.addFile(filePath, Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

describe('APIFIX V2 — Phase 2: Real Project Upload & Discovery', () => {
  before(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (e) {}
  });

  test('TEST 1: ZIP with package.json at root is detected accurately as Node.js Express', () => {
    const zipPath = path.join(TEST_DIR, 'test1_root.zip');
    const extractDir = path.join(TEST_DIR, 'extract1');
    const files = {
      'package.json': JSON.stringify({
        name: 'my-express-api',
        version: '1.0.0',
        dependencies: { express: '^4.19.2' }
      }),
      'src/server.js': 'const express = require("express");',
      'tests/api.test.js': 'test("api", () => {});'
    };

    fs.writeFileSync(zipPath, createZipBuffer(files));

    const extractRes = safeExtractZip(zipPath, extractDir);
    assert.strictEqual(extractRes.success, true);
    assert.strictEqual(extractRes.fileCount, 3);

    const discovery = discoverProjects(extractDir);
    assert.strictEqual(discovery.success, true);
    assert.strictEqual(discovery.multipleDetected, false);
    assert.strictEqual(discovery.selectedCandidate.name, 'my-express-api');
    assert.strictEqual(discovery.selectedCandidate.technology, 'node');
    assert.strictEqual(discovery.selectedCandidate.framework, 'express');
    assert.strictEqual(discovery.selectedCandidate.manifest, 'package.json');
    assert.strictEqual(discovery.selectedCandidate.hasSrc, true);
    assert.strictEqual(discovery.selectedCandidate.hasTests, true);
    assert.strictEqual(discovery.selectedCandidate.supported, true);
  });

  test('TEST 2: ZIP with project nested one directory deep is discovered correctly', () => {
    const zipPath = path.join(TEST_DIR, 'test2_nested.zip');
    const extractDir = path.join(TEST_DIR, 'extract2');
    const files = {
      'nested-app/package.json': JSON.stringify({
        name: 'nested-service',
        dependencies: { fastify: '^4.26.0' }
      }),
      'nested-app/src/index.js': 'const fastify = require("fastify")();'
    };

    fs.writeFileSync(zipPath, createZipBuffer(files));

    safeExtractZip(zipPath, extractDir);
    const discovery = discoverProjects(extractDir);

    assert.strictEqual(discovery.success, true);
    assert.strictEqual(discovery.selectedCandidate.name, 'nested-service');
    assert.strictEqual(discovery.selectedCandidate.framework, 'fastify');
    assert.strictEqual(discovery.selectedCandidate.relativePath, 'nested-app');
  });

  test('TEST 3: ZIP with multiple package.json projects detects all candidates', () => {
    const zipPath = path.join(TEST_DIR, 'test3_multi.zip');
    const extractDir = path.join(TEST_DIR, 'extract3');
    const files = {
      'backend/package.json': JSON.stringify({
        name: 'backend-api',
        dependencies: { express: '^4.18.0' }
      }),
      'frontend/package.json': JSON.stringify({
        name: 'frontend-ui',
        dependencies: { vite: '^5.0.0', react: '^18.0.0' }
      })
    };

    fs.writeFileSync(zipPath, createZipBuffer(files));

    safeExtractZip(zipPath, extractDir);
    const discovery = discoverProjects(extractDir);

    assert.strictEqual(discovery.success, true);
    assert.strictEqual(discovery.multipleDetected, true);
    assert.strictEqual(discovery.candidateCount, 2);
    assert.strictEqual(discovery.candidates[0].name, 'backend-api');
    assert.strictEqual(discovery.candidates[0].framework, 'express');
    assert.strictEqual(discovery.candidates[1].name, 'frontend-ui');
    assert.strictEqual(discovery.candidates[1].framework, 'vite');
  });

  test('TEST 4: ZIP with requirements.txt detects Python and reports NOT YET SUPPORTED', () => {
    const zipPath = path.join(TEST_DIR, 'test4_python.zip');
    const extractDir = path.join(TEST_DIR, 'extract4');
    const files = {
      'requirements.txt': 'fastapi==0.110.0\nuvicorn==0.28.0\n',
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()'
    };

    fs.writeFileSync(zipPath, createZipBuffer(files));

    safeExtractZip(zipPath, extractDir);
    const discovery = discoverProjects(extractDir);

    assert.strictEqual(discovery.success, true);
    assert.strictEqual(discovery.selectedCandidate.technology, 'python');
    assert.strictEqual(discovery.selectedCandidate.framework, 'fastapi');
    assert.strictEqual(discovery.selectedCandidate.status, 'DETECTED / NOT YET SUPPORTED FOR EXECUTION');
    assert.strictEqual(discovery.selectedCandidate.supported, false);
  });

  test('TEST 5: ZIP with no supported manifest returns clean error', () => {
    const zipPath = path.join(TEST_DIR, 'test5_nomani.zip');
    const extractDir = path.join(TEST_DIR, 'extract5');
    const files = {
      'docs/readme.txt': 'Hello World documentation',
      'images/logo.png': 'png-data'
    };

    fs.writeFileSync(zipPath, createZipBuffer(files));

    safeExtractZip(zipPath, extractDir);
    const discovery = discoverProjects(extractDir);

    assert.strictEqual(discovery.success, false);
    assert.match(discovery.error, /No supported project manifest found/i);
  });

  test('TEST 6: Malicious Zip Slip path traversal attempt is blocked', () => {
    const zipPath = path.join(TEST_DIR, 'test6_malicious.zip');
    const extractDir = path.join(TEST_DIR, 'extract6');

    // Create a zip with an entry that explicitly contains path traversal
    const zip = new AdmZip();
    zip.addFile('placeholder.txt', Buffer.from('malicious content'));
    zip.getEntries()[0].entryName = '../../evil_escape.txt';
    fs.writeFileSync(zipPath, zip.toBuffer());

    assert.throws(() => {
      safeExtractZip(zipPath, extractDir);
    }, /Archive rejected for security reasons/i);
  });

  test('TEST 7: Empty ZIP file is rejected with clean error', () => {
    const zipPath = path.join(TEST_DIR, 'test7_empty.zip');
    const extractDir = path.join(TEST_DIR, 'extract7');

    const zip = new AdmZip();
    fs.writeFileSync(zipPath, zip.toBuffer());

    assert.throws(() => {
      safeExtractZip(zipPath, extractDir);
    }, /Empty project/i);
  });

  test('TEST 8: Workspace Immutability and Working Copy Separation', async () => {
    const projectId = `proj_test_${Date.now()}`;
    const paths = initializeProjectWorkspace(projectId);

    // Simulate extracting files to original/
    fs.writeFileSync(path.join(paths.originalDir, 'package.json'), JSON.stringify({ name: 'immutable-app', dependencies: { express: '4' } }));
    fs.mkdirSync(path.join(paths.originalDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(paths.originalDir, 'src/server.js'), 'const initialCode = true;');

    // Prepare working copy
    const workingRes = prepareWorkingWorkspace(projectId, '.');
    assert.strictEqual(fs.existsSync(path.join(paths.workingDir, 'src/server.js')), true);

    // Modify working copy
    fs.writeFileSync(path.join(paths.workingDir, 'src/server.js'), 'const modifiedCode = true;');

    // Verify original remains untouched
    const originalContent = fs.readFileSync(path.join(paths.originalDir, 'src/server.js'), 'utf8');
    const workingContent = fs.readFileSync(path.join(paths.workingDir, 'src/server.js'), 'utf8');

    assert.strictEqual(originalContent, 'const initialCode = true;');
    assert.strictEqual(workingContent, 'const modifiedCode = true;');
    assert.notStrictEqual(originalContent, workingContent);

    // Persist project metadata
    const record = await createProjectRecord({
      id: projectId,
      userId: 'usr_test_user',
      userEmail: 'dev@apifix.ai',
      name: 'immutable-app',
      technology: 'node',
      framework: 'express',
      originalPath: paths.originalDir,
      workingPath: paths.workingDir,
      status: 'ready'
    });

    assert.strictEqual(record.id, projectId);
    const fetched = await getProjectById(projectId, { id: 'usr_test_user', email: 'dev@apifix.ai' });
    assert.strictEqual(fetched.name, 'immutable-app');

    // Clean up
    try { fs.rmSync(paths.projectDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('TEST 9: Demo ZIP regression test from demo-api/ is discovered as Express', () => {
    const demoDir = path.resolve(__dirname, '../../demo-api');
    if (!fs.existsSync(demoDir)) return;

    const zipPath = path.join(TEST_DIR, 'apifix_demo_broken_api.zip');
    const extractDir = path.join(TEST_DIR, 'extract_demo');

    // Build zip from demo-api
    const zip = new AdmZip();
    zip.addLocalFolder(demoDir);
    fs.writeFileSync(zipPath, zip.toBuffer());

    safeExtractZip(zipPath, extractDir);
    const discovery = discoverProjects(extractDir);

    assert.strictEqual(discovery.success, true);
    assert.strictEqual(discovery.selectedCandidate.technology, 'node');
    assert.strictEqual(discovery.selectedCandidate.framework, 'express');
    assert.strictEqual(discovery.selectedCandidate.manifest, 'package.json');
    assert.strictEqual(discovery.selectedCandidate.hasSrc, true);
    assert.strictEqual(discovery.selectedCandidate.hasTests, true);
  });
});
