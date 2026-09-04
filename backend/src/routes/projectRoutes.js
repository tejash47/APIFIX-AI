const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const { safeExtractZip, MAX_UPLOAD_SIZE_BYTES } = require('../services/zipSecurity');
const { discoverProjects } = require('../services/projectDiscoveryService');
const {
  initializeProjectWorkspace,
  prepareWorkingWorkspace,
  getProjectPaths
} = require('../services/workspaceManager');
const {
  createProjectRecord,
  updateProjectRecord,
  getProjectById,
  listUserProjects,
  createProjectRun,
  updateProjectRun,
  createPullRequestRecord,
  getPullRequestByRunId,
  getPullRequestById
} = require('../services/projectStore');
const {
  parseGithubUrl,
  validateGithubToken,
  getRepositoryInfo,
  getBranchHeadSha,
  generateUniqueBranchName,
  executeGithubPullRequestFlow,
  generatePullRequestBody
} = require('../services/githubService');
const { RunState, transitionRunState, getRunTimeline } = require('../services/runStateMachine');
const {
  registerActiveRun,
  cancelRun,
  unregisterActiveRun,
  isRunActive
} = require('../services/runController');
const { sanitizeSecrets, validateSafePath } = require('../services/securitySanitizer');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'apifix_secret_key_2026_super_secure';

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES }
});

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

/**
 * POST /api/projects/upload
 * Real Project ZIP Upload & Discovery Pipeline
 */
