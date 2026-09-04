const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export async function fetchIncidents() {
  const res = await fetch(`${BACKEND_URL}/api/incidents`);
  return res.json();
}

export async function triggerDemoRun(token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/demo/trigger`, { method: 'POST', headers });
  return res.json();
}

export async function triggerScanRun(token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'scan', authToken: token })
  });
  return res.json();
}

export async function importGithubRepo(payload: {
  repoUrl: string;
  branch?: string;
  githubToken?: string;
  authToken?: string;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (payload.authToken) {
    headers['Authorization'] = `Bearer ${payload.authToken}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/runs/github`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.details || errData.error || 'Failed to import GitHub repository');
  }
  return res.json();
}

export async function fetchUserHistory(token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/history`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch usage history');
  }
  return res.json();
}

export async function fetchHistoryDetail(runId: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/history/${runId}`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch history details');
  }
  return res.json();
}

export async function deleteHistoryItem(runId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/history/${runId}`, {
    method: 'DELETE',
    headers
  });
  return res.json();
}

export async function approvePatch(runId: string) {
  const res = await fetch(`${BACKEND_URL}/api/runs/${runId}/approve`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Approval failed with status ${res.status}`);
  }
  return res.json();
}

export async function rejectPatch(runId: string) {
  const res = await fetch(`${BACKEND_URL}/api/runs/${runId}/reject`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Rejection failed with status ${res.status}`);
  }
  return res.json();
}

export async function resetDemo() {
  const res = await fetch(`${BACKEND_URL}/api/demo/reset`, { method: 'POST' });
  return res.json();
}

export function createRunEventSource(runId: string): EventSource {
  return new EventSource(`${BACKEND_URL}/api/runs/${runId}/stream`);
}

export function getDownloadUrl(runId: string, type: 'file' | 'full' = 'full'): string {
  return `${BACKEND_URL}/api/runs/${runId}/download?type=${type}`;
}

export interface DetectedProjectCandidate {
  id: string;
  name: string;
  technology: string;
  technologyDisplay: string;
  framework: string;
  frameworkDisplay: string;
  manifest: string;
  relativePath: string;
  absolutePath: string;
  hasSrc: boolean;
  hasTests: boolean;
  status: string;
  supported: boolean;
  confidence: string;
}

export interface ProjectUploadResponse {
  projectId: string;
  projectName: string;
  projectRoot: string;
  technology: string;
  technologyDisplay: string;
  framework: string;
  frameworkDisplay: string;
  manifest: string;
  hasSrc: boolean;
  hasTests: boolean;
  status: string;
  supported: boolean;
  multipleDetected: boolean;
  candidateCount: number;
  detectedProjects: DetectedProjectCandidate[];
  message: string;
}

/**
 * Uploads a project ZIP archive to the safe intake pipeline
 */
export async function uploadProjectZip(file: File, token?: string | null): Promise<ProjectUploadResponse> {
  const formData = new FormData();
  formData.append('code', file);

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/upload`, {
    method: 'POST',
    headers,
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'Failed to upload project ZIP');
  }

  return data;
}

/**
 * Selects a project candidate when multiple are detected
 */
export async function selectProjectCandidate(
  projectId: string,
  candidateId: string,
  relativePath: string,
  token?: string | null
): Promise<ProjectUploadResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/select`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateId, relativePath })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'Failed to select project candidate');
  }

  return data;
}

/**
 * Fetches projects owned by authenticated user
 */
export async function fetchUserProjects(token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch projects');
  }

  return res.json();
}

/**
 * Triggers Phase 3 real execution and API discovery pipeline for a project
 */
export async function analyzeProject(projectId: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/analyze`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ authToken: token })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'Failed to start project analysis');
  }

  return data;
}

/**
 * Creates SSE stream listener for real Phase 3 project analysis events
 */
export function createProjectRunEventSource(projectId: string, runId: string): EventSource {
  return new EventSource(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/stream`);
}

/**
 * Fetches persisted failure evidence for a run
 */
