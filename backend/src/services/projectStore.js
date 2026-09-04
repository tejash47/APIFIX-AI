const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseConfigured } = require('../config/supabase');

const DATA_DIR = path.resolve(__dirname, '../../data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');
const PULL_REQUESTS_FILE = path.join(DATA_DIR, 'pull_requests.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadProjects() {
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[ProjectStore] Error loading projects from disk:', err.message);
  }
  return [];
}

function saveProjects(projects) {
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
  } catch (err) {
    console.error('[ProjectStore] Error saving projects to disk:', err.message);
  }
}

function loadRuns() {
  try {
    if (fs.existsSync(RUNS_FILE)) {
      const data = fs.readFileSync(RUNS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[ProjectStore] Error loading runs from disk:', err.message);
  }
  return [];
}

function saveRuns(runs) {
  try {
    fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2), 'utf8');
  } catch (err) {
    console.error('[ProjectStore] Error saving runs to disk:', err.message);
  }
}

/**
 * Persists a new project record
 * @param {object} projectData 
 */
async function createProjectRecord(projectData) {
  const project = {
    id: projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId: projectData.userId || 'anonymous',
    userEmail: projectData.userEmail || 'dev@apifix.ai',
    name: projectData.name || 'Untitled Project',
    technology: projectData.technology || 'node',
    technologyDisplay: projectData.technologyDisplay || 'Node.js',
    framework: projectData.framework || 'express',
    frameworkDisplay: projectData.frameworkDisplay || 'Express',
    sourceType: projectData.sourceType || 'zip_upload',
    originalPath: projectData.originalPath || '',
    workingPath: projectData.workingPath || '',
    manifest: projectData.manifest || 'package.json',
    selectedProjectPath: projectData.selectedProjectPath || '.',
    detectedProjects: projectData.detectedProjects || [],
    status: projectData.status || 'ready',
    createdAt: new Date().toISOString()
  };

  const projects = loadProjects();
  projects.unshift(project);
  saveProjects(projects);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('projects').insert({
        id: project.id,
        user_id: project.userId,
        user_email: project.userEmail,
        name: project.name,
        technology: project.technology,
        framework: project.framework,
        source_type: project.sourceType,
        original_path: project.originalPath,
        working_path: project.workingPath,
        manifest: project.manifest,
        selected_project_path: project.selectedProjectPath,
        detected_projects: project.detectedProjects,
        status: project.status,
        created_at: project.createdAt
      });
    } catch (err) {
      console.warn('[ProjectStore] Supabase project insert warning:', err.message);
    }
  }

  return project;
}

/**
 * Updates an existing project record
 * @param {string} projectId 
 * @param {object} updates 
 */
async function updateProjectRecord(projectId, updates) {
  const projects = loadProjects();
  const index = projects.findIndex(p => p.id === projectId);
  if (index === -1) return null;

  Object.assign(projects[index], updates);
  saveProjects(projects);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('projects').update(updates).eq('id', projectId);
    } catch (err) {
      console.warn('[ProjectStore] Supabase project update warning:', err.message);
    }
  }

  return projects[index];
}

/**
 * Gets a project record by ID and verifies user ownership
 * @param {string} projectId 
 * @param {object} user 
 */
async function getProjectById(projectId, user) {
  const projects = loadProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return null;

  if (user) {
    const normalized = (user.email || user.id || '').toLowerCase().trim();
    if (
      normalized !== 'admin@apifix.ai' &&
      project.userId !== user.id &&
      project.userEmail.toLowerCase() !== normalized
    ) {
      return null; // RLS check
    }
  }

  return project;
}

/**
 * Lists projects owned by a user
 * @param {object} user 
 */
async function listUserProjects(user) {
  if (!user) return [];
  const normalized = (user.email || user.id || '').toLowerCase().trim();
  const projects = loadProjects();

  if (normalized === 'admin@apifix.ai') {
    return projects;
  }

  return projects.filter(p => 
    p.userId === user.id || 
    (p.userEmail && p.userEmail.toLowerCase() === normalized)
  );
}