router.post('/upload', upload.single('code'), async (req, res) => {
  const user = extractUser(req);
  if (!req.file) {
    return res.status(400).json({ error: 'No zip file uploaded under field "code".' });
  }

  const tempZipPath = req.file.path;
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const workspacePaths = initializeProjectWorkspace(projectId);

  try {
    // 1. Validate & Safely Extract ZIP into original/ (IMMUTABLE)
    const extractResult = safeExtractZip(tempZipPath, workspacePaths.originalDir);

    try { fs.unlinkSync(tempZipPath); } catch (e) {}

    // 2. Discover Candidate Projects
    const discovery = discoverProjects(workspacePaths.originalDir);
    if (!discovery.success || discovery.candidates.length === 0) {
      try { fs.rmSync(workspacePaths.projectDir, { recursive: true, force: true }); } catch (e) {}
      return res.status(400).json({
        error: discovery.error || 'No supported project manifest found.',
        details: 'Project must contain package.json, requirements.txt, or pyproject.toml.'
      });
    }

    const primaryCandidate = discovery.selectedCandidate;
    const isMultiple = discovery.multipleDetected;

    // 3. Prepare Working Workspace Copy from the selected project root
    let workingResult = null;
    if (primaryCandidate.supported) {
      workingResult = prepareWorkingWorkspace(projectId, primaryCandidate.relativePath);
    }

    // 4. Persist Project Record
    const projectRecord = await createProjectRecord({
      id: projectId,
      userId: user?.id || 'anonymous',
      userEmail: user?.email || 'dev@apifix.ai',
      name: primaryCandidate.name || req.file.originalname.replace(/\.zip$/i, ''),
      technology: primaryCandidate.technology,
      technologyDisplay: primaryCandidate.technologyDisplay,
      framework: primaryCandidate.framework,
      frameworkDisplay: primaryCandidate.frameworkDisplay,
      sourceType: 'zip_upload',
      originalPath: workspacePaths.originalDir,
      workingPath: workingResult?.workingDir || workspacePaths.workingDir,
      manifest: primaryCandidate.manifest,
      selectedProjectPath: primaryCandidate.relativePath,
      detectedProjects: discovery.candidates,
      status: isMultiple ? 'waiting_selection' : (primaryCandidate.supported ? 'ready' : 'detected_unsupported')
    });

    return res.status(201).json(sanitizeSecrets({
      projectId: projectRecord.id,
      projectName: projectRecord.name,
      projectRoot: primaryCandidate.relativePath,
      technology: primaryCandidate.technology,
      technologyDisplay: primaryCandidate.technologyDisplay,
      framework: primaryCandidate.framework,
      frameworkDisplay: primaryCandidate.frameworkDisplay,
      manifest: primaryCandidate.manifest,
      hasSrc: primaryCandidate.hasSrc,
      hasTests: primaryCandidate.hasTests,
      status: projectRecord.status,
      supported: primaryCandidate.supported,
      multipleDetected: isMultiple,
      candidateCount: discovery.candidates.length,
      detectedProjects: discovery.candidates,
      message: isMultiple 
        ? 'Multiple projects detected. Please select the target project to analyze.'
        : (primaryCandidate.supported 
            ? 'Project detected and immutable workspace initialized.' 
            : 'Python project detected. Note: execution is not yet supported in this phase.')
    }));
  } catch (err) {
    console.error('[Projects API] Upload processing error:', err.message);
    try { fs.rmSync(workspacePaths.projectDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.unlinkSync(tempZipPath); } catch (e) {}
    return res.status(400).json({
      error: err.message || 'Failed to process project archive.'
    });
  }
});

/**
 * POST /api/projects/:projectId/select
 * Selects a project candidate when multiple are detected
 */
router.post('/:projectId/select', async (req, res) => {
  const user = extractUser(req);
  const { projectId } = req.params;
  const { relativePath, candidateId } = req.body || {};

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  const candidate = (project.detectedProjects || []).find(c => 
    (candidateId && c.id === candidateId) || (relativePath && c.relativePath === relativePath)
  );

  if (!candidate) {
    return res.status(400).json({ error: 'Specified project candidate not found in project.' });
  }

  try {
    const workingResult = prepareWorkingWorkspace(projectId, candidate.relativePath);

    const updated = await updateProjectRecord(projectId, {
      name: candidate.name,
      technology: candidate.technology,
      technologyDisplay: candidate.technologyDisplay,
      framework: candidate.framework,
      frameworkDisplay: candidate.frameworkDisplay,
      manifest: candidate.manifest,
      selectedProjectPath: candidate.relativePath,
      workingPath: workingResult.workingDir,
      status: candidate.supported ? 'ready' : 'detected_unsupported'
    });

    return res.status(200).json(sanitizeSecrets({
      projectId: updated.id,
      projectName: updated.name,
      projectRoot: candidate.relativePath,
      technology: updated.technology,
      technologyDisplay: updated.technologyDisplay,
      framework: updated.framework,
      frameworkDisplay: updated.frameworkDisplay,
      manifest: updated.manifest,
      hasSrc: candidate.hasSrc,
      hasTests: candidate.hasTests,
      status: updated.status,
      supported: candidate.supported,
      message: `Selected project "${candidate.name}" workspace initialized.`
    }));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to prepare workspace for selected candidate.', details: err.message });
  }
});

/**
 * GET /api/projects
 * Lists all projects for authenticated user
 */
router.get('/', async (req, res) => {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const projects = await listUserProjects(user);
  return res.status(200).json(sanitizeSecrets({ projects }));
});

const {
  executeProjectAnalysis,
  registerRunSSE
} = require('../orchestrator/realExecutionPipeline');

/**
 * POST /api/projects/:projectId/analyze
 * Triggers real project execution, discovery, and probing pipeline
 */
router.post('/:projectId/analyze', async (req, res) => {
  const user = extractUser(req);
  const { projectId } = req.params;
  const { authToken } = req.body || {};

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  if (project.technology === 'python' || project.supported === false) {
    return res.status(400).json({
      error: 'EXECUTION NOT YET SUPPORTED FOR PYTHON',
      details: 'Python projects cannot be executed in this phase. Autonomous execution sandbox will be supported in a future phase.'
    });
  }

  const runId = `run_analysis_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Concurrency Guard: Lock project target to prevent duplicate runs
  try {
    registerActiveRun(runId, projectId, project.workingPath);
  } catch (lockErr) {
    return res.status(lockErr.status || 409).json({
      error: lockErr.code || 'CONCURRENT_RUN_CONFLICT',
      message: lockErr.message,
      activeRunId: lockErr.activeRunId
    });
  }

  // Start execution asynchronously
  executeProjectAnalysis({
    projectId,
    user,
    authToken,
    runId
  }).catch((err) => {
    console.error(`[Project Analysis] Pipeline error for run ${runId}:`, err.message);
  }).finally(() => {
    unregisterActiveRun(runId);
  });

  return res.status(202).json(sanitizeSecrets({
    runId,
    projectId,
    status: 'started',
    message: 'Project analysis pipeline started.'
  }));
});

/**
 * GET /api/projects/:projectId/runs/:runId/stream
 * SSE Stream endpoint for real-time analysis events
 */
router.get('/:projectId/runs/:runId/stream', (req, res) => {
  const { runId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  registerRunSSE(runId, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ runId, status: 'listening' })}\n\n`);

  req.on('close', () => {
    res.end();
  });
});