export async function fetchRunEvidence(projectId: string, runId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/evidence`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch run evidence');
  }

  return res.json();
}

export interface AIInvestigationResponse {
  investigationId: string;
  projectId: string;
  runId: string;
  findingId: string;
  status: string;
  endpoint: {
    method: string;
    path: string;
  };
  failure: {
    category: string;
    statusCode: number;
  };
  rootCause: {
    summary: string;
    explanation: string;
    file: string;
    line: number;
    snippet?: string;
  };
  evidence: Array<{
    type: string;
    detail?: string;
    file?: string;
    line?: number;
    error?: string;
    snippet?: string;
  }>;
  hypotheses: Array<{
    description: string;
    supportingEvidence: string[];
    confidence: string;
  }>;
  repairStrategy: {
    summary: string;
    filesLikelyAffected: string[];
  };
  confidence: string | null;
  model: string;
  provider: string;
  createdAt: string;
}

/**
 * Triggers Phase 4 AI Root-Cause Investigation on real failure evidence
 */
export async function triggerAIInvestigation(
  projectId: string,
  runId: string,
  findingId?: string,
  token?: string | null
): Promise<AIInvestigationResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/investigate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ findingId })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'AI investigation failed.');
  }

  return data;
}

/**
 * Creates SSE stream listener for real Phase 4 AI investigation progress
 */
export function createInvestigationEventSource(projectId: string, runId: string): EventSource {
  return new EventSource(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/investigate/stream`);
}

/**
 * Fetches persisted investigation record for a run
 */
export async function fetchInvestigationRecord(projectId: string, runId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/investigate`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch investigation record');
  }

  return res.json();
}

export interface ProjectPatchResponse {
  patchId: string;
  id?: string;
  projectId: string;
  runId: string;
  investigationId: string;
  status: 'READY' | 'APPLIED' | 'REJECTED' | 'FAILED' | 'STALE';
  summary: string;
  reason: string;
  risk: string;
  changes: Array<{
    file: string;
    operation: 'replace' | 'insert' | 'delete';
    startLine?: number;
    endLine?: number;
    oldText?: string;
    newText?: string;
    afterLine?: number;
  }>;
  beforeFiles: Record<string, string>;
  proposedFiles: Record<string, string>;
  fileHashes: Record<string, { beforeHash: string; proposedHash: string }>;
  linesAdded: number;
  linesRemoved: number;
  createdAt: string;
  appliedAt?: string | null;
}

/**
 * Triggers Phase 5 structured code patch generation
 */
export async function generateProjectPatch(
  projectId: string,
  runId: string,
  token?: string | null
): Promise<ProjectPatchResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/patches/generate`, {
    method: 'POST',
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'Failed to generate patch.');
  }

  return data;
}

/**
 * Fetches patch proposal by ID
 */
export async function fetchProjectPatch(
  projectId: string,
  runId: string,
  patchId: string,
  token?: string | null
): Promise<ProjectPatchResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/patches/${patchId}`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch patch record');
  }

  return res.json();
}

/**
 * Applies approved patch transactionally to working/ workspace ONLY
 */
export async function applyProjectPatch(
  projectId: string,
  runId: string,
  patchId: string,
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/patches/${patchId}/apply`, {
    method: 'POST',
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'Failed to apply patch.');
  }

  return data;
}

/**
 * Rejects patch proposal
 */
export async function rejectProjectPatch(
  projectId: string,
  runId: string,
  patchId: string,
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/patches/${patchId}/reject`, {
    method: 'POST',
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'Failed to reject patch.');
  }

  return data;
}

/**
 * Creates SSE stream listener for real Phase 5 patch events
 */
export function createPatchEventSource(projectId: string, runId: string, patchId: string): EventSource {
  return new EventSource(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/patches/${patchId}/stream`);
}

