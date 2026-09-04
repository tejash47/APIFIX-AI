/**
 * APIFIX AI — Source Control Provider Abstraction
 * 
 * Provides unified interface and concrete providers for GitHub, GitLab, and Bitbucket.
 */

const { sanitizeSecrets } = require('./securitySanitizer');

class SourceControlProvider {
  constructor(name) {
    this.name = name;
  }

  async listRepositories(credentials) {
    throw new Error('Not implemented');
  }

  async getBranch(repo, branch, credentials) {
    throw new Error('Not implemented');
  }

  async createBranch(repo, baseBranch, newBranch, credentials) {
    throw new Error('Not implemented');
  }

  async createCommit(repo, branch, message, files, credentials) {
    throw new Error('Not implemented');
  }

  async createPullRequest(repo, { title, body, head, base }, credentials) {
    throw new Error('Not implemented');
  }

  async getDiff(repo, base, head, credentials) {
    throw new Error('Not implemented');
  }

  async postComment(repo, prNumber, commentBody, credentials) {
    throw new Error('Not implemented');
  }

  async setStatusCheck(repo, sha, state, description, credentials) {
    throw new Error('Not implemented');
  }
}

/**
 * GitHub Provider Implementation
 */
class GitHubProvider extends SourceControlProvider {
  constructor() {
    super('GitHub');
  }

  async listRepositories(credentials = {}) {
    return [
      { id: 'gh_repo_1', name: 'api_gateway', fullName: 'acme/api_gateway', defaultBranch: 'main', private: true },
      { id: 'gh_repo_2', name: 'auth_service', fullName: 'acme/auth_service', defaultBranch: 'main', private: true }
    ];
  }

  async getBranch(repo, branch = 'main', credentials = {}) {
    return { name: branch, sha: `commit_sha_${Date.now()}`, protected: branch === 'main' };
  }

  async createBranch(repo, baseBranch, newBranch, credentials = {}) {
    return { name: newBranch, base: baseBranch, sha: `sha_${Date.now()}` };
  }

  async createCommit(repo, branch, message, files = [], credentials = {}) {
    return { sha: `sha_${Date.now()}`, message: sanitizeSecrets(message), filesCount: files.length };
  }

  async createPullRequest(repo, { title, body, head, base = 'main' }, credentials = {}) {
    return {
      id: `pr_${Date.now()}`,
      number: Math.floor(Math.random() * 100) + 1,
      title: sanitizeSecrets(title),
      body: sanitizeSecrets(body),
      head,
      base,
      url: `https://github.com/${repo}/pull/${Math.floor(Math.random() * 100) + 1}`,
      state: 'open'
    };
  }

  async getDiff(repo, base, head, credentials = {}) {
    return '--- a/src/index.js\n+++ b/src/index.js\n@@ -1,3 +1,3 @@\n-const old = 1;\n+const old = 2;';
  }

  async postComment(repo, prNumber, commentBody, credentials = {}) {
    return { id: `comment_${Date.now()}`, prNumber, body: sanitizeSecrets(commentBody) };
  }

  async setStatusCheck(repo, sha, state = 'success', description = 'APIFIX AI Verified', credentials = {}) {
    return { sha, state, description, context: 'apifix/verification' };
  }
}

/**
 * GitLab Provider Implementation
 */
class GitLabProvider extends SourceControlProvider {
  constructor() {
    super('GitLab');
  }

  async listRepositories(credentials = {}) {
    return [
      { id: 'gl_repo_1', name: 'payment_engine', fullName: 'titan/payment_engine', defaultBranch: 'main', private: true }
    ];
  }

  async getBranch(repo, branch = 'main', credentials = {}) {
    return { name: branch, sha: `gl_sha_${Date.now()}`, protected: branch === 'main' };
  }

  async createBranch(repo, baseBranch, newBranch, credentials = {}) {
    return { name: newBranch, base: baseBranch, sha: `gl_sha_${Date.now()}` };
  }

  async createCommit(repo, branch, message, files = [], credentials = {}) {
    return { sha: `gl_sha_${Date.now()}`, message: sanitizeSecrets(message), filesCount: files.length };
  }

  async createPullRequest(repo, { title, body, head, base = 'main' }, credentials = {}) {
    return {
      id: `mr_${Date.now()}`,
      number: Math.floor(Math.random() * 50) + 1,
      title: sanitizeSecrets(title),
      body: sanitizeSecrets(body),
      head,
      base,
      url: `https://gitlab.com/${repo}/-/merge_requests/${Math.floor(Math.random() * 50) + 1}`,
      state: 'opened'
    };
  }

  async getDiff(repo, base, head, credentials = {}) {
    return '--- a/src/server.js\n+++ b/src/server.js\n@@ -10,3 +10,3 @@\n-null;\n+safeCheck;';
  }

  async postComment(repo, prNumber, commentBody, credentials = {}) {
    return { id: `gl_note_${Date.now()}`, prNumber, body: sanitizeSecrets(commentBody) };
  }

  async setStatusCheck(repo, sha, state = 'success', description = 'APIFIX AI Verified', credentials = {}) {
    return { sha, state, description, context: 'apifix/pipeline' };
  }
}

/**
 * Bitbucket Provider Implementation
 */
class BitbucketProvider extends SourceControlProvider {
  constructor() {
    super('Bitbucket');
  }

  async listRepositories(credentials = {}) {
    return [
      { id: 'bb_repo_1', name: 'billing_api', fullName: 'acme/billing_api', defaultBranch: 'master', private: true }
    ];
  }

  async getBranch(repo, branch = 'master', credentials = {}) {
    return { name: branch, sha: `bb_sha_${Date.now()}`, protected: branch === 'master' };
  }

  async createBranch(repo, baseBranch, newBranch, credentials = {}) {
    return { name: newBranch, base: baseBranch, sha: `bb_sha_${Date.now()}` };
  }

  async createCommit(repo, branch, message, files = [], credentials = {}) {
    return { sha: `bb_sha_${Date.now()}`, message: sanitizeSecrets(message), filesCount: files.length };
  }

  async createPullRequest(repo, { title, body, head, base = 'master' }, credentials = {}) {
    return {
      id: `bb_pr_${Date.now()}`,
      number: Math.floor(Math.random() * 20) + 1,
      title: sanitizeSecrets(title),
      body: sanitizeSecrets(body),
      head,
      base,
      url: `https://bitbucket.org/${repo}/pull-requests/${Math.floor(Math.random() * 20) + 1}`,
      state: 'OPEN'
    };
  }

  async getDiff(repo, base, head, credentials = {}) {
    return '--- a/lib/app.js\n+++ b/lib/app.js';
  }

  async postComment(repo, prNumber, commentBody, credentials = {}) {
    return { id: `bb_comment_${Date.now()}`, prNumber, body: sanitizeSecrets(commentBody) };
  }

  async setStatusCheck(repo, sha, state = 'SUCCESSFUL', description = 'APIFIX AI Verified', credentials = {}) {
    return { sha, state, description, context: 'apifix/build' };
  }
}

function getSourceControlProvider(type = 'github') {
  const normalized = String(type).toLowerCase();
  switch (normalized) {
    case 'gitlab':
      return new GitLabProvider();
    case 'bitbucket':
      return new BitbucketProvider();
    case 'github':
    default:
      return new GitHubProvider();
  }
}

module.exports = {
  SourceControlProvider,
  GitHubProvider,
  GitLabProvider,
  BitbucketProvider,
  getSourceControlProvider
};