/**
 * POST /api/projects/:projectId/runs/:runId/cancel
 * Cancels an active run and cleans up resources
 */
router.post('/:projectId/runs/:runId/cancel', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;
  const { reason = 'Cancelled by user.' } = req.body || {};

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  try {
    const result = await cancelRun(runId, reason);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel run.', details: err.message });
  }
});

/**
 * GET /api/projects/:projectId/runs/:runId/timeline
 * Retrieves structured execution timeline
 */
router.get('/:projectId/runs/:runId/timeline', (req, res) => {
  const { runId } = req.params;
  const timeline = getRunTimeline(runId);
  return res.status(200).json({ runId, timeline });
});

/**
 * GET /api/projects/:projectId/runs/:runId/evidence
 * Retrieves persisted failure evidence JSON
 */
router.get('/:projectId/runs/:runId/evidence', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const evidenceFile = path.resolve(project.workingPath, '../runs', runId, 'evidence.json');
  if (fs.existsSync(evidenceFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
      return res.status(200).json(sanitizeSecrets(data));
    } catch (e) {}
  }

  return res.status(404).json({ error: 'Evidence record not found for run.' });
});

const {
  investigateProjectFailure,
  registerInvestigationSSE
} = require('../services/aiInvestigationEngine');
const {
  createInvestigationRecord,
  getInvestigationByRunId
} = require('../services/projectStore');

/**
 * POST /api/projects/:projectId/runs/:runId/investigate
 * Triggers Phase 4 AI Root-Cause Investigation on real failure evidence
 */
router.post('/:projectId/runs/:runId/investigate', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;
  const { findingId } = req.body || {};

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  try {
    const investigation = await investigateProjectFailure({
      projectId,
      runId,
      workingDir: project.workingPath,
      findingId,
      user
    });

    await createInvestigationRecord(investigation);

    return res.status(200).json(sanitizeSecrets(investigation));
  } catch (err) {
    console.error(`[AI Investigation] Error for run ${runId}:`, err.message);
    return res.status(500).json({ error: 'AI investigation failed.', details: err.message });
  }
});

/**
 * GET /api/projects/:projectId/runs/:runId/investigate
 * Retrieves persisted root-cause investigation record
 */
router.get('/:projectId/runs/:runId/investigate', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const investigation = await getInvestigationByRunId(runId);
  if (!investigation) {
    return res.status(404).json({ error: 'Investigation record not found for this run.' });
  }

  return res.status(200).json(sanitizeSecrets(investigation));
});

/**
 * GET /api/projects/:projectId/runs/:runId/investigate/stream
 * SSE Stream endpoint for real-time AI investigation progress
 */