export interface ProjectVerificationResponse {
  verificationId: string;
  projectId: string;
  runId: string;
  patchId: string;
  status: 'VERIFIED' | 'VERIFICATION_FAILED' | 'REGRESSION_DETECTED' | 'NOT_VERIFIED' | 'SECURITY_FAILURE';
  target: {
    method: string;
    path: string;
  };
  before: {
    status: number;
    category: string;
    error?: string;
    stderrSnippet?: string;
  };
  after: {
    status: number | null;
    responseBody?: any;
    error?: string | null;
    responseTimeMs?: number;
  };
  targetFailureResolved: boolean;
  tests: {
    status: 'PASSED' | 'FAILED' | 'NOT_AVAILABLE' | 'NOT_EXECUTED' | 'ERROR';
    framework?: string;
    passed?: number;
    failed?: number;
    total?: number;
    summary?: string;
  };
  regressions: any[];
  originalWorkspaceUnchanged: boolean;
  decisionReason: string;
  artifact?: {
    artifactId: string;
    sha256: string;
    sizeBytes: number;
  } | null;
  verifiedAt: string;
}

/**
 * Triggers Phase 6 Real Repair Verification Pipeline
 */
export async function verifyProjectPatch(
  projectId: string,
  runId: string,
  patchId: string,
  token?: string | null
): Promise<ProjectVerificationResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/patches/${patchId}/verify`, {
    method: 'POST',
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details || data.error || 'Verification pipeline failed.');
  }

  return data;
}

/**
 * Fetches verification report by ID
 */
export async function fetchVerificationReport(
  projectId: string,
  runId: string,
  verificationId: string,
  token?: string | null
): Promise<ProjectVerificationResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/verifications/${verificationId}`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch verification report');
  }

  return res.json();
}

/**
 * Creates SSE stream listener for real Phase 6 verification events
 */
export function createVerificationEventSource(projectId: string, runId: string, verificationId: string): EventSource {
  return new EventSource(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/verifications/${verificationId}/stream`);
}

/**
 * Returns the download URL for verified repair package
 */
/**
 * Returns the download URL for verified repair package
 */
export function getVerifiedDownloadUrl(projectId: string, runId: string): string {
  return `${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/download-verified`;
}

export interface CreatePullRequestPayload {
  baseBranch?: string;
  githubToken?: string;
  repoUrl?: string;
  owner?: string;
  repo?: string;
}

export interface CreatePullRequestResponse {
  success: boolean;
  branch: string;
  commitSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  title: string;
  baseBranch: string;
  status: string;
  id?: string;
}

/**
 * Creates a real GitHub branch, commits the verified patch, and opens a Pull Request
 */
export async function createPullRequest(
  projectId: string,
  runId: string,
  payload: CreatePullRequestPayload,
  token?: string | null
): Promise<CreatePullRequestResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (payload.githubToken) {
    headers['X-GitHub-Token'] = payload.githubToken;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/create-pr`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.details || data.error || 'Failed to create GitHub Pull Request.');
  }

  return data;
}

/**
 * Fetches existing Pull Request details for a run
 */
export async function fetchPullRequest(
  projectId: string,
  runId: string,
  token?: string | null
): Promise<CreatePullRequestResponse | null> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/pull-request`, { headers });
  if (!res.ok) {
    return null;
  }

  return res.json();
}

export interface TimelineEvent {
  timestamp: string;
  stage: string;
  event: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  details?: string | null;
  error?: string | null;
}

export interface RunTimelineResponse {
  runId: string;
  timeline: TimelineEvent[];
}

/**
 * Cancels an active run
 */
export async function cancelRun(
  runId: string,
  projectId?: string,
  token?: string | null
): Promise<{ success?: boolean; status: string; message: string }> {
  const url = projectId
    ? `${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/cancel`
    : `${BACKEND_URL}/api/runs/${runId}/cancel`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason: 'Cancelled by user from dashboard.' })
  });

  return res.json();
}

/**
 * Fetches the structured execution timeline for a run
 */
export async function fetchRunTimeline(
  runId: string,
  projectId?: string,
  token?: string | null
): Promise<RunTimelineResponse> {
  const url = projectId
    ? `${BACKEND_URL}/api/projects/${projectId}/runs/${runId}/timeline`
    : `${BACKEND_URL}/api/runs/${runId}/timeline`;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    return { runId, timeline: [] };
  }
  return res.json();
}

// =========================================================================
// PHASE 12: WORKSPACE MULTI-TENANT APIs
// =========================================================================

export async function fetchWorkspaces(token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces`, { headers });
  if (!res.ok) throw new Error('Failed to fetch workspaces');
  return res.json();
}

