const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { allocateAvailablePort, isPortOpen } = require('../src/services/portManager');
const { createSanitizedEnv, resolveStartCommand, startApplicationProcess, stopProcess, getProcessLogs } = require('../src/services/processManager');
const { discoverProjectEndpoints, discoverOpenApiEndpoints } = require('../src/services/apiDiscoveryService');
const { probeProjectEndpoints, makeHttpRequest, classifyResult } = require('../src/services/endpointProber');
const { initializeProjectWorkspace, prepareWorkingWorkspace } = require('../src/services/workspaceManager');
const { createProjectRecord, getProjectById } = require('../src/services/projectStore');
const { executeProjectAnalysis } = require('../src/orchestrator/realExecutionPipeline');

const TEST_SCRATCH = path.resolve(__dirname, '../data/test_phase3_scratch');

describe('APIFIX V2 — Phase 3: Real Project Execution & API Discovery', () => {
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

  test('TEST 1: Dynamic Port Allocation returns open, non-colliding ports', async () => {
    const port1 = await allocateAvailablePort();
    const port2 = await allocateAvailablePort();

    assert.ok(typeof port1 === 'number' && port1 > 0);
    assert.ok(typeof port2 === 'number' && port2 > 0);
    assert.notStrictEqual(port1, port2);
  });

  test('TEST 2: Environment Sanitization strips control plane secrets', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret_service_key_123';
    process.env.AI_PROVIDER_KEY = 'ai_secret_xyz';
    process.env.JWT_SECRET = 'jwt_secret_abc';

    const sanitized = createSanitizedEnv(43210);

    assert.strictEqual(sanitized.PORT, '43210');
    assert.strictEqual(sanitized.HOST, '127.0.0.1');
    assert.strictEqual(sanitized.NODE_ENV, 'development');
    assert.strictEqual(sanitized.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.strictEqual(sanitized.AI_PROVIDER_KEY, undefined);
    assert.strictEqual(sanitized.JWT_SECRET, undefined);
  });

  test('TEST 3: Static Route Discovery from Express source code', () => {
    const projDir = path.join(TEST_SCRATCH, 'express_discovery_proj');
    fs.mkdirSync(path.join(projDir, 'src/routes'), { recursive: true });

    fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
      name: 'discovery-test',
      dependencies: { express: '^4.19.0' }
    }));

    fs.writeFileSync(path.join(projDir, 'src/routes/authRoutes.js'), `
      const express = require('express');
      const router = express.Router();
      router.post('/login', (req, res) => res.json({ ok: true }));
      router.get('/profile', (req, res) => res.json({ profile: true }));
      module.exports = router;
    `);

    fs.writeFileSync(path.join(projDir, 'src/server.js'), `
      const express = require('express');
      const authRoutes = require('./routes/authRoutes');
      const app = express();
      app.use('/api/auth', authRoutes);
      app.get('/health', (req, res) => res.send('OK'));
    `);

    const endpoints = discoverProjectEndpoints(projDir);

    const loginEp = endpoints.find(e => e.method === 'POST' && e.path === '/api/auth/login');
    const profileEp = endpoints.find(e => e.method === 'GET' && e.path === '/api/auth/profile');
    const healthEp = endpoints.find(e => e.method === 'GET' && e.path === '/health');

    assert.ok(loginEp, 'POST /api/auth/login should be discovered');
    assert.ok(profileEp, 'GET /api/auth/profile should be discovered');
    assert.ok(healthEp, 'GET /health should be discovered');
  });

  test('TEST 4: OpenAPI / Swagger route specification discovery', () => {
    const projDir = path.join(TEST_SCRATCH, 'openapi_proj');
    fs.mkdirSync(projDir, { recursive: true });

    fs.writeFileSync(path.join(projDir, 'openapi.json'), JSON.stringify({
      openapi: '3.0.0',
      paths: {
        '/api/products': {
          get: { summary: 'List products' },
          post: { summary: 'Create product' }
        },
        '/api/orders': {
          get: { summary: 'List orders', security: [{ bearerAuth: [] }] }
        }
      }
    }));

    const endpoints = discoverOpenApiEndpoints(projDir);
    assert.strictEqual(endpoints.length, 3);

    const getOrders = endpoints.find(e => e.path === '/api/orders');
    assert.ok(getOrders);
    assert.strictEqual(getOrders.authRequired, true);
    assert.strictEqual(getOrders.discoveryMethod, 'openapi');
  });

  test('TEST 5: Real Node.js Application Startup on Dynamic Port & 200 OK Probe', async () => {
    const runId = `run_test_valid_${Date.now()}`;
    const projDir = path.join(TEST_SCRATCH, 'valid_run_app');
    fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });

    fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
      name: 'valid-test-app',
      main: 'src/server.js',
      scripts: { start: 'node src/server.js' }
    }));

    fs.writeFileSync(path.join(projDir, 'src/server.js'), `
      const http = require('http');
      const port = process.env.PORT || 3000;
      const server = http.createServer((req, res) => {
        if (req.url === '/api/hello') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', message: 'Hello from test' }));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
      server.listen(port, () => console.log('Listening on ' + port));
    `);

    const port = await allocateAvailablePort();

    try {
      const procInfo = await startApplicationProcess(runId, projDir, port);
      assert.strictEqual(procInfo.port, port);

      const probeRes = await makeHttpRequest('GET', `http://127.0.0.1:${port}/api/hello`);
      assert.strictEqual(probeRes.success, true);
      assert.strictEqual(probeRes.httpStatus, 200);
      assert.strictEqual(probeRes.body.status, 'ok');
    } finally {
      await stopProcess(runId);
    }
  });

  test('TEST 6: Real Failure Reproduction — HTTP 500 error captured with evidence', async () => {
    const runId = `run_test_500_${Date.now()}`;
    const projDir = path.join(TEST_SCRATCH, 'broken_500_app');
    fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });

    fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
      name: 'broken-500-app',
      main: 'src/server.js',
      scripts: { start: 'node src/server.js' }
    }));

    fs.writeFileSync(path.join(projDir, 'src/server.js'), `
      const http = require('http');
      const port = process.env.PORT || 3000;
      const server = http.createServer((req, res) => {
        if (req.url === '/api/auth/login' && req.method === 'POST') {
          try {
            // Intentional runtime exception
            const user = null;
            const pass = user.password;
            res.writeHead(200);
            res.end();
          } catch (err) {
            console.error('TypeError: Cannot read properties of null (reading password)');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message, stack: err.stack }));
          }
        }
      });
      server.listen(port);
    `);

    const port = await allocateAvailablePort();

    try {
      await startApplicationProcess(runId, projDir, port);

      const endpoints = [{ id: '1', method: 'POST', path: '/api/auth/login', sourceFile: 'src/server.js', sourceLine: 8 }];
      const probeRes = await probeProjectEndpoints(endpoints, port, null, 'TypeError: Cannot read properties of null');

      assert.strictEqual(probeRes.failedCount, 1);
      const failure = probeRes.results[0];
      assert.strictEqual(failure.isFailure, true);
      assert.strictEqual(failure.httpStatus, 500);
      assert.strictEqual(failure.category, 'RUNTIME_EXCEPTION');
      assert.ok(failure.evidence);
    } finally {
      await stopProcess(runId);
    }
  });

  test('TEST 7: 404 Route Not Found is categorized as ROUTE_NOT_FOUND', async () => {
    const runId = `run_test_404_${Date.now()}`;
    const projDir = path.join(TEST_SCRATCH, 'app_404');
    fs.mkdirSync(projDir, { recursive: true });

    fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
      name: 'app-404',
      scripts: { start: 'node index.js' }
    }));

    fs.writeFileSync(path.join(projDir, 'index.js'), `
      const http = require('http');
      const port = process.env.PORT || 3000;
      http.createServer((req, res) => {
        res.writeHead(404);
        res.end('Route Not Found');
      }).listen(port);
    `);

    const port = await allocateAvailablePort();

    try {
      await startApplicationProcess(runId, projDir, port);
      const endpoints = [{ id: '1', method: 'GET', path: '/nonexistent', sourceFile: 'index.js', sourceLine: 1 }];
      const probeRes = await probeProjectEndpoints(endpoints, port);

      assert.strictEqual(probeRes.results[0].category, 'ROUTE_NOT_FOUND');
      assert.strictEqual(probeRes.results[0].httpStatus, 404);
    } finally {
      await stopProcess(runId);
    }
  });

  test('TEST 8: Authenticated endpoint marked BLOCKED — AUTH REQUIRED without test token', async () => {
    const endpoints = [{
      id: 'ep_auth_1',
      method: 'GET',
      path: '/api/admin/metrics',
      sourceFile: 'src/routes/admin.js',
      sourceLine: 10,
      authRequired: true
    }];

    const probeRes = await probeProjectEndpoints(endpoints, 9999, null); // no port needed because blocked before call
    assert.strictEqual(probeRes.authRequiredCount, 1);
    assert.strictEqual(probeRes.failedCount, 0);
    assert.strictEqual(probeRes.healthyCount, 0);
    assert.strictEqual(probeRes.results[0].status, 'BLOCKED — AUTH REQUIRED');
    assert.strictEqual(probeRes.results[0].category, 'AUTH_REQUIRED');
  });

  test('TEST 9: Startup failure when app crashes immediately', async () => {
    const runId = `run_crash_${Date.now()}`;
    const projDir = path.join(TEST_SCRATCH, 'crashing_app');
    fs.mkdirSync(projDir, { recursive: true });

    fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
      name: 'crashing-app',
      scripts: { start: 'node crash.js' }
    }));

    fs.writeFileSync(path.join(projDir, 'crash.js'), `
      console.error('Fatal crash on bootstrap: Missing database connection string');
      process.exit(1);
    `);

    const port = await allocateAvailablePort();

    await assert.rejects(async () => {
      await startApplicationProcess(runId, projDir, port);
    }, /STARTUP_FAILURE/i);
  });

  test('TEST 10: Original workspace immutability verified during execution', async () => {
    const projectId = `proj_immut_${Date.now()}`;
    const paths = initializeProjectWorkspace(projectId);

    // Populate original/
    fs.writeFileSync(path.join(paths.originalDir, 'package.json'), JSON.stringify({
      name: 'immutable-test',
      scripts: { start: 'node server.js' }
    }));
    fs.writeFileSync(path.join(paths.originalDir, 'server.js'), `
      const http = require('http');
      http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 3000);
    `);

    const originalHash = fs.readFileSync(path.join(paths.originalDir, 'server.js'), 'utf8');

    // Create working workspace
    prepareWorkingWorkspace(projectId, '.');

    // Execute against working/
    const port = await allocateAvailablePort();
    const runId = `run_immut_${Date.now()}`;
    try {
      await startApplicationProcess(runId, paths.workingDir, port);
    } finally {
      await stopProcess(runId);
    }

    // Verify original/ has not changed
    const currentOriginalContent = fs.readFileSync(path.join(paths.originalDir, 'server.js'), 'utf8');
    assert.strictEqual(currentOriginalContent, originalHash);

    // Clean up
    try { fs.rmSync(paths.projectDir, { recursive: true, force: true }); } catch (e) {}
  });

  test('TEST 11: Demo API project regression — POST /api/auth/login reproduces real 500 error', async () => {
    const demoDir = path.resolve(__dirname, '../../demo-api');
    if (!fs.existsSync(demoDir)) return;

    const projectId = `proj_demo_reg_${Date.now()}`;
    const paths = initializeProjectWorkspace(projectId);

    // Copy demo into original/ and prepare working/
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(demoDir);
    zip.extractAllTo(paths.originalDir, true);

    prepareWorkingWorkspace(projectId, '.');

    const projectRecord = await createProjectRecord({
      id: projectId,
      userId: 'usr_admin_01',
      userEmail: 'admin@apifix.ai',
      name: 'apifix-demo-api',
      technology: 'node',
      technologyDisplay: 'Node.js',
      framework: 'express',
      frameworkDisplay: 'Express',
      manifest: 'package.json',
      originalPath: paths.originalDir,
      workingPath: paths.workingDir,
      status: 'ready'
    });

    // Run real analysis pipeline
    const result = await executeProjectAnalysis({
      projectId,
      user: { id: 'usr_admin_01', email: 'admin@apifix.ai' }
    });

    assert.strictEqual(result.projectId, projectId);
    assert.ok(result.port > 0);
    assert.ok(result.metrics.totalDiscovered >= 1);
    assert.ok(result.metrics.failedCount >= 1);

    // Verify failure evidence captured
    assert.ok(result.primaryFailure);
    assert.match(result.primaryFailure.endpoint, /POST \/api\/auth\/login/i);
    assert.strictEqual(result.primaryFailure.httpStatus, 500);
    assert.ok(result.primaryFailure.evidence);

    // Clean up
    try { fs.rmSync(paths.projectDir, { recursive: true, force: true }); } catch (e) {}
  });
});