router.get('/:projectId/runs/:runId/investigate/stream', (req, res) => {
  const { runId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  registerInvestigationSSE(runId, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ runId, status: 'listening' })}\n\n`);

  req.on('close', () => {
    res.end();
  });
});

const {
  generateRepairPatch,
  applyPatchTransaction,
  registerPatchSSE
} = require('../services/patchEngine');
const {
  createPatchRecord,
  updatePatchRecord,
  getPatchById
} = require('../services/projectStore');

/**
 * POST /api/projects/:projectId/runs/:runId/patches/generate
 * Generates a reviewable code patch based on Phase 4 root-cause investigation
 */
router.post('/:projectId/runs/:runId/patches/generate', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  let investigation = await getInvestigationByRunId(runId);
  if (!investigation) {
    const investigationFile = path.resolve(project.workingPath, '../runs', runId, 'investigation.json');
    if (fs.existsSync(investigationFile)) {
      try {
        investigation = JSON.parse(fs.readFileSync(investigationFile, 'utf8'));
      } catch (e) {}
    }
  }

  if (!investigation) {
    return res.status(400).json({ error: 'Cannot generate patch: No completed investigation found for this run.' });
  }

  try {
    const patch = await generateRepairPatch({
      projectId,
      runId,
      investigation,
      workingDir: project.workingPath,
      user
    });

    await createPatchRecord({
      ...patch,
      userId: user?.id
    });

    return res.status(200).json(sanitizeSecrets(patch));
  } catch (err) {
    console.error(`[PatchEngine] Error generating patch for run ${runId}:`, err.message);
    return res.status(500).json({ error: 'Failed to generate patch.', details: err.message });
  }
});

/**
 * GET /api/projects/:projectId/runs/:runId/patches/:patchId
 * Retrieves patch details and diffs
 */
router.get('/:projectId/runs/:runId/patches/:patchId', async (req, res) => {
  const user = extractUser(req);
  const { projectId, patchId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const patch = await getPatchById(patchId);
  if (!patch) {
    return res.status(404).json({ error: 'Patch not found.' });
  }

  return res.status(200).json(sanitizeSecrets(patch));
});

/**
 * POST /api/projects/:projectId/runs/:runId/patches/:patchId/apply
 * Applies approved patch transactionally to working/ ONLY
 */
router.post('/:projectId/runs/:runId/patches/:patchId/apply', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId, patchId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  const patch = await getPatchById(patchId);
  if (!patch) {
    return res.status(404).json({ error: 'Patch not found.' });
  }

  try {
    const result = await applyPatchTransaction(project.workingPath, patch);

    await updatePatchRecord(patchId, {
      status: 'APPLIED',
      appliedAt: result.appliedAt
    });

    await updateProjectRun(runId, {
      status: RunState.TESTING
    });

    return res.status(200).json(sanitizeSecrets({
      status: 'APPLIED',
      patchId,
      appliedFiles: result.appliedFiles,
      appliedAt: result.appliedAt,
      message: 'Patch applied successfully to working workspace. Verification pending.'
    }));
  } catch (err) {
    console.error(`[PatchEngine] Error applying patch ${patchId}:`, err.message);
    await updatePatchRecord(patchId, { status: 'FAILED' });
    return res.status(500).json({ error: 'Failed to apply patch.', details: err.message });
  }
});

/**
 * POST /api/projects/:projectId/runs/:runId/patches/:patchId/reject
 * Rejects patch proposal
 */
router.post('/:projectId/runs/:runId/patches/:patchId/reject', async (req, res) => {
  const user = extractUser(req);
  const { projectId, patchId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const patch = await getPatchById(patchId);
  if (!patch) {
    return res.status(404).json({ error: 'Patch not found.' });
  }

  await updatePatchRecord(patchId, { status: 'REJECTED' });

  return res.status(200).json({
    status: 'REJECTED',
    patchId,
    message: 'Patch proposal rejected.'
  });
});

const {
  executeVerificationPipeline,
  registerVerificationSSE
} = require('../services/realVerificationEngine');
const {
  createVerificationRecord,
  getVerificationById,
  getVerificationByRunId,
  createArtifactRecord,
  getArtifactByRunId
} = require('../services/projectStore');

/**
 * POST /api/projects/:projectId/runs/:runId/patches/:patchId/verify
 * Executes real verification pipeline against working/ workspace on fresh dynamic port
 */
router.post('/:projectId/runs/:runId/patches/:patchId/verify', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId, patchId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  const patch = await getPatchById(patchId);
  if (!patch) {
    return res.status(404).json({ error: 'Patch not found.' });
  }

  let previousEvidence = null;
  const evidenceFile = path.resolve(project.workingPath, '../runs', runId, 'evidence.json');
  if (fs.existsSync(evidenceFile)) {
    try {
      previousEvidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
    } catch (e) {}
  }

  if (!previousEvidence) {
    const inv = await getInvestigationByRunId(runId);
    if (inv?.evidence) {
      previousEvidence = {
        endpoint: { method: 'POST', path: '/api/auth/login' },
        httpStatus: 500,
        category: 'RUNTIME_EXCEPTION',
        evidence: inv.evidence
      };
    }
  }

  try {
    const report = await executeVerificationPipeline({
      projectId,
      runId,
      patchId,
      originalDir: project.originalPath,
      workingDir: project.workingPath,
      previousEvidence,
      user
    });

    await createVerificationRecord({
      ...report,
      userId: user?.id
    });

    if (report.artifact) {
      await createArtifactRecord({
        ...report.artifact,
        userId: user?.id
      });
    }

    return res.status(200).json(sanitizeSecrets(report));
  } catch (err) {
    console.error(`[RealVerificationEngine] Error verifying run ${runId}:`, err.message);
    return res.status(500).json({ error: 'Verification pipeline failed.', details: err.message });
  }
});

/**
 * GET /api/projects/:projectId/runs/:runId/verifications/:verificationId
 * Retrieves verification report
 */
router.get('/:projectId/runs/:runId/verifications/:verificationId', async (req, res) => {
  const user = extractUser(req);
  const { projectId, verificationId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const report = await getVerificationById(verificationId);
  if (!report) {
    return res.status(404).json({ error: 'Verification record not found.' });
  }

  return res.status(200).json(sanitizeSecrets(report));
});

/**
 * GET /api/projects/:projectId/runs/:runId/verifications/:verificationId/stream
 * SSE Stream for real-time verification progression events
 */
router.get('/:projectId/runs/:runId/verifications/:verificationId/stream', (req, res) => {
  const { verificationId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  registerVerificationSSE(verificationId, res);

  res.write(`event: connected\ndata: ${JSON.stringify({ verificationId, status: 'listening' })}\n\n`);

  req.on('close', () => {
    res.end();
  });
});

/**
 * GET /api/projects/:projectId/runs/:runId/download-verified
 * Securely serves sanitized verified ZIP archive for verified runs ONLY
 */
router.get('/:projectId/runs/:runId/download-verified', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  const verification = await getVerificationByRunId(runId);
  if (!verification || verification.status !== 'VERIFIED') {
    return res.status(403).json({
      error: 'Download Forbidden: Project has not achieved VERIFIED status.',
      status: verification?.status || 'UNVERIFIED'
    });
  }

  const artifact = await getArtifactByRunId(runId) || verification.artifact;
  if (!artifact || !artifact.zipPath || !fs.existsSync(artifact.zipPath)) {
    return res.status(404).json({ error: 'Verified ZIP artifact not found on disk.' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${project.name || 'repaired-project'}-verified.zip"`);
  res.setHeader('X-Artifact-SHA256', artifact.sha256 || '');

  const fileStream = fs.createReadStream(artifact.zipPath);
  fileStream.pipe(res);
});