export async function createWorkspace(name: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Failed to create workspace');
  return res.json();
}

export async function fetchWorkspaceMembers(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/members`, { headers });
  if (!res.ok) throw new Error('Failed to fetch workspace members');
  return res.json();
}

export async function addWorkspaceMember(
  workspaceId: string,
  member: { email: string; name?: string; role?: string },
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    headers,
    body: JSON.stringify(member)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to add workspace member');
  }
  return res.json();
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberId: string,
  role: string,
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ role })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to update member role');
  }
  return res.json();
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string,
  token?: string | null
) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/members/${memberId}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to remove member');
  }
  return res.json();
}

export async function fetchWorkspaceRepositories(
  workspaceId: string,
  params: { page?: number; limit?: number; search?: string } = {},
  token?: string | null
) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);

  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/repositories?${qs.toString()}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch repositories');
  return res.json();
}

export async function createWorkspaceRepository(
  workspaceId: string,
  repoData: { name: string; repositoryUrl: string; provider?: string; defaultBranch?: string },
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/repositories`, {
    method: 'POST',
    headers,
    body: JSON.stringify(repoData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to add repository');
  }
  return res.json();
}

export async function deleteWorkspaceRepository(
  workspaceId: string,
  repoId: string,
  token?: string | null
) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/repositories/${repoId}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error('Failed to delete repository');
  return res.json();
}

export async function fetchWorkspaceRuns(
  workspaceId: string,
  params: { page?: number; limit?: number; status?: string; repositoryId?: string } = {},
  token?: string | null
) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.status) qs.set('status', params.status);
  if (params.repositoryId) qs.set('repositoryId', params.repositoryId);

  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/runs?${qs.toString()}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch workspace repair runs');
  return res.json();
}

export async function fetchWorkspaceIncidents(
  workspaceId: string,
  params: { page?: number; limit?: number; state?: string; severity?: string; repositoryId?: string } = {},
  token?: string | null
) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.state) qs.set('state', params.state);
  if (params.severity) qs.set('severity', params.severity);
  if (params.repositoryId) qs.set('repositoryId', params.repositoryId);

  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/incidents?${qs.toString()}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch workspace incidents');
  return res.json();
}

export async function fetchWorkspaceAuditLogs(
  workspaceId: string,
  params: { page?: number; limit?: number; action?: string; actorId?: string } = {},
  token?: string | null
) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.action) qs.set('action', params.action);
  if (params.actorId) qs.set('actorId', params.actorId);

  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/audit-logs?${qs.toString()}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch workspace audit logs');
  return res.json();
}

export async function fetchWorkspaceSettings(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/settings`, { headers });
  if (!res.ok) throw new Error('Failed to fetch workspace settings');
  return res.json();
}

export async function updateWorkspaceSettings(workspaceId: string, settings: Record<string, any>, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(settings)
  });
  if (!res.ok) throw new Error('Failed to update workspace settings');
  return res.json();
}

// =========================================================================
// PHASE 13 — STRIPE BILLING & SUBSCRIPTION CLIENT SDK
// =========================================================================

export async function fetchWorkspaceBilling(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/billing`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fetch workspace billing status');
  }
  return res.json();
}

export async function fetchBillingPlans(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/billing/plans`, { headers });
  if (!res.ok) throw new Error('Failed to fetch available billing plans');
  return res.json();
}

export async function fetchCreditLedger(
  workspaceId: string,
  params: { page?: number; limit?: number } = {},
  token?: string | null
) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/billing/ledger?${qs.toString()}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch credit transaction ledger');
  return res.json();
}

export async function createCheckoutSession(
  workspaceId: string,
  payload: { planId?: string; creditPackId?: string; successUrl?: string; cancelUrl?: string },
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/billing/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to initialize Stripe checkout session');
  }
  return res.json();
}

export async function createBillingPortalSession(
  workspaceId: string,
  payload: { returnUrl?: string } = {},
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/billing/portal`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to initialize Stripe billing portal session');
  }
  return res.json();
}