/**
 * Creates a new project run record
 * @param {object} runData 
 */
async function createProjectRun(runData) {
  const run = {
    id: runData.id || `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    projectId: runData.projectId,
    userId: runData.userId || 'anonymous',
    userEmail: runData.userEmail || 'dev@apifix.ai',
    status: runData.status || 'initialized',
    command: runData.command || null,
    port: runData.port || null,
    framework: runData.framework || null,
    runtime: runData.runtime || 'Node.js',
    selectedProjectPath: runData.selectedProjectPath || '.',
    createdAt: new Date().toISOString()
  };

  const runs = loadRuns();
  runs.unshift(run);
  saveRuns(runs);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('runs').insert({
        id: run.id,
        project_id: run.projectId,
        user_id: run.userId,
        user_email: run.userEmail,
        status: run.status,
        command: run.command,
        port: run.port,
        framework: run.framework,
        runtime: run.runtime,
        selected_project_path: run.selectedProjectPath,
        created_at: run.createdAt
      });
    } catch (err) {
      console.warn('[ProjectStore] Supabase run insert warning:', err.message);
    }
  }

  return run;
}

/**
 * Updates a project run record
 * @param {string} runId 
 * @param {object} updates 
 */
async function updateProjectRun(runId, updates) {
  const runs = loadRuns();
  const index = runs.findIndex(r => r.id === runId);
  if (index === -1) return null;

  Object.assign(runs[index], updates);
  saveRuns(runs);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('runs').update(updates).eq('id', runId);
    } catch (err) {
      console.warn('[ProjectStore] Supabase run update warning:', err.message);
    }
  }

  return runs[index];
}

/**
 * Gets a run by ID
 * @param {string} runId 
 */
async function getProjectRun(runId) {
  const runs = loadRuns();
  return runs.find(r => r.id === runId) || null;
}

const INVESTIGATIONS_FILE = path.join(DATA_DIR, 'investigations.json');

function loadInvestigations() {
  try {
    if (fs.existsSync(INVESTIGATIONS_FILE)) {
      const data = fs.readFileSync(INVESTIGATIONS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[ProjectStore] Error loading investigations from disk:', err.message);
  }
  return [];
}

function saveInvestigations(investigations) {
  try {
    fs.writeFileSync(INVESTIGATIONS_FILE, JSON.stringify(investigations, null, 2), 'utf8');
  } catch (err) {
    console.error('[ProjectStore] Error saving investigations to disk:', err.message);
  }
}

/**
 * Persists a new AI root-cause investigation record
 * @param {object} invData 
 */
async function createInvestigationRecord(invData) {
  const investigation = {
    id: invData.id || invData.investigationId || `inv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    projectId: invData.projectId,
    runId: invData.runId,
    findingId: invData.findingId || 'finding_1',
    status: invData.status || 'COMPLETED',
    rootCause: invData.rootCause || {},
    evidence: invData.evidence || [],
    repairStrategy: invData.repairStrategy || {},
    hypotheses: invData.hypotheses || [],
    model: invData.model || 'local-ast-engine',
    provider: invData.provider || 'local',
    confidence: invData.confidence || null,
    createdAt: invData.createdAt || new Date().toISOString()
  };

  const investigations = loadInvestigations();
  // Replace if already exists for this runId
  const existingIdx = investigations.findIndex(i => i.runId === investigation.runId);
  if (existingIdx !== -1) {
    investigations[existingIdx] = investigation;
  } else {
    investigations.unshift(investigation);
  }
  saveInvestigations(investigations);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('investigations').upsert({
        id: investigation.id,
        project_id: investigation.projectId,
        run_id: investigation.runId,
        finding_id: investigation.findingId,
        status: investigation.status,
        root_cause: investigation.rootCause,
        evidence: investigation.evidence,
        repair_strategy: investigation.repairStrategy,
        hypotheses: investigation.hypotheses,
        model: investigation.model,
        provider: investigation.provider,
        confidence: investigation.confidence,
        created_at: investigation.createdAt
      });
    } catch (err) {
      console.warn('[ProjectStore] Supabase investigation insert warning:', err.message);
    }
  }

  return investigation;
}