/**
 * POST /api/projects/:projectId/runs/:runId/create-pr
 * Creates a real GitHub branch, commits the verified patch, and opens a Pull Request
 */
router.post('/:projectId/runs/:runId/create-pr', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;
  const {
    baseBranch = 'main',
    githubToken: bodyToken,
    repoUrl: bodyRepoUrl,
    owner: bodyOwner,
    repo: bodyRepo
  } = req.body || {};

  // 1. Authenticate user & verify project ownership
  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  // 2. CRITICAL VERIFIED-ONLY GATE: Reject if not VERIFIED
  const verification = await getVerificationByRunId(runId);
  if (!verification || verification.status !== 'VERIFIED') {
    return res.status(403).json({
      error: 'GITHUB_PR_UNAUTHORIZED',
      message: 'Pull Requests can only be created for repairs that have achieved VERIFIED status.',
      status: verification?.status || 'UNVERIFIED'
    });
  }

  // 3. Extract GitHub Token
  const githubToken = bodyToken || req.headers['x-github-token'] || process.env.GITHUB_TOKEN || '';
  if (!githubToken) {
    return res.status(400).json({
      error: 'GITHUB_AUTH_REQUIRED',
      message: 'A GitHub Personal Access Token or OAuth token is required to create a branch and Pull Request.',
      suggestedAction: 'Provide a GitHub Personal Access Token with repo scope in request body or X-GitHub-Token header.'
    });
  }

  // 4. Resolve Target GitHub Repository (owner/repo)
  let owner = bodyOwner;
  let repo = bodyRepo;

  if (!owner || !repo) {
    const rawRepo = bodyRepoUrl || project.repository || project.name;
    try {
      const parsed = parseGithubUrl(rawRepo);
      owner = parsed.owner;
      repo = parsed.repo;
    } catch (e) {
      if (rawRepo && rawRepo.includes('/')) {
        const parts = rawRepo.split('/');
        owner = parts[0].trim();
        repo = parts[1].trim();
      } else {
        return res.status(400).json({
          error: 'GITHUB_REPOSITORY_REQUIRED',
          message: 'Target GitHub repository (e.g. "owner/repo" or "https://github.com/owner/repo") is required.'
        });
      }
    }
  }

  // 5. Load Patch and Investigation Telemetry
  let patch = null;
  const patchesFile = path.resolve(project.workingPath, '../runs', runId, 'patch.json');
  if (fs.existsSync(patchesFile)) {
    try {
      patch = JSON.parse(fs.readFileSync(patchesFile, 'utf8'));
    } catch (e) {}
  }
  if (!patch && verification.patchId) {
    const { getPatchById } = require('../services/projectStore');
    patch = await getPatchById(verification.patchId);
  }

  let investigation = null;
  const invFile = path.resolve(project.workingPath, '../runs', runId, 'investigation.json');
  if (fs.existsSync(invFile)) {
    try {
      investigation = JSON.parse(fs.readFileSync(invFile, 'utf8'));
    } catch (e) {}
  }

  try {
    // 6. Execute Real GitHub Pull Request Flow
    const prResult = await executeGithubPullRequestFlow({
      owner,
      repo,
      baseBranch,
      githubToken,
      workingDir: project.workingPath,
      patch,
      verification,
      investigation,
      project,
      runId
    });

    // 7. Persist Pull Request record
    const prRecord = await createPullRequestRecord({
      projectId,
      runId,
      userId: user?.id || null,
      repositoryOwner: owner,
      repositoryName: repo,
      baseBranch: prResult.baseBranch,
      repairBranch: prResult.branch,
      commitSha: prResult.commitSha,
      prNumber: prResult.pullRequestNumber,
      prUrl: prResult.pullRequestUrl,
      status: prResult.status,
      title: prResult.title,
      body: generatePullRequestBody({ project, runId, verification, investigation, patch })
    });

    return res.status(201).json(sanitizeSecrets({
      success: true,
      branch: prResult.branch,
      commitSha: prResult.commitSha,
      pullRequestNumber: prResult.pullRequestNumber,
      pullRequestUrl: prResult.pullRequestUrl,
      title: prResult.title,
      baseBranch: prResult.baseBranch,
      status: prResult.status,
      id: prRecord.id
    }));
  } catch (err) {
    console.error(`[ProjectRoutes] Error creating GitHub PR for run ${runId}:`, err.message);
    const statusCode = err.status || (err.code === 'GITHUB_AUTH_REQUIRED' ? 400 : (err.code === 'GITHUB_PERMISSION_DENIED' ? 403 : 500));
    return res.status(statusCode).json(sanitizeSecrets({
      error: err.code || 'GITHUB_PR_CREATION_FAILED',
      message: err.message,
      suggestedAction: err.suggestedAction || 'Check GitHub token permissions and repository access.',
      isRetryable: err.isRetryable ?? false,
      details: err.githubData || null
    }));
  }
});

/**
 * GET /api/projects/:projectId/runs/:runId/pull-request
 * Retrieves created Pull Request metadata for a run
 */
router.get('/:projectId/runs/:runId/pull-request', async (req, res) => {
  const user = extractUser(req);
  const { projectId, runId } = req.params;

  const project = await getProjectById(projectId, user);
  if (!project) {
    return res.status(404).json({ error: 'Project not found or access denied.' });
  }

  const pr = await getPullRequestByRunId(runId);
  if (!pr) {
    return res.status(404).json({ error: 'No Pull Request record found for this run.' });
  }

  return res.status(200).json(sanitizeSecrets(pr));
});

module.exports = router;