// =========================================================================
// PHASE 15 — INBOUND WEBHOOKS, SYNTHETIC PROBER & MULTI-CHANNEL ALERTS
// =========================================================================

export async function fetchInboundWebhookConfig(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/webhooks/inbound/config`, { headers });
  if (!res.ok) throw new Error('Failed to fetch inbound webhook config');
  return res.json();
}

export async function rotateInboundWebhookSecret(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/webhooks/inbound/rotate-secret`, {
    method: 'POST',
    headers
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to rotate webhook secret');
  }
  return res.json();
}

export async function fetchAlertChannels(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/alerts/channels`, { headers });
  if (!res.ok) throw new Error('Failed to fetch notification channels');
  return res.json();
}

export async function createAlertChannel(
  workspaceId: string,
  channelData: { type: 'slack' | 'discord' | 'webhook' | 'email'; name: string; targetUrl: string; events?: string[] },
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/alerts/channels`, {
    method: 'POST',
    headers,
    body: JSON.stringify(channelData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to create alert channel');
  }
  return res.json();
}

export async function deleteAlertChannel(workspaceId: string, channelId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/alerts/channels/${channelId}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error('Failed to delete alert channel');
  return res.json();
}

export async function sendTestAlert(workspaceId: string, channelId: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/alerts/test`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ channelId })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to send test notification');
  }
  return res.json();
}

export async function fetchSyntheticProberConfig(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/synthetic-prober`, { headers });
  if (!res.ok) throw new Error('Failed to fetch synthetic prober configuration');
  return res.json();
}

export async function updateSyntheticProberConfig(
  workspaceId: string,
  updates: Record<string, any>,
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/synthetic-prober`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update synthetic prober configuration');
  return res.json();
}

export async function triggerCanaryProbeNow(workspaceId: string, baseUrl?: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/synthetic-prober/probe-now`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ baseUrl })
  });
  if (!res.ok) throw new Error('Failed to run on-demand canary probe cycle');
  return res.json();
}

export async function fetchRemediationPolicy(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/remediation-policy`, { headers });
  if (!res.ok) throw new Error('Failed to fetch remediation policy');
  return res.json();
}

export async function updateRemediationPolicy(
  workspaceId: string,
  updates: { strategy?: string; maxDailyAutoRepairs?: number; requireCleanSandboxPass?: boolean },
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/remediation-policy`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to update remediation policy');
  }
  return res.json();
}

/**
 * Phase 16: Fetch workspace-scoped observability & SRE telemetry
 */
export async function fetchWorkspaceObservability(workspaceId: string, token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/observability`, { headers });
  if (!res.ok) throw new Error('Failed to fetch workspace observability data');
  return res.json();
}

/**
 * Phase 16: Update workspace SLO targets
 */
export async function updateWorkspaceSlo(
  workspaceId: string,
  targets: { availabilityTargetPercent?: number; latencyTargetMs?: number; repairSuccessTargetPercent?: number },
  token?: string | null
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api/workspaces/${workspaceId}/observability/slo`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(targets)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to update SLO targets');
  }
  return res.json();
}

/**
 * Phase 16: Fetch global observability summary
 */
export async function fetchObservabilitySummary() {
  const res = await fetch(`${BACKEND_URL}/api/observability/summary`);
  if (!res.ok) throw new Error('Failed to fetch observability summary');
  return res.json();
}

/**
 * Phase 16: Fetch trace timeline by correlation ID
 */
export async function fetchTraceTimeline(correlationId: string) {
  const res = await fetch(`${BACKEND_URL}/api/observability/trace/${encodeURIComponent(correlationId)}`);
  if (!res.ok) throw new Error('Failed to fetch trace timeline');
  return res.json();
}