/**
 * Retrieves an investigation record by runId
 * @param {string} runId 
 */
async function getInvestigationByRunId(runId) {
  const investigations = loadInvestigations();
  return investigations.find(i => i.runId === runId) || null;
}

const PATCHES_FILE = path.join(DATA_DIR, 'patches.json');

function loadPatches() {
  try {
    if (fs.existsSync(PATCHES_FILE)) {
      const data = fs.readFileSync(PATCHES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[ProjectStore] Error loading patches from disk:', err.message);
  }
  return [];
}

function savePatches(patches) {
  try {
    fs.writeFileSync(PATCHES_FILE, JSON.stringify(patches, null, 2), 'utf8');
  } catch (err) {
    console.error('[ProjectStore] Error saving patches to disk:', err.message);
  }
}

/**
 * Persists a new structured code patch record
 * @param {object} patchData 
 */
async function createPatchRecord(patchData) {
  const patch = {
    id: patchData.id || patchData.patchId || `patch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    projectId: patchData.projectId,
    runId: patchData.runId,
    investigationId: patchData.investigationId,
    userId: patchData.userId || null,
    status: patchData.status || 'READY',
    summary: patchData.summary,
    reason: patchData.reason || '',
    risk: patchData.risk || 'LOW',
    changes: patchData.changes || [],
    beforeFiles: patchData.beforeFiles || {},
    proposedFiles: patchData.proposedFiles || {},
    fileHashes: patchData.fileHashes || {},
    linesAdded: patchData.linesAdded || 0,
    linesRemoved: patchData.linesRemoved || 0,
    createdAt: patchData.createdAt || new Date().toISOString(),
    appliedAt: patchData.appliedAt || null
  };

  const patches = loadPatches();
  const existingIdx = patches.findIndex(p => p.id === patch.id);
  if (existingIdx !== -1) {
    patches[existingIdx] = patch;
  } else {
    patches.unshift(patch);
  }
  savePatches(patches);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('patches').upsert({
        id: patch.id,
        project_id: patch.projectId,
        run_id: patch.runId,
        investigation_id: patch.investigationId,
        user_id: patch.userId,
        status: patch.status,
        summary: patch.summary,
        reason: patch.reason,
        risk: patch.risk,
        changes: patch.changes,
        before_files: patch.beforeFiles,
        proposed_files: patch.proposedFiles,
        file_hashes: patch.fileHashes,
        lines_added: patch.linesAdded,
        lines_removed: patch.linesRemoved,
        created_at: patch.createdAt,
        applied_at: patch.appliedAt
      });
    } catch (err) {
      console.warn('[ProjectStore] Supabase patch insert warning:', err.message);
    }
  }

  return patch;
}

/**
 * Updates a patch record
 * @param {string} patchId 
 * @param {object} updates 
 */
async function updatePatchRecord(patchId, updates) {
  const patches = loadPatches();
  const idx = patches.findIndex(p => p.id === patchId);
  if (idx === -1) return null;

  Object.assign(patches[idx], updates);
  savePatches(patches);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('patches').update(updates).eq('id', patchId);
    } catch (err) {
      console.warn('[ProjectStore] Supabase patch update warning:', err.message);
    }
  }

  return patches[idx];
}

/**
 * Retrieves a patch record by ID
 * @param {string} patchId 
 */
async function getPatchById(patchId) {
  const patches = loadPatches();
  return patches.find(p => p.id === patchId) || null;
}

const VERIFICATIONS_FILE = path.join(DATA_DIR, 'verifications.json');
const ARTIFACTS_FILE = path.join(DATA_DIR, 'artifacts.json');

function loadVerifications() {
  try {
    if (fs.existsSync(VERIFICATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(VERIFICATIONS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[ProjectStore] Error loading verifications:', err.message);
  }
  return [];
}

function saveVerifications(verifications) {
  try {
    fs.writeFileSync(VERIFICATIONS_FILE, JSON.stringify(verifications, null, 2), 'utf8');
  } catch (err) {
    console.error('[ProjectStore] Error saving verifications:', err.message);
  }
}

function loadArtifacts() {
  try {
    if (fs.existsSync(ARTIFACTS_FILE)) {
      return JSON.parse(fs.readFileSync(ARTIFACTS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[ProjectStore] Error loading artifacts:', err.message);
  }
  return [];
}

function saveArtifacts(artifacts) {
  try {
    fs.writeFileSync(ARTIFACTS_FILE, JSON.stringify(artifacts, null, 2), 'utf8');
  } catch (err) {
    console.error('[ProjectStore] Error saving artifacts:', err.message);
  }
}

/**
 * Persists a new verification record
 * @param {object} verification 
 */
async function createVerificationRecord(verification) {
  const verifications = loadVerifications();
  const existingIdx = verifications.findIndex(v => v.verificationId === verification.verificationId || v.id === verification.id);
  if (existingIdx !== -1) {
    verifications[existingIdx] = verification;
  } else {
    verifications.unshift(verification);
  }
  saveVerifications(verifications);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('verifications').upsert({
        id: verification.verificationId || verification.id,
        project_id: verification.projectId,
        run_id: verification.runId,
        patch_id: verification.patchId,
        status: verification.status,
        target: verification.target,
        before_evidence: verification.before,
        after_evidence: verification.after,
        tests: verification.tests,
        regressions: verification.regressions,
        decision_reason: verification.decisionReason,
        artifact: verification.artifact,
        created_at: verification.verifiedAt || new Date().toISOString()
      });
    } catch (err) {
      console.warn('[ProjectStore] Supabase verification insert warning:', err.message);
    }
  }

  return verification;
}

/**
 * Retrieves a verification record by runId
 * @param {string} runId 
 */
async function getVerificationByRunId(runId) {
  const verifications = loadVerifications();
  return verifications.find(v => v.runId === runId) || null;
}

/**
 * Retrieves a verification record by verificationId
 * @param {string} verificationId 
 */
async function getVerificationById(verificationId) {
  const verifications = loadVerifications();
  return verifications.find(v => v.verificationId === verificationId || v.id === verificationId) || null;
}

/**
 * Persists an artifact metadata record
 * @param {object} artifact 
 */
async function createArtifactRecord(artifact) {
  const artifacts = loadArtifacts();
  artifacts.unshift(artifact);
  saveArtifacts(artifacts);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('artifacts').upsert({
        id: artifact.artifactId || artifact.id,
        project_id: artifact.projectId,
        run_id: artifact.runId,
        verification_id: artifact.verificationId,
        user_id: artifact.userId || null,
        status: artifact.status,
        zip_path: artifact.zipPath,
        sha256: artifact.sha256,
        size_bytes: artifact.sizeBytes,
        created_at: artifact.createdAt || new Date().toISOString()
      });
    } catch (err) {
      console.warn('[ProjectStore] Supabase artifact insert warning:', err.message);
    }
  }

  return artifact;
}

/**
 * Retrieves an artifact record by runId
 * @param {string} runId 
 */
async function getArtifactByRunId(runId) {
  const artifacts = loadArtifacts();
  return artifacts.find(a => a.runId === runId) || null;
}

function loadPullRequests() {
  try {
    if (fs.existsSync(PULL_REQUESTS_FILE)) {
      return JSON.parse(fs.readFileSync(PULL_REQUESTS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[ProjectStore] Error loading pull requests:', err.message);
  }
  return [];
}

function savePullRequests(prs) {
  try {
    fs.writeFileSync(PULL_REQUESTS_FILE, JSON.stringify(prs, null, 2), 'utf8');
  } catch (err) {
    console.error('[ProjectStore] Error saving pull requests:', err.message);
  }
}

/**
 * Persists a new GitHub Pull Request record
 * @param {object} prRecord 
 */
async function createPullRequestRecord(prRecord) {
  const prs = loadPullRequests();
  const id = prRecord.id || `pr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const record = {
    id,
    ...prRecord,
    createdAt: prRecord.createdAt || new Date().toISOString()
  };

  const existingIdx = prs.findIndex(p => p.id === id || p.runId === prRecord.runId);
  if (existingIdx !== -1) {
    prs[existingIdx] = record;
  } else {
    prs.unshift(record);
  }
  savePullRequests(prs);

  if (isSupabaseConfigured()) {
    try {
      await supabase.from('github_pull_requests').upsert({
        id: record.id,
        project_id: record.projectId,
        run_id: record.runId,
        user_id: record.userId || null,
        repository_owner: record.repositoryOwner,
        repository_name: record.repositoryName,
        base_branch: record.baseBranch,
        repair_branch: record.repairBranch,
        commit_sha: record.commitSha,
        pr_number: record.prNumber || record.pullRequestNumber,
        pr_url: record.prUrl || record.pullRequestUrl,
        status: record.status || 'OPEN',
        title: record.title,
        body: record.body,
        created_at: record.createdAt,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[ProjectStore] Supabase pull request insert warning:', err.message);
    }
  }

  return record;
}

/**
 * Retrieves a GitHub Pull Request record by runId
 * @param {string} runId 
 */
async function getPullRequestByRunId(runId) {
  const prs = loadPullRequests();
  return prs.find(p => p.runId === runId) || null;
}

/**
 * Retrieves a GitHub Pull Request record by id
 * @param {string} id 
 */
async function getPullRequestById(id) {
  const prs = loadPullRequests();
  return prs.find(p => p.id === id) || null;
}

function saveProject(projectData) {
  const projects = loadProjects();
  const id = projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const existingIdx = projects.findIndex(p => p.id === id);
  const record = {
    id,
    workspaceId: projectData.workspaceId || 'default',
    ...projectData,
    updatedAt: new Date().toISOString()
  };

  if (existingIdx !== -1) {
    projects[existingIdx] = { ...projects[existingIdx], ...record };
  } else {
    projects.unshift(record);
  }
  saveProjects(projects);
  return record;
}

function getProject(id) {
  const projects = loadProjects();
  return projects.find(p => p.id === id) || null;
}

function getProjectsByWorkspace(workspaceId) {
  const projects = loadProjects();
  return projects.filter(p => p.workspaceId === workspaceId);
}

const projectStore = {
  createProjectRecord,
  updateProjectRecord,
  getProjectById,
  listUserProjects,
  createProjectRun,
  updateProjectRun,
  getProjectRun,
  createInvestigationRecord,
  getInvestigationByRunId,
  createPatchRecord,
  updatePatchRecord,
  getPatchById,
  createVerificationRecord,
  getVerificationByRunId,
  getVerificationById,
  createArtifactRecord,
  getArtifactByRunId,
  createPullRequestRecord,
  getPullRequestByRunId,
  getPullRequestById,
  saveProject,
  getProject,
  getProjectsByWorkspace
};

module.exports = {
  createProjectRecord,
  updateProjectRecord,
  getProjectById,
  listUserProjects,
  createProjectRun,
  updateProjectRun,
  getProjectRun,
  createInvestigationRecord,
  getInvestigationByRunId,
  createPatchRecord,
  updatePatchRecord,
  getPatchById,
  createVerificationRecord,
  getVerificationByRunId,
  getVerificationById,
  createArtifactRecord,
  getArtifactByRunId,
  createPullRequestRecord,
  getPullRequestByRunId,
  getPullRequestById,
  saveProject,
  getProject,
  getProjectsByWorkspace,
  projectStore
};



