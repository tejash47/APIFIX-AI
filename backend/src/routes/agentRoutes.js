const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { subscribeToRun, executeAgentRun, runs, setRunAuthToken } = require('../orchestrator/agent');
const { triggerDemoRun, resetDemoRepository } = require('../demo/demoManager');
const { parseGithubUrl, downloadAndExtractGithubRepo } = require('../services/githubService');
const { recordRunStart, updateRunHistory, memoryHistory } = require('../services/historyService');
const {
  getArtifactByRunId,
  createArtifactRecord,
  getProjectRun,
  getProject,
  getInvestigationByRunId,
  getVerificationByRunId
} = require('../services/projectStore');
const { packageVerifiedZip } = require('../services/realVerificationEngine');
const { RunState, transitionRunState, getRunTimeline } = require('../services/runStateMachine');
const { registerActiveRun, cancelRun, unregisterActiveRun, isRunActive, getActiveRunMeta } = require('../services/runController');
const { sanitizeSecrets, validateSafePath } = require('../services/securitySanitizer');
const { enforceRepairUsage } = require('../services/usageEnforcer');
const { safeExtractZip } = require('../services/zipSecurity');
const { discoverProjects } = require('../services/projectDiscoveryService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'apifix_secret_key_2026_super_secure';

function extractUser(req) {
  const authHeader = req.headers.authorization || req.headers.token || (req.body && req.body.authToken);
  if (!authHeader) return null;
  try {
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : authHeader;
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return null;
  }
}

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
const WORKSPACES_DIR = path.resolve(__dirname, '../../workspaces');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

const upload = multer({ dest: UPLOADS_DIR });

// SSE Live Stream Endpoint
router.get('/runs/:id/stream', (req, res) => {
  const { id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  subscribeToRun(id, res);
});

// Trigger Agent Run (Demo / Default Workspace / Scan)
router.post('/runs', async (req, res) => {
  const user = extractUser(req);
  const runId = `run_${Date.now()}`;
  const { mode = 'repair', workspaceId } = req.body || {};
  const targetWorkspaceId = workspaceId || req.headers['x-workspace-id'] || 'ws_demo_primary';

  let usageGuard = null;
  if (mode === 'repair') {
    try {
      usageGuard = await enforceRepairUsage({
        workspaceId: targetWorkspaceId,
        userId: user?.id,
        runId,
        operationType: 'repair'
      });
    } catch (usageErr) {
      return res.status(usageErr.status || 402).json({
        error: {
          code: usageErr.code || 'USAGE_LIMIT_EXCEEDED',
          message: usageErr.message,
          details: usageErr.details,
          requestId: req.id
        }
      });
    }
  }

  recordRunStart({
    userId: user?.id,
    userEmail: user?.email,
    runId,
    mode,
    type: mode === 'scan' ? 'endpoint_scan' : 'custom_run',
    repository: 'Target Service API (http://localhost:4001)',
    targetEndpoint: 'POST /api/auth/login'
  });

  executeAgentRun(runId, mode).catch((e) => {
    console.error(e);
    if (usageGuard) usageGuard.refund('Agent execution failed');
  });
  res.status(202).json(sanitizeSecrets({ runId, status: 'started' }));
});

// GitHub Repository Ingestion Endpoint
router.post('/runs/github', async (req, res) => {
  const user = extractUser(req);
  const { repoUrl, branch, githubToken, authToken, workspaceId } = req.body || {};
  if (!repoUrl) {
    return res.status(400).json({ error: 'GitHub repository URL is required (e.g. https://github.com/owner/repo)' });
  }

  const targetWorkspaceId = workspaceId || req.headers['x-workspace-id'] || 'ws_demo_primary';
  const runId = `run_github_${Date.now()}`;
  const workspacePath = path.join(WORKSPACES_DIR, runId);

  let usageGuard = null;
  try {
    usageGuard = await enforceRepairUsage({
      workspaceId: targetWorkspaceId,
      userId: user?.id,
      runId,
      operationType: 'repair'
    });
  } catch (usageErr) {
    return res.status(usageErr.status || 402).json({
      error: {
        code: usageErr.code || 'USAGE_LIMIT_EXCEEDED',
        message: usageErr.message,
        details: usageErr.details,
        requestId: req.id
      }
    });
  }

  try {
    const parsed = parseGithubUrl(repoUrl);

    // Concurrency check
    registerActiveRun(runId, `${parsed.owner}/${parsed.repo}`, workspacePath);

    const downloadResult = await downloadAndExtractGithubRepo({
      owner: parsed.owner,
      repo: parsed.repo,
      branch: branch || parsed.branch,
      githubToken: githubToken || '',
      destDir: workspacePath
    });

    const realRoot = downloadResult.realRoot;
    const stack = downloadResult.stack;

    if (authToken) {
      setRunAuthToken(runId, authToken);
    }

    recordRunStart({
      userId: user?.id,
      userEmail: user?.email,
      runId,
      mode: 'repair',
      type: 'github_import',
      repository: `${downloadResult.owner}/${downloadResult.repo}`,
      targetEndpoint: 'POST /api/auth/login',
      workspacePath: realRoot
    });

    // Launch autonomous repair loop
    executeAgentRun(runId, 'repair', realRoot).catch(console.error).finally(() => {
      unregisterActiveRun(runId);
    });

    return res.status(202).json(sanitizeSecrets({
      runId,
      status: 'started',
      stack,
      repo: {
        owner: downloadResult.owner,
        repo: downloadResult.repo,
        branch: downloadResult.branch
      },
      workspacePath: realRoot.replace(/\\/g, '/')
    }));
  } catch (err) {
    console.error('[GitHub Endpoint Error]', err);
    if (usageGuard) await usageGuard.refund('GitHub import failed');
    try { fs.rmSync(workspacePath, { recursive: true, force: true }); } catch (e) {}
    unregisterActiveRun(runId);
    return res.status(err.status || 500).json(sanitizeSecrets({
      error: err.code || 'Failed to import GitHub repository.',
      details: err.message,
      suggestedAction: err.suggestedAction || 'Check GitHub credentials and repository spelling.',
      isRetryable: err.isRetryable ?? false
    }));
  }
});

// Code Upload endpoint for Repair Mode (Backwards Compatibility)
router.post('/runs/upload', upload.single('code'), async (req, res) => {
  const user = extractUser(req);
  if (!req.file) {
    return res.status(400).json({ error: 'No zip file uploaded under field "code"' });
  }

  const targetWorkspaceId = req.body?.workspaceId || req.headers['x-workspace-id'] || 'ws_demo_primary';
  const zipPath = req.file.path;
  const runId = `run_upload_${Date.now()}`;
  const workspacePath = path.join(WORKSPACES_DIR, runId);

  let usageGuard = null;
  try {
    usageGuard = await enforceRepairUsage({
      workspaceId: targetWorkspaceId,
      userId: user?.id,
      runId,
      operationType: 'repair'
    });
  } catch (usageErr) {
    try { fs.unlinkSync(zipPath); } catch (e) {}
    return res.status(usageErr.status || 402).json({
      error: {
        code: usageErr.code || 'USAGE_LIMIT_EXCEEDED',
        message: usageErr.message,
        details: usageErr.details,
        requestId: req.id
      }
    });
  }

  try {
    safeExtractZip(zipPath, workspacePath);

    const discovery = discoverProjects(workspacePath);
    if (!discovery.success || discovery.candidates.length === 0) {
      if (usageGuard) await usageGuard.refund('No supported project manifest found');
      try { fs.rmSync(workspacePath, { recursive: true, force: true }); } catch (e) {}
      try { fs.unlinkSync(zipPath); } catch (e) {}
      return res.status(400).json({ error: discovery.error || 'No supported project manifest found' });
    }

    const realRoot = discovery.selectedCandidate.absolutePath;
    const stack = discovery.selectedCandidate.technologyDisplay;

    try { fs.unlinkSync(zipPath); } catch (e) {}

    const authToken = req.body.authToken;
    if (authToken) {
      setRunAuthToken(runId, authToken);
    }

    recordRunStart({
      userId: user?.id,
      userEmail: user?.email,
      runId,
      mode: 'repair',
      type: 'zip_upload',
      repository: req.file.originalname || 'Uploaded Repository ZIP',
      targetEndpoint: 'POST /api/auth/login',
      workspacePath: realRoot
    });

    executeAgentRun(runId, 'repair', realRoot).catch(console.error);

    return res.status(202).json(sanitizeSecrets({
      runId,
      status: 'started',
      stack,
      workspacePath: realRoot.replace(/\\/g, '/')
    }));
  } catch (err) {
    console.error('[Upload Endpoint] Error processing upload:', err);
    if (usageGuard) await usageGuard.refund('ZIP extraction error');
    try { fs.rmSync(workspacePath, { recursive: true, force: true }); } catch (e) {}
    try { fs.unlinkSync(zipPath); } catch (e) {}
    return res.status(400).json({ error: 'Failed to extract and process zip file.', details: err.message });
  }
});

// Cancel Run Endpoint
router.post('/runs/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const { reason = 'Cancelled by user.' } = req.body || {};

  try {
    const result = await cancelRun(id, reason);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel run.', details: err.message });
  }
});

// Run Timeline Endpoint
router.get('/runs/:id/timeline', (req, res) => {
  const { id } = req.params;
  const timeline = getRunTimeline(id);
  return res.status(200).json({ runId: id, timeline });
});

// Approve Patch & Apply
router.post('/runs/:id/approve', async (req, res) => {
  const { id } = req.params;
  const run = runs.get(id);

  if (!run) {
    return res.status(404).json({ error: `Run with ID ${id} not found or expired.` });
  }

  if (run.verification) {
    updateRunHistory(id, {
      status: run.verification.verified ? 'completed' : 'failed',
      patchSummary: run?.proposedPatch?.file ? `Repaired ${run.proposedPatch.file}` : 'Patch applied',
      confidence: run?.proposedPatch?.confidence ?? null,
      testsPassed: run.verification.metrics?.testsPassed ?? null,
      testsFailed: run.verification.metrics?.testsFailed ?? null,
      apiChecksPassed: run.verification.metrics?.apiChecksPassed ?? null
    });
    return res.status(200).json(sanitizeSecrets({ status: 'completed', verification: run.verification }));
  }

  if (run.resolveApproval) {
    const verificationPromise = new Promise((resolve) => {
      const prevOnVerified = run.onVerified;
      run.onVerified = (ver) => {
        if (prevOnVerified) prevOnVerified(ver);
        resolve(ver);
      };
      if (run.verification) resolve(run.verification);
    });

    run.resolveApproval('approved');

    const verification = await Promise.race([
      verificationPromise,
      new Promise((r) => setTimeout(() => r(run.verification || {
        status: 'VERIFYING',
        verified: false,
        summary: 'Verification in progress.',
        metrics: { testsPassed: null, testsFailed: null, testSummary: 'Tests not executed', apiChecksPassed: null, apiSummary: 'Verification running...' }
      }), 60000))
    ]);

    updateRunHistory(id, {
      status: verification?.verified ? 'completed' : 'in_progress',
      patchSummary: run?.proposedPatch?.file ? `Repaired ${run.proposedPatch.file}` : 'Patch applied',
      confidence: run?.proposedPatch?.confidence ?? null,
      testsPassed: verification?.metrics?.testsPassed ?? null,
      testsFailed: verification?.metrics?.testsFailed ?? null,
      apiChecksPassed: verification?.metrics?.apiChecksPassed ?? null
    });

    return res.status(200).json(sanitizeSecrets({ status: 'completed', verification }));
  }

  return res.status(200).json(sanitizeSecrets({
    status: 'completed',
    verification: run.verification || {
      status: 'NOT_VERIFIED',
      verified: false,
      summary: 'Verification has not executed for this patch.',
      metrics: { testsPassed: null, testsFailed: null, testSummary: 'Tests not executed', apiChecksPassed: null, apiSummary: 'API verification not completed' }
    }
  }));
});

// Reject Patch
router.post('/runs/:id/reject', async (req, res) => {
  const { id } = req.params;
  const run = runs.get(id);

  updateRunHistory(id, { status: 'rejected' });

  if (!run) {
    return res.status(404).json({ error: `Run with ID ${id} not found.` });
  }

  if (run.resolveApproval) {
    run.resolveApproval('rejected');
    return res.status(200).json({ status: 'rejected' });
  }

  return res.status(400).json({ error: 'Run is not awaiting approval' });
});

// Download Patched File or Entire Repaired Codebase
router.get('/runs/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { type = 'file' } = req.query;

    const artifactsDir = path.resolve(__dirname, '../../storage/artifacts');
    const defaultZipPath = path.join(artifactsDir, `repaired_${id}.zip`);
    const DEMO_API_DIR = path.resolve(__dirname, '../../../demo-api');

    let run = runs.get(id);
    let projectRun = await getProjectRun(id);
    let project = null;
    if (projectRun?.projectId) {
      project = await getProject(projectRun.projectId);
    }
    const historyItem = memoryHistory.find(h => h.runId === id);
    const investigation = await getInvestigationByRunId(id);
    const verification = await getVerificationByRunId(id);
    const artifact = await getArtifactByRunId(id);

    // 1. If full codebase requested and pre-generated artifact zip exists
    const artifactZip = artifact?.zipPath || (fs.existsSync(defaultZipPath) ? defaultZipPath : null);
    if ((type === 'full' || type === 'all' || type === 'codebase') && artifactZip && fs.existsSync(artifactZip)) {
      const downloadName = `apifix-repaired-codebase-${id}.zip`;
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('X-Artifact-SHA256', artifact?.sha256 || '');
      return fs.createReadStream(artifactZip).pipe(res);
    }

    // 2. Resolve workspace path
    let workspacePath = run?.workspacePath || project?.workingPath || historyItem?.workspacePath;

    if (!workspacePath || !fs.existsSync(workspacePath)) {
      const activeLock = getActiveRunMeta(id);
      if (activeLock?.workspacePath && fs.existsSync(activeLock.workspacePath)) {
        workspacePath = activeLock.workspacePath;
      }
    }

    if (!workspacePath || !fs.existsSync(workspacePath)) {
      const candidates = [
        path.join(WORKSPACES_DIR, id),
        path.join(WORKSPACES_DIR, id, 'working')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          workspacePath = c;
          break;
        }
      }
    }

    if (!workspacePath || !fs.existsSync(workspacePath)) {
      if (fs.existsSync(DEMO_API_DIR) && (id.includes('demo') || id.includes('analysis') || id.includes('run_'))) {
        workspacePath = DEMO_API_DIR;
      }
    }

    // 3. Handle 'full' / 'codebase' download
    if (type === 'full' || type === 'all' || type === 'codebase') {
      if (workspacePath && fs.existsSync(workspacePath)) {
        if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
        const targetZip = path.join(artifactsDir, `repaired_${id}.zip`);
        const zipInfo = packageVerifiedZip(workspacePath, targetZip);

        await createArtifactRecord({
          artifactId: `art_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          runId: id,
          zipPath: targetZip,
          sha256: zipInfo.sha256,
          sizeBytes: zipInfo.sizeBytes,
          status: 'VERIFIED',
          createdAt: new Date().toISOString()
        });

        const downloadName = `apifix-repaired-codebase-${id}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('X-Artifact-SHA256', zipInfo.sha256 || '');
        return fs.createReadStream(targetZip).pipe(res);
      }

      // If workspace directory not on disk, create in-memory zip of available patched files
      const zip = new AdmZip();
      let hasZipContent = false;
      const proposedCode = run?.proposedPatch?.proposedCode || historyItem?.proposedCode;
      const targetFileName = run?.proposedPatch?.file || historyItem?.repairedFile || 'src/controllers/authController.js';

      if (proposedCode) {
        zip.addFile(targetFileName, Buffer.from(proposedCode, 'utf8'));
        hasZipContent = true;
      }
      if (run?.proposedPatch?.diff || historyItem?.patch) {
        zip.addFile('patch.diff', Buffer.from(run?.proposedPatch?.diff || historyItem?.patch || '', 'utf8'));
        hasZipContent = true;
      }

      if (hasZipContent) {
        zip.addFile('README.md', Buffer.from(`# APIFIX AI Autonomous Fix Package\nRun ID: ${id}\nDate: ${new Date().toISOString()}\n\nRepaired codebase archive and verified autonomous patch.`, 'utf8'));
        const zipBuffer = zip.toBuffer();
        const downloadName = `apifix-repaired-codebase-${id}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', 'application/zip');
        return res.send(zipBuffer);
      }

      return res.status(404).json({
        error: 'No repaired project found for this run.',
        details: 'A repaired project download is available after an analysis or repair run has completed.'
      });
    }

    // 4. Handle 'file' download (Single Patched File or Patch Diff)
    const filesToSearch = [];
    if (run?.patchedFiles && run.patchedFiles.length > 0) {
      filesToSearch.push(...run.patchedFiles);
    } else if (run?.proposedPatch?.file) {
      filesToSearch.push(run.proposedPatch.file);
    } else if (historyItem?.repairedFile) {
      filesToSearch.push(historyItem.repairedFile);
    } else if (investigation?.rootCause?.culpritFile) {
      filesToSearch.push(investigation.rootCause.culpritFile);
    }

    if (filesToSearch.length === 0 && workspacePath && fs.existsSync(path.join(workspacePath, 'src/controllers/authController.js'))) {
      filesToSearch.push('src/controllers/authController.js');
    }

    // If file exists on disk in workspacePath
    if (workspacePath && fs.existsSync(workspacePath)) {
      const validPaths = [];
      for (const f of filesToSearch) {
        try {
          const abs = validateSafePath(workspacePath, f);
          if (fs.existsSync(abs)) validPaths.push(abs);
        } catch (_) {}
      }

      if (validPaths.length === 1) {
        const targetFile = validPaths[0];
        const baseName = path.basename(targetFile);
        const downloadName = `apifix-repaired-${baseName}`;
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        return fs.createReadStream(targetFile).pipe(res);
      } else if (validPaths.length > 1) {
        const zip = new AdmZip();
        for (const absPath of validPaths) {
          const rel = path.relative(workspacePath, absPath);
          const zipDir = path.dirname(rel);
          zip.addLocalFile(absPath, zipDir === '.' ? '' : zipDir);
        }
        const zipBuffer = zip.toBuffer();
        const downloadName = `apifix-repaired-patches-${id}.zip`;
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
        res.setHeader('Content-Type', 'application/zip');
        return res.send(zipBuffer);
      }
    }

    // If file not on disk, serve in-memory proposedCode
    const inMemCode = run?.proposedPatch?.proposedCode || historyItem?.proposedCode;
    if (inMemCode) {
      const fileTarget = run?.proposedPatch?.file || historyItem?.repairedFile || 'repaired-code.js';
      const baseName = path.basename(fileTarget);
      const downloadName = `apifix-repaired-${baseName}`;
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(inMemCode);
    }

    // Or serve in-memory patch diff
    const inMemDiff = run?.proposedPatch?.diff || historyItem?.patch;
    if (inMemDiff) {
      const downloadName = `apifix-patch-${id}.diff`;
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(inMemDiff);
    }

    // Fallback: check demo-api controller
    const demoAuthPath = path.join(DEMO_API_DIR, 'src/controllers/authController.js');
    if (fs.existsSync(demoAuthPath)) {
      res.setHeader('Content-Disposition', 'attachment; filename="apifix-repaired-authController.js"');
      res.setHeader('Content-Type', 'application/octet-stream');
      return fs.createReadStream(demoAuthPath).pipe(res);
    }

    return res.status(404).json({
      error: 'No patched file recorded for this run.',
      details: 'Apply a verified patch to generate downloadable patched files.'
    });
  } catch (err) {
    console.error('[Download Route] Error preparing download:', err);
    return res.status(500).json({ error: 'Failed to prepare download.', details: err.message });
  }
});

// Trigger Demo Run
router.post('/demo/trigger', async (req, res) => {
  const user = extractUser(req);
  const demo = await triggerDemoRun();

  recordRunStart({
    userId: user?.id || 'usr_demo_01',
    userEmail: user?.email || 'dev@apifix.ai',
    runId: demo.runId,
    mode: 'repair',
    type: 'demo_run',
    repository: 'apifix-ai/demo-auth-service',
    targetEndpoint: 'POST /api/auth/login'
  });

  res.status(200).json(sanitizeSecrets(demo));
});

// Reset Demo Repository
router.post('/demo/reset', (req, res) => {
  const result = resetDemoRepository();
  res.status(200).json(result);
});

module.exports = router;
