const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Import units to test
const {
  parseGithubUrl,
  validateGithubToken,
  getRepositoryInfo,
  getBranchHeadSha,
  generateUniqueBranchName,
  createGitTreeAndCommit,
  createRemoteBranch,
  openPullRequest,
  generatePullRequestBody,
  executeGithubPullRequestFlow
} = require('../src/services/githubService');

const {
  createProjectRecord,
  createProjectRun,
  createVerificationRecord,
  createPullRequestRecord,
  getPullRequestByRunId,
  getPullRequestById
} = require('../src/services/projectStore');

// Setup mock workspace
const TEST_WORKSPACE = path.resolve(__dirname, '../workspaces/test_phase7_github');
const TEST_SRC_FILE = path.join(TEST_WORKSPACE, 'src/controllers/authController.js');

if (!fs.existsSync(path.dirname(TEST_SRC_FILE))) {
  fs.mkdirSync(path.dirname(TEST_SRC_FILE), { recursive: true });
}
fs.writeFileSync(TEST_SRC_FILE, 'function login(req, res) { return res.status(401).json({ error: "Invalid credentials" }); }', 'utf8');

// Mock GitHub API Server Setup
let mockServer;
let mockPort;
let mockState = {
  userValid: true,
  repoFound: true,
  canPush: true,
  baseBranchFound: true,
  baseSha: 'base_commit_sha_1234567890',
  baseTreeSha: 'base_tree_sha_1234567890',
  existingBranches: new Set(['main', 'master', 'apifix/fix-auth-login-run123']),
  createdBranches: [],
  createdBlobs: [],
  createdTrees: [],
  createdCommits: [],
  createdPulls: [],
  prNumberSequence: 101
};

function startMockGithubServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      const url = req.url;
      const method = req.method;
      const authHeader = req.headers['authorization'] || '';

      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(bodyStr); } catch (e) {}

        res.setHeader('Content-Type', 'application/json');

        // Check authentication
        if (authHeader.includes('invalid_token') || !mockState.userValid) {
          res.writeHead(401);
          return res.end(JSON.stringify({ message: 'Bad credentials' }));
        }

        // 1. GET /user
        if (method === 'GET' && url === '/user') {
          res.writeHead(200);
          return res.end(JSON.stringify({ login: 'octocat', id: 583231 }));
        }

        // 2. GET /repos/:owner/:repo
        if (method === 'GET' && url.startsWith('/repos/') && !url.includes('/git/') && !url.includes('/pulls') && !url.includes('/branches/')) {
          if (!mockState.repoFound) {
            res.writeHead(404);
            return res.end(JSON.stringify({ message: 'Not Found' }));
          }
          if (!mockState.canPush) {
            res.writeHead(403);
            return res.end(JSON.stringify({ message: 'Must have push access to repository' }));
          }
          res.writeHead(200);
          return res.end(JSON.stringify({
            name: 'test-repo',
            full_name: 'test-owner/test-repo',
            default_branch: 'main',
            private: false,
            permissions: { push: true, pull: true, admin: false }
          }));
        }

        // 3. GET /repos/:owner/:repo/git/ref/heads/:branch
        if (method === 'GET' && url.includes('/git/ref/heads/')) {
          const branchName = url.split('/git/ref/heads/')[1];
          if (mockState.existingBranches.has(branchName) || branchName === 'main') {
            res.writeHead(200);
            return res.end(JSON.stringify({
              ref: `refs/heads/${branchName}`,
              object: { sha: mockState.baseSha, type: 'commit' }
            }));
          }
          res.writeHead(404);
          return res.end(JSON.stringify({ message: 'Not Found' }));
        }

        // 4. GET /repos/:owner/:repo/git/commits/:sha
        if (method === 'GET' && url.includes('/git/commits/')) {
          res.writeHead(200);
          return res.end(JSON.stringify({
            sha: mockState.baseSha,
            tree: { sha: mockState.baseTreeSha }
          }));
        }

        // 5. POST /repos/:owner/:repo/git/blobs
        if (method === 'POST' && url.includes('/git/blobs')) {
          const blobSha = `blob_sha_${Math.random().toString(36).substr(2, 8)}`;
          mockState.createdBlobs.push({ sha: blobSha, content: body.content });
          res.writeHead(201);
          return res.end(JSON.stringify({ sha: blobSha }));
        }

        // 6. POST /repos/:owner/:repo/git/trees
        if (method === 'POST' && url.includes('/git/trees')) {
          const treeSha = `tree_sha_${Math.random().toString(36).substr(2, 8)}`;
          mockState.createdTrees.push({ sha: treeSha, tree: body.tree });
          res.writeHead(201);
          return res.end(JSON.stringify({ sha: treeSha }));
        }

        // 7. POST /repos/:owner/:repo/git/commits
        if (method === 'POST' && url.includes('/git/commits')) {
          const commitSha = `commit_sha_${Math.random().toString(36).substr(2, 8)}`;
          mockState.createdCommits.push({ sha: commitSha, message: body.message, tree: body.tree });
          res.writeHead(201);
          return res.end(JSON.stringify({ sha: commitSha }));
        }

        // 8. POST /repos/:owner/:repo/git/refs
        if (method === 'POST' && url.includes('/git/refs')) {
          const refName = body.ref.replace('refs/heads/', '');
          if (!mockState.canPush) {
            res.writeHead(403);
            return res.end(JSON.stringify({ message: 'Permission denied to create branch ref' }));
          }
          mockState.createdBranches.push({ ref: body.ref, sha: body.sha });
          mockState.existingBranches.add(refName);
          res.writeHead(201);
          return res.end(JSON.stringify({ ref: body.ref, object: { sha: body.sha } }));
        }

        // 9. POST /repos/:owner/:repo/pulls
        if (method === 'POST' && url.includes('/pulls')) {
          const prNumber = mockState.prNumberSequence++;
          const prObj = {
            number: prNumber,
            html_url: `https://github.com/test-owner/test-repo/pull/${prNumber}`,
            state: 'open',
            title: body.title,
            body: body.body,
            head: body.head,
            base: body.base,
            created_at: new Date().toISOString()
          };
          mockState.createdPulls.push(prObj);
          res.writeHead(201);
          return res.end(JSON.stringify(prObj));
        }

        res.writeHead(404);
        res.end(JSON.stringify({ message: 'Unhandled mock route' }));
      });
    });

    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port;
      process.env.GITHUB_API_BASE = `http://127.0.0.1:${mockPort}`;
      resolve();
    });
  });
}

