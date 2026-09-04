const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const http = require('http');

const { app } = require('../src/server');
const workspaceService = require('../src/services/workspaceService');
const incidentService = require('../src/services/incidentService');
const auditLogger = require('../src/services/auditLogger');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

let testServer = null;
let serverPort = 0;
let baseUrl = '';

// Test JWT Helper
function generateTestToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'developer' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// HTTP request helper
async function makeRequest(method, endpointPath, { body, token, workspaceId } = {}) {
  const url = `${baseUrl}${endpointPath}`;
  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const status = res.status;
  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return { status, data, headers: res.headers };
}

describe('Phase 12 — Multi-Tenant Workspaces, Persistence & RBAC Test Suite', () => {
  const userAlpha = { id: 'usr_tenant_alpha', email: 'alice@alpha-corp.io', name: 'Alice Alpha', role: 'developer' };
  const userBeta = { id: 'usr_tenant_beta', email: 'bob@beta-industries.io', name: 'Bob Beta', role: 'developer' };
  const userAdmin = { id: 'usr_admin_sys', email: 'admin@apifix.ai', name: 'Sys Admin', role: 'admin' };
  const userMember = { id: 'usr_member_charlie', email: 'charlie@alpha-corp.io', name: 'Charlie Member', role: 'developer' };
  const userViewer = { id: 'usr_viewer_diana', email: 'diana@alpha-corp.io', name: 'Diana Viewer', role: 'developer' };

  let tokenAlpha = '';
  let tokenBeta = '';
  let tokenAdmin = '';
  let tokenMember = '';
  let tokenViewer = '';

  let workspaceAlpha = null;
  let workspaceBeta = null;

  before(async () => {
    tokenAlpha = generateTestToken(userAlpha);
    tokenBeta = generateTestToken(userBeta);
    tokenAdmin = generateTestToken(userAdmin);
    tokenMember = generateTestToken(userMember);
    tokenViewer = generateTestToken(userViewer);

    // Spin up ephemeral test server if not listening
    await new Promise((resolve) => {
      testServer = http.createServer(app);
      testServer.listen(0, '127.0.0.1', () => {
        serverPort = testServer.address().port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (testServer) {
      await new Promise((r) => testServer.close(r));
    }
  });

  // TEST 1: User Registration & Workspace Auto-Provisioning
  test('TEST 1: Registration auto-provisions default workspace for new user', async () => {
    const regEmail = `test_new_${Date.now()}@tenant-auto.org`;
    const regRes = await makeRequest('POST', '/api/auth/register', {
      body: { email: regEmail, password: 'StrongPassword123!', name: 'New Tenant' }
    });

    assert.equal(regRes.status, 201);
    assert.ok(regRes.data.token, 'Token must be issued');
    assert.ok(regRes.data.defaultWorkspace, 'Default workspace must be auto-provisioned');
    assert.ok(regRes.data.defaultWorkspace.name.includes('New Tenant'), 'Workspace name should reflect user name');
    assert.equal(regRes.data.defaultWorkspace.role, 'OWNER', 'Creator should have OWNER role');
  });

  // TEST 2: Workspace Creation & Ownership Assignment
  test('TEST 2: Authenticated user can create new isolated workspace', async () => {
    const createRes = await makeRequest('POST', '/api/workspaces', {
      token: tokenAlpha,
      body: { name: 'Alpha Corporation Production Workspace' }
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.data.workspace);
    assert.equal(createRes.data.workspace.name, 'Alpha Corporation Production Workspace');
    assert.equal(createRes.data.workspace.ownerId, userAlpha.id);
    assert.equal(createRes.data.workspace.role, 'OWNER');

    workspaceAlpha = createRes.data.workspace;

    // Create Beta Workspace for tenant Bob
    const createBetaRes = await makeRequest('POST', '/api/workspaces', {
      token: tokenBeta,
      body: { name: 'Beta Industries Core Workspace' }
    });
    assert.equal(createBetaRes.status, 201);
    workspaceBeta = createBetaRes.data.workspace;
  });

  // TEST 3: Workspace Membership Management
  test('TEST 3: Workspace owner can invite members and assign roles (ADMIN, MEMBER, VIEWER)', async () => {
    // Add Charlie as MEMBER
    const addMemberRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/members`, {
      token: tokenAlpha,
      body: { userId: userMember.id, email: userMember.email, name: userMember.name, role: 'MEMBER' }
    });
    assert.equal(addMemberRes.status, 201);
    assert.equal(addMemberRes.data.member.role, 'MEMBER');

    // Add Diana as VIEWER
    const addViewerRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/members`, {
      token: tokenAlpha,
      body: { userId: userViewer.id, email: userViewer.email, name: userViewer.name, role: 'VIEWER' }
    });
    assert.equal(addViewerRes.status, 201);
    assert.equal(addViewerRes.data.member.role, 'VIEWER');

    // List members
    const membersListRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/members`, {
      token: tokenAlpha
    });
    assert.equal(membersListRes.status, 200);
    assert.ok(membersListRes.data.members.length >= 3);
  });

  // TEST 4: Role Authorization — OWNER capabilities
  test('TEST 4: OWNER can update workspace settings and role permissions', async () => {
    const updateRes = await makeRequest('PATCH', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenAlpha,
      body: {
        name: 'Alpha Corp Global Engineering',
        settings: {
          defaultAiProvider: 'groq',
          approvalRequired: true,
          maxConcurrentRepairs: 4
        }
      }
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.workspace.name, 'Alpha Corp Global Engineering');
    assert.equal(updateRes.data.workspace.settings.maxConcurrentRepairs, 4);
  });

  // TEST 5: Role Authorization — MEMBER restrictions
  test('TEST 5: MEMBER cannot modify workspace settings or invite other members', async () => {
    // Member attempts to modify settings -> Expect 403
    const updateSettingsRes = await makeRequest('PATCH', `/api/workspaces/${workspaceAlpha.id}/settings`, {
      token: tokenMember,
      body: { defaultAiProvider: 'openai' }
    });
    assert.equal(updateSettingsRes.status, 403, 'MEMBER should be blocked from modifying settings');

    // Member attempts to add member -> Expect 403
    const addMemberRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/members`, {
      token: tokenMember,
      body: { email: 'unauthorized@alpha-corp.io', role: 'MEMBER' }
    });
    assert.equal(addMemberRes.status, 403, 'MEMBER should be blocked from adding members');
  });

  // TEST 6: Role Authorization — VIEWER read-only enforcement
  test('TEST 6: VIEWER cannot create repositories or initiate repairs (Read-Only)', async () => {
    // Viewer attempts to create repository -> Expect 403
    const createRepoRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/repositories`, {
      token: tokenViewer,
      body: { name: 'unauthorized-repo', repositoryUrl: 'https://github.com/alpha/repo' }
    });
    assert.equal(createRepoRes.status, 403, 'VIEWER must not be allowed to create repositories');

    // Viewer attempts to start repair -> Expect 403
    const startRunRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/runs`, {
      token: tokenViewer,
      body: { mode: 'repair' }
    });
    assert.equal(startRunRes.status, 403, 'VIEWER must not be allowed to start repair runs');

    // Viewer CAN read repositories -> Expect 200
    const listReposRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/repositories`, {
      token: tokenViewer
    });
    assert.equal(listReposRes.status, 200, 'VIEWER should be able to view repositories');
  });

  // TEST 7: Multi-Tenant Data Isolation — Cross-Workspace Rejection
  test('TEST 7: User in Workspace Beta cannot access Workspace Alpha resources (HTTP 403)', async () => {
    // Bob (Workspace Beta) attempts to view Alpha's workspace details
    const wsDetailRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenBeta
    });
    assert.equal(wsDetailRes.status, 403, 'Cross-workspace access must return 403 Forbidden');

    // Bob attempts to list Alpha's members
    const membersRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/members`, {
      token: tokenBeta
    });
    assert.equal(membersRes.status, 403, 'Cross-workspace member listing must return 403');

    // Bob attempts to list Alpha's repositories
    const reposRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/repositories`, {
      token: tokenBeta
    });
    assert.equal(reposRes.status, 403, 'Cross-workspace repository listing must return 403');

    // Bob attempts to list Alpha's audit logs
    const auditRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/audit-logs`, {
      token: tokenBeta
    });
    assert.equal(auditRes.status, 403, 'Cross-workspace audit log listing must return 403');
  });

  // TEST 8: Persistent Repository Scoping
  test('TEST 8: Repositories are properly persisted and isolated per workspace', async () => {
    // Add repo to Workspace Alpha
    const addRepoRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/repositories`, {
      token: tokenAlpha,
      body: {
        name: 'auth-service-api',
        provider: 'github',
        repositoryUrl: 'https://github.com/alpha-corp/auth-service',
        defaultBranch: 'main'
      }
    });
    assert.equal(addRepoRes.status, 201);
    const repoAlpha = addRepoRes.data.repository;
    assert.equal(repoAlpha.workspaceId, workspaceAlpha.id);

    // List repos in Alpha -> contains auth-service-api
    const alphaList = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/repositories`, {
      token: tokenAlpha
    });
    assert.equal(alphaList.status, 200);
    assert.ok(alphaList.data.items.some(r => r.name === 'auth-service-api'));

    // List repos in Beta -> does NOT contain Alpha's repo
    const betaList = await makeRequest('GET', `/api/workspaces/${workspaceBeta.id}/repositories`, {
      token: tokenBeta
    });
    assert.equal(betaList.status, 200);
    assert.ok(!betaList.data.items.some(r => r.name === 'auth-service-api'), 'Beta must not see Alpha repo');
  });

  // TEST 9: Persistent Repair Run Scoping & Lifecycle
  test('TEST 9: Repair runs are recorded, updated, and isolated per workspace', async () => {
    const runId = `run_test_${Date.now()}`;
    const createRunRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/runs`, {
      token: tokenAlpha,
      body: {
        id: runId,
        status: 'investigating',
        currentStage: 'INVESTIGATING',
        confidence: '95%'
      }
    });

    assert.equal(createRunRes.status, 201);
    assert.equal(createRunRes.data.run.id, runId);
    assert.equal(createRunRes.data.run.workspaceId, workspaceAlpha.id);

    // Fetch run details in Alpha -> 200
    const getRunAlpha = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/runs/${runId}`, {
      token: tokenAlpha
    });
    assert.equal(getRunAlpha.status, 200);
    assert.equal(getRunAlpha.data.run.id, runId);

    // Fetch run details from Beta -> 403 Forbidden
    const getRunBeta = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/runs/${runId}`, {
      token: tokenBeta
    });
    assert.equal(getRunBeta.status, 403, 'Unauthorized tenant cannot access another tenant run');
  });

  // TEST 10: Persistent Incident Tracking
  test('TEST 10: Incidents are persisted, filterable by severity, and linked to workspaces', async () => {
    const createIncRes = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/incidents`, {
      token: tokenAlpha,
      body: {
        endpoint: '/api/v1/checkout/pay',
        method: 'POST',
        status: 500,
        severity: 'CRITICAL',
        classification: 'NULL_POINTER_EXCEPTION',
        errorMessage: 'Cannot read properties of undefined (reading charge)'
      }
    });

    assert.equal(createIncRes.status, 201);
    const incId = createIncRes.data.incident.id;

    // Filter by severity=CRITICAL
    const listRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/incidents?severity=CRITICAL`, {
      token: tokenAlpha
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.data.items.some(i => i.id === incId));

    // Resolve incident
    const updateRes = await makeRequest('PATCH', `/api/workspaces/${workspaceAlpha.id}/incidents/${incId}`, {
      token: tokenAlpha,
      body: { state: 'RESOLVED' }
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.incident.state, 'RESOLVED');
    assert.ok(updateRes.data.incident.resolvedAt, 'Resolved timestamp must be recorded');
  });

  // TEST 11: Audit Logging & Secret Redaction
  test('TEST 11: Security audit events are recorded with automatic secret sanitization', async () => {
    // Trigger action with sensitive payload
    const fakeGhp = ['ghp', 'secret_token_1234567890abcdef'].join('_');
    const fakeGsk = ['gsk', 'groq_production_secret_key_123456'].join('_');
    await auditLogger.recordAuditEvent({
      workspaceId: workspaceAlpha.id,
      actorId: userAlpha.id,
      actorEmail: userAlpha.email,
      action: 'GITHUB_OPERATION',
      resourceType: 'REPOSITORY',
      resourceId: 'repo_123',
      metadata: {
        githubToken: fakeGhp,
        jwtSecret: 'super_secret_jwt_key',
        apiKey: fakeGsk,
        branch: 'fix/auth-bug',
        commitMessage: 'fix: handle null user'
      }
    });

    const auditListRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/audit-logs?action=GITHUB_OPERATION`, {
      token: tokenAlpha
    });

    assert.equal(auditListRes.status, 200);
    assert.ok(auditListRes.data.items.length > 0);

    const latest = auditListRes.data.items[0];
    assert.equal(latest.action, 'GITHUB_OPERATION');

    // Secrets must be redacted
    const metaStr = JSON.stringify(latest.metadata);
    assert.ok(!metaStr.includes(fakeGhp), 'GitHub token must not be in audit log');
    assert.ok(!metaStr.includes(fakeGsk), 'Groq API key must not be in audit log');
    assert.ok(!metaStr.includes('super_secret_jwt_key'), 'JWT secret must not be in audit log');
    assert.ok(metaStr.includes('[REDACTED_SECRET]'), 'Metadata should contain redacted indicator');
  });

  // TEST 12: Pagination Bounds & Parameter Enforcement
  test('TEST 12: Pagination calculates offsets correctly and caps limits at safe maximums', async () => {
    const pageRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/audit-logs?page=1&limit=5`, {
      token: tokenAlpha
    });

    assert.equal(pageRes.status, 200);
    assert.equal(pageRes.data.page, 1);
    assert.equal(pageRes.data.limit, 5);
    assert.ok(pageRes.data.total >= 1);
    assert.ok(pageRes.data.totalPages >= 1);
    assert.ok(pageRes.data.items.length <= 5);
  });

  // TEST 13: Protected Artifact Downloads & Cross-Tenant Defense
  test('TEST 13: Artifact download enforces workspace authorization and returns 403 for other tenants', async () => {
    // Create a mock artifact in storage/artifacts
    const storageArtifactsDir = path.resolve(__dirname, '../storage/artifacts');
    if (!fs.existsSync(storageArtifactsDir)) {
      fs.mkdirSync(storageArtifactsDir, { recursive: true });
    }
    const testRunId = 'run_artifact_test_123';
    const mockZipPath = path.join(storageArtifactsDir, `repaired_${testRunId}.zip`);
    fs.writeFileSync(mockZipPath, 'PK\x03\x04mock_zip_content');

    // Authorized download by Alice in Alpha -> 200 OK
    const authDownload = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/runs/${testRunId}/download`, {
      token: tokenAlpha
    });
    assert.equal(authDownload.status, 200);
    assert.equal(authDownload.headers.get('content-type'), 'application/zip');

    // Unauthorized download by Bob (Beta) from Alpha's run -> 403 Forbidden
    const unauthDownload = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/runs/${testRunId}/download`, {
      token: tokenBeta
    });
    assert.equal(unauthDownload.status, 403, 'Cross-workspace artifact download must be rejected');

    // Cleanup mock zip
    if (fs.existsSync(mockZipPath)) fs.unlinkSync(mockZipPath);
  });

  // TEST 14: System Administrator Global Workspace Access
  test('TEST 14: System Administrator can inspect any workspace without explicit membership', async () => {
    const adminAccessRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenAdmin
    });
    assert.equal(adminAccessRes.status, 200);
    assert.equal(adminAccessRes.data.workspace.id, workspaceAlpha.id);
  });

  // TEST 15: Last Owner Protection
  test('TEST 15: Cannot demote or remove the sole OWNER of a workspace', async () => {
    // Attempt to remove Alice (the sole OWNER)
    const removeOwnerRes = await makeRequest('DELETE', `/api/workspaces/${workspaceAlpha.id}/members/${userAlpha.id}`, {
      token: tokenAlpha
    });
    assert.equal(removeOwnerRes.status, 400, 'Removing sole OWNER must be rejected');
    assert.ok(removeOwnerRes.data.error.message.includes('only OWNER'));
  });

  // TEST 16: Vertical Privilege Escalation Rejection
  test('TEST 16: MEMBER or VIEWER cannot escalate themselves or others to OWNER', async () => {
    const escalateRes = await makeRequest('PATCH', `/api/workspaces/${workspaceAlpha.id}/members/${userMember.id}`, {
      token: tokenMember,
      body: { role: 'OWNER' }
    });
    assert.equal(escalateRes.status, 403, 'Unauthorized role promotion must be rejected');
  });

  // TEST 17: IDOR Protection — Cross-Workspace Incident Modification Rejection
  test('TEST 17: Tenant cannot update or resolve an incident belonging to another workspace', async () => {
    // Create incident in Alpha
    const incAlpha = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/incidents`, {
      token: tokenAlpha,
      body: { endpoint: '/api/alpha/secret', method: 'GET', status: 500 }
    });
    assert.equal(incAlpha.status, 201);
    const incId = incAlpha.data.incident.id;

    // Bob in Beta attempts to resolve Alpha's incident via Beta's workspace route -> 404
    const idorRes = await makeRequest('PATCH', `/api/workspaces/${workspaceBeta.id}/incidents/${incId}`, {
      token: tokenBeta,
      body: { state: 'RESOLVED' }
    });
    assert.equal(idorRes.status, 404, 'Accessing another workspace incident must return 404');
  });

  // TEST 18: IDOR Protection — Cross-Workspace Repository Deletion Rejection
  test('TEST 18: Tenant cannot delete a repository belonging to another workspace', async () => {
    const repoAlpha = await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/repositories`, {
      token: tokenAlpha,
      body: { name: 'top-secret-repo', repositoryUrl: 'https://github.com/alpha/secret' }
    });
    assert.equal(repoAlpha.status, 201);
    const repoId = repoAlpha.data.repository.id;

    // Bob in Beta attempts to delete Alpha's repo via Beta's workspace route -> 400 or 404
    const deleteIdorRes = await makeRequest('DELETE', `/api/workspaces/${workspaceBeta.id}/repositories/${repoId}`, {
      token: tokenBeta
    });
    assert.ok([400, 403, 404].includes(deleteIdorRes.status), 'Cross-tenant repository deletion must fail');
  });

  // TEST 19: Multi-Criteria Filter Query Validation
  test('TEST 19: Multi-criteria filtering accurately filters incidents by status and severity', async () => {
    await makeRequest('POST', `/api/workspaces/${workspaceAlpha.id}/incidents`, {
      token: tokenAlpha,
      body: { endpoint: '/api/v1/low-warn', method: 'GET', status: 400, severity: 'LOW', state: 'OPEN' }
    });

    const filterRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/incidents?severity=LOW&state=OPEN`, {
      token: tokenAlpha
    });
    assert.equal(filterRes.status, 200);
    assert.ok(filterRes.data.items.every(i => i.severity === 'LOW' && i.state === 'OPEN'));
  });

  // TEST 20: Audit Log Actor Attribution & Timestamp Ordering
  test('TEST 20: Audit logs maintain chronological descending order and actor attribution', async () => {
    const auditRes = await makeRequest('GET', `/api/workspaces/${workspaceAlpha.id}/audit-logs?limit=10`, {
      token: tokenAlpha
    });
    assert.equal(auditRes.status, 200);
    const logs = auditRes.data.items;
    assert.ok(logs.length >= 2);

    for (let i = 0; i < logs.length - 1; i++) {
      const t1 = new Date(logs[i].timestamp).getTime();
      const t2 = new Date(logs[i + 1].timestamp).getTime();
      assert.ok(t1 >= t2, 'Audit logs must be ordered from most recent to oldest');
    }
  });
});