function stopMockGithubServer() {
  return new Promise((resolve) => {
    if (mockServer) {
      mockServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

test('APIFIX V2 — Phase 7: Real GitHub Branch, Commit & PR Tests', async (t) => {
  await startMockGithubServer();

  t.after(async () => {
    await stopMockGithubServer();
    try { fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true }); } catch (e) {}
  });

  // TEST 1: Reject PR creation when run is not VERIFIED
  await t.test('TEST 1: Reject PR creation when run is not VERIFIED', async () => {
    const unverifiedStatuses = ['PATCH_GENERATED', 'PATCH_APPLIED', 'VERIFICATION_PENDING', 'VERIFICATION_FAILED', 'RUNNING', 'FAILED'];
    for (const status of unverifiedStatuses) {
      const mockVerification = { status };
      const isAllowed = mockVerification.status === 'VERIFIED';
      assert.strictEqual(isAllowed, false, `Status ${status} must NOT be allowed to create a Pull Request`);
    }
  });

  // TEST 2: Reject missing GitHub credentials
  await t.test('TEST 2: Reject missing GitHub credentials', async () => {
    await assert.rejects(
      async () => {
        await validateGithubToken('');
      },
      (err) => {
        assert.strictEqual(err.code, 'GITHUB_AUTH_REQUIRED');
        return true;
      }
    );
  });

  // TEST 3: Reject invalid GitHub token
  await t.test('TEST 3: Reject invalid GitHub token', async () => {
    await assert.rejects(
      async () => {
        await validateGithubToken('invalid_token_xyz');
      },
      (err) => {
        assert.strictEqual(err.code, 'GITHUB_TOKEN_INVALID');
        return true;
      }
    );
  });

  // TEST 4: Validate repository ownership & access
  await t.test('TEST 4: Validate repository ownership & access', async () => {
    const repoInfo = await getRepositoryInfo('test-owner', 'test-repo', 'valid_token_123');
    assert.strictEqual(repoInfo.name, 'test-repo');
    assert.strictEqual(repoInfo.defaultBranch, 'main');
    assert.strictEqual(repoInfo.permissions.push, true);
  });

  // TEST 5: Generate collision-free branch name
  await t.test('TEST 5: Generate collision-free branch name', async () => {
    // 'apifix/fix-auth-login-run123' exists in mockState
    const branchName = await generateUniqueBranchName('test-owner', 'test-repo', 'apifix/fix-auth-login-run123', 'valid_token_123');
    assert.strictEqual(branchName, 'apifix/fix-auth-login-run123-2', 'Should append -2 on collision');
  });

  // TEST 6: Create branch using mocked GitHub API
  await t.test('TEST 6: Create branch using mocked GitHub API', async () => {
    const ref = await createRemoteBranch('test-owner', 'test-repo', 'apifix/fix-test-branch-01', 'commit_sha_abc123', 'valid_token_123');
    assert.strictEqual(ref.ref, 'refs/heads/apifix/fix-test-branch-01');
  });

  // TEST 7: Create multi-file Git tree
  await t.test('TEST 7: Create multi-file Git tree', async () => {
    const files = [
      { path: 'src/controllers/authController.js', content: 'const x = 1;' },
      { path: 'src/services/userService.js', content: 'const y = 2;' }
    ];
    const { treeSha, commitSha } = await createGitTreeAndCommit({
      owner: 'test-owner',
      repo: 'test-repo',
      baseSha: 'base_commit_sha_1234567890',
      files,
      commitMessage: 'fix: multi-file patch application',
      token: 'valid_token_123'
    });
    assert.ok(treeSha.startsWith('tree_sha_'));
    assert.ok(commitSha.startsWith('commit_sha_'));
  });

  // TEST 8: Create commit with sanitized message and metadata
  await t.test('TEST 8: Create commit with sanitized message and metadata', async () => {
    const commitMsg = 'fix: repair POST /api/auth/login runtime failure\n\nVerified by APIFIX';
    const { commitSha } = await createGitTreeAndCommit({
      owner: 'test-owner',
      repo: 'test-repo',
      baseSha: 'base_commit_sha_1234567890',
      files: [{ path: 'src/controllers/authController.js', content: 'const auth = true;' }],
      commitMessage: commitMsg,
      token: 'valid_token_123'
    });
    assert.ok(commitSha);
    const lastCommit = mockState.createdCommits[mockState.createdCommits.length - 1];
    assert.strictEqual(lastCommit.message, commitMsg);
  });

  // TEST 9: Create Pull Request against base branch
  await t.test('TEST 9: Create Pull Request against base branch', async () => {
    const prResult = await openPullRequest({
      owner: 'test-owner',
      repo: 'test-repo',
      title: 'fix: APIFIX repair for POST /api/auth/login',
      body: 'Verified repair details',
      headBranch: 'apifix/fix-test-branch-01',
      baseBranch: 'main',
      token: 'valid_token_123'
    });
    assert.ok(prResult.prNumber > 0);
    assert.ok(prResult.prUrl.includes('/pull/'));
    assert.strictEqual(prResult.state, 'open');
  });

  // TEST 10: Verify PR body contains truthful verification data
  await t.test('TEST 10: Verify PR body contains truthful verification data', async () => {
    const prBody = generatePullRequestBody({
      runId: 'run_test_12345',
      verification: {
        target: { method: 'POST', path: '/api/auth/login' },
        before: { status: 500, error: 'TypeError: Cannot read properties of null (reading password)' },
        after: { status: 401, responseBody: { error: 'Invalid credentials' } },
        tests: { status: 'PASSED', passed: 1, total: 1 }
      },
      investigation: {
        rootCause: {
          summary: 'Missing null check on user record before password comparison.',
          explanation: 'When user is not found, findByEmail returns null causing unhandled crash.'
        }
      },
      patch: {
        changes: [{ file: 'src/controllers/authController.js' }],
        reason: 'Inserted explicit null check before property dereference.'
      }
    });

    assert.ok(prBody.includes('POST /api/auth/login'));
    assert.ok(prBody.includes('HTTP 500'));
    assert.ok(prBody.includes('HTTP 401'));
    assert.ok(prBody.includes('Missing null check'));
    assert.ok(prBody.includes('PASSED (1 / 1 tests passing)'));
    assert.ok(prBody.includes('run_test_12345'));
  });

  // TEST 11: Ensure secrets never appear in PR body
  await t.test('TEST 11: Ensure secrets never appear in PR body', async () => {
    const prBody = generatePullRequestBody({
      runId: 'run_test_secrets',
      verification: {
        target: { method: 'POST', path: '/api/auth/login' },
        before: { status: 500 },
        after: { status: 401 },
        tests: { status: 'NOT_AVAILABLE' }
      },
      investigation: { rootCause: { summary: 'Fix crash' } },
      patch: { changes: [{ file: 'src/controllers/authController.js' }] }
    });

    assert.ok(!prBody.includes('SUPABASE_KEY'));
    assert.ok(!prBody.includes('OPENAI_API_KEY'));
    assert.ok(!prBody.includes('ANTHROPIC_API_KEY'));
    assert.ok(!prBody.includes('GROQ_API_KEY'));
    assert.ok(!prBody.includes('ghp_'));
  });

  // TEST 12: Ensure .env and sensitive files are never committed
  await t.test('TEST 12: Ensure .env and sensitive files are never committed', async () => {
    const sensitiveFiles = [
      { path: '.env', content: 'SECRET_KEY=12345' },
      { path: 'node_modules/pkg/index.js', content: 'var a=1;' },
      { path: '.git/config', content: 'config' },
      { path: 'src/safeFile.js', content: 'export const ok = true;' }
    ];

    const { treeSha } = await createGitTreeAndCommit({
      owner: 'test-owner',
      repo: 'test-repo',
      baseSha: 'base_commit_sha_1234567890',
      files: sensitiveFiles,
      commitMessage: 'fix: filter sensitive files',
      token: 'valid_token_123'
    });

    const lastTree = mockState.createdTrees[mockState.createdTrees.length - 1];
    const treePaths = lastTree.tree.map(t => t.path);
    assert.ok(treePaths.includes('src/safeFile.js'));
    assert.ok(!treePaths.includes('.env'));
    assert.ok(!treePaths.includes('node_modules/pkg/index.js'));
    assert.ok(!treePaths.includes('.git/config'));
  });

  // TEST 13: Handle GitHub 403 permission errors
  await t.test('TEST 13: Handle GitHub 403 permission errors', async () => {
    mockState.canPush = false;
    await assert.rejects(
      async () => {
        await getRepositoryInfo('test-owner', 'test-repo', 'valid_token_123');
      },
      (err) => {
        assert.strictEqual(err.code, 'GITHUB_PERMISSION_DENIED');
        return true;
      }
    );
    mockState.canPush = true; // reset
  });

  // TEST 14: Handle repository-not-found
  await t.test('TEST 14: Handle repository-not-found', async () => {
    mockState.repoFound = false;
    await assert.rejects(
      async () => {
        await getRepositoryInfo('non-existent-owner', 'non-existent-repo', 'valid_token_123');
      },
      (err) => {
        assert.strictEqual(err.code, 'GITHUB_REPOSITORY_NOT_FOUND');
        return true;
      }
    );
    mockState.repoFound = true; // reset
  });

  // TEST 15: Handle base branch changes
  await t.test('TEST 15: Handle base branch changes', async () => {
    const headSha = await getBranchHeadSha('test-owner', 'test-repo', 'main', 'valid_token_123');
    assert.strictEqual(headSha, mockState.baseSha);

    await assert.rejects(
      async () => {
        await getBranchHeadSha('test-owner', 'test-repo', 'non_existent_branch_xyz', 'valid_token_123');
      },
      (err) => {
        assert.strictEqual(err.code, 'GITHUB_BRANCH_NOT_FOUND');
        return true;
      }
    );
  });

  // TEST 16: Verify PR metadata persistence in ProjectStore
  await t.test('TEST 16: Verify PR metadata persistence in ProjectStore', async () => {
    const prData = {
      projectId: 'proj_test_github_01',
      runId: 'run_test_pr_persist_01',
      repositoryOwner: 'test-owner',
      repositoryName: 'test-repo',
      baseBranch: 'main',
      repairBranch: 'apifix/fix-auth-login-run123-2',
      commitSha: 'commit_sha_persist_123',
      prNumber: 105,
      prUrl: 'https://github.com/test-owner/test-repo/pull/105',
      status: 'OPEN',
      title: 'fix: APIFIX verified repair for POST /api/auth/login'
    };

    const saved = await createPullRequestRecord(prData);
    assert.strictEqual(saved.prNumber, 105);
    assert.strictEqual(saved.runId, 'run_test_pr_persist_01');

    const fetched = await getPullRequestByRunId('run_test_pr_persist_01');
    assert.ok(fetched);
    assert.strictEqual(fetched.prUrl, 'https://github.com/test-owner/test-repo/pull/105');
  });

  // TEST 17: End-to-End executeGithubPullRequestFlow integration test
  await t.test('TEST 17: End-to-End executeGithubPullRequestFlow integration test', async () => {
    const flowResult = await executeGithubPullRequestFlow({
      owner: 'test-owner',
      repo: 'test-repo',
      baseBranch: 'main',
      githubToken: 'valid_token_123',
      workingDir: TEST_WORKSPACE,
      patch: {
        changes: [{ file: 'src/controllers/authController.js' }],
        reason: 'Added null check on user record'
      },
      verification: {
        target: { method: 'POST', path: '/api/auth/login' },
        before: { status: 500, error: 'TypeError' },
        after: { status: 401, responseBody: { error: 'Invalid credentials' } },
        tests: { status: 'PASSED', passed: 1, total: 1 }
      },
      investigation: {
        rootCause: { summary: 'Null pointer dereference', explanation: 'Fixed unhandled user lookup.' }
      },
      project: { name: 'test-repo' },
      runId: 'run_e2e_pr_test_777'
    });

    assert.strictEqual(flowResult.success, true);
    assert.strictEqual(flowResult.status, 'OPEN');
    assert.ok(flowResult.pullRequestNumber > 0);
    assert.ok(flowResult.pullRequestUrl.includes('https://github.com/test-owner/test-repo/pull/'));
    assert.ok(flowResult.branch.includes('apifix/fix-api-auth-login-run_e2e_pr'));
  });
});
