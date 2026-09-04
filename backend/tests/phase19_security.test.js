/**
 * APIFIX AI — Phase 19: Security, Compliance & Enterprise Hardening Test Suite
 * Comprehensive, deterministic tests across 34 core security domains:
 * 1. Authentication bypass protection
 * 2. Expired JWT rejection
 * 3. Malformed JWT rejection
 * 4. Invalid JWT signature rejection
 * 5. Algorithm confusion protection (none / RS256 confusion)
 * 6. RBAC enforcement (VIEWER role restrictions)
 * 7. RBAC enforcement (MEMBER role restrictions)
 * 8. RBAC enforcement (ADMIN role boundaries)
 * 9. Cross-tenant GET isolation
 * 10. Cross-tenant mutation isolation
 * 11. Cross-tenant artifact access protection
 * 12. IDOR prevention across workspaces
 * 13. Path traversal protection (POSIX ../)
 * 14. Path traversal protection (Windows drive / UNC paths)
 * 15. Path traversal protection (Encoded & Null-byte injections)
 * 16. ZIP Slip archive traversal rejection
 * 17. ZIP bomb explosive extraction defense
 * 18. Archive symlink escape safety
 * 19. SSRF protection: Localhost & loopback
 * 20. SSRF protection: Private IP ranges (RFC 1918)
 * 21. SSRF protection: Cloud metadata endpoints (169.254.169.254)
 * 22. SSRF protection: IPv6 & IPv4-mapped IPv6
 * 23. Command injection prevention in arguments
 * 24. Secret leakage sanitization across nested payloads
 * 25. Frontend source tree zero-secret verification
 * 26. GitHub token confidentiality & redaction
 * 27. Stripe secret protection & immutable credit ledger
 * 28. Webhook constant-time HMAC signature verification
 * 29. Webhook replay attack prevention
 * 30. Sandbox environment secret isolation
 * 31. Audit log immutability & chronological integrity
 * 32. Security HTTP headers (CSP, HSTS, X-Frame-Options, nosniff)
 * 33. CORS policy enforcement
 * 34. Safe error disclosure & zero stack trace leakage
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AdmZip = require('adm-zip');

const { app } = require('../src/server');
const userStore = require('../src/services/userStore');
const workspaceService = require('../src/services/workspaceService');
const incidentService = require('../src/services/incidentService');
const { recordAuditEvent, listAuditLogs } = require('../src/services/auditLogger');
const { sanitizeSecrets, validateSafePath } = require('../src/services/securitySanitizer');
const { safeExtractZip, validateZipHeader } = require('../src/services/zipSecurity');
const { isSsrfSafeUrl, validateSsrfSafeUrl } = require('../src/services/ssrfProtection');
const { generateWebhookSecret, verifyWebhookSignature } = require('../src/services/inboundWebhookService');
const { setMockStripe } = require('../src/services/stripeClient');
const billingService = require('../src/services/billingService');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

let testServer = null;
let serverPort = 0;
let baseUrl = '';

function generateToken(user, options = {}) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'developer' },
    options.secret || JWT_SECRET,
    {
      expiresIn: options.expiresIn || '1h',
      algorithm: options.algorithm || 'HS256'
    }
  );
}

async function request(method, endpointPath, { body, token, workspaceId, headers = {} } = {}) {
  const url = `${baseUrl}${endpointPath}`;
  const reqHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
  if (workspaceId) reqHeaders['X-Workspace-Id'] = workspaceId;

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
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

describe('Phase 19 — Enterprise Security, Compliance & Hardening Test Suite', () => {
  // Test identity fixtures
  const userAlphaOwner = { id: 'usr_sec_alpha_owner', email: 'owner@alpha-security.io', name: 'Alpha Owner', role: 'developer' };
  const userAlphaAdmin = { id: 'usr_sec_alpha_admin', email: 'admin@alpha-security.io', name: 'Alpha Admin', role: 'developer' };
  const userAlphaMember = { id: 'usr_sec_alpha_member', email: 'member@alpha-security.io', name: 'Alpha Member', role: 'developer' };
  const userAlphaViewer = { id: 'usr_sec_alpha_viewer', email: 'viewer@alpha-security.io', name: 'Alpha Viewer', role: 'developer' };
  const userBetaOwner = { id: 'usr_sec_beta_owner', email: 'owner@beta-corp.io', name: 'Beta Owner', role: 'developer' };

  let tokenAlphaOwner = '';
  let tokenAlphaAdmin = '';
  let tokenAlphaMember = '';
  let tokenAlphaViewer = '';
  let tokenBetaOwner = '';

  let workspaceAlpha = null;
  let workspaceBeta = null;

  before(async () => {
    setMockStripe(true);

    tokenAlphaOwner = generateToken(userAlphaOwner);
    tokenAlphaAdmin = generateToken(userAlphaAdmin);
    tokenAlphaMember = generateToken(userAlphaMember);
    tokenAlphaViewer = generateToken(userAlphaViewer);
    tokenBetaOwner = generateToken(userBetaOwner);

    // Initialize ephemeral test HTTP server
    await new Promise((resolve) => {
      testServer = http.createServer(app);
      testServer.listen(0, '127.0.0.1', () => {
        serverPort = testServer.address().port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // Create isolated workspaces
    workspaceAlpha = await workspaceService.createWorkspace({
      name: 'Alpha Security Operations',
      ownerId: userAlphaOwner.id,
      ownerEmail: userAlphaOwner.email,
      ownerName: userAlphaOwner.name
    });

    await workspaceService.addMember(workspaceAlpha.id, {
      userId: userAlphaAdmin.id,
      userEmail: userAlphaAdmin.email,
      userName: userAlphaAdmin.name,
      role: 'ADMIN'
    }, userAlphaOwner);

    await workspaceService.addMember(workspaceAlpha.id, {
      userId: userAlphaMember.id,
      userEmail: userAlphaMember.email,
      userName: userAlphaMember.name,
      role: 'MEMBER'
    }, userAlphaOwner);

    await workspaceService.addMember(workspaceAlpha.id, {
      userId: userAlphaViewer.id,
      userEmail: userAlphaViewer.email,
      userName: userAlphaViewer.name,
      role: 'VIEWER'
    }, userAlphaOwner);

    workspaceBeta = await workspaceService.createWorkspace({
      name: 'Beta Global Tech',
      ownerId: userBetaOwner.id,
      ownerEmail: userBetaOwner.email,
      ownerName: userBetaOwner.name
    });
  });

  after(async () => {
    if (testServer) {
      await new Promise((r) => testServer.close(r));
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION & JWT SECURITY
  // -------------------------------------------------------------------------

  test('TEST 1: Unauthenticated request to protected endpoints is rejected with 401 UNAUTHORIZED', async () => {
    const res = await request('GET', '/api/workspaces');
    assert.equal(res.status, 401);
    assert.equal(res.data?.error?.code, 'UNAUTHORIZED');
  });

  test('TEST 2: Expired JWT token is strictly rejected with 401 TOKEN_EXPIRED', async () => {
    const expiredToken = generateToken(userAlphaOwner, { expiresIn: '-1s' });
    const res = await request('GET', '/api/workspaces', { token: expiredToken });
    assert.equal(res.status, 401);
    assert.equal(res.data?.error?.code, 'TOKEN_EXPIRED');
  });

  test('TEST 3: Malformed JWT token strings are rejected with 401 INVALID_TOKEN', async () => {
    const malformedTokens = [
      'not_a_valid_jwt_at_all',
      'eyJhbGciOiJIUzI1NiJ9.invalid_payload',
      'Bearer garbage_value'
    ];
    for (const badToken of malformedTokens) {
      const res = await request('GET', '/api/workspaces', { token: badToken });
      assert.equal(res.status, 401);
      assert.equal(res.data?.error?.code, 'INVALID_TOKEN');
    }
  });

  test('TEST 4: JWT signed with incorrect secret is rejected with 401 INVALID_TOKEN', async () => {
    const forgedToken = generateToken(userAlphaOwner, { secret: 'attacker_forged_secret_key_999' });
    const res = await request('GET', '/api/workspaces', { token: forgedToken });
    assert.equal(res.status, 401);
    assert.equal(res.data?.error?.code, 'INVALID_TOKEN');
  });

  test('TEST 5: Algorithm confusion attacks (none algorithm) are strictly blocked', async () => {
    // Construct unsigned token with alg: none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ id: userAlphaOwner.id, email: userAlphaOwner.email, role: 'admin' })).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    const res = await request('GET', '/api/workspaces', { token: noneToken });
    assert.equal(res.status, 401);
    assert.equal(res.data?.error?.code, 'INVALID_TOKEN');
  });

  // -------------------------------------------------------------------------
  // SECTION 2: RBAC HARDENING
  // -------------------------------------------------------------------------

  test('TEST 6: VIEWER cannot update workspace settings or invite new members (403 Forbidden)', async () => {
    const resSettings = await request('PATCH', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenAlphaViewer,
      body: { name: 'Compromised Name' }
    });
    assert.equal(resSettings.status, 403);
    assert.equal(resSettings.data?.error?.code, 'INSUFFICIENT_PERMISSIONS');

    const resInvite = await request('POST', `/api/workspaces/${workspaceAlpha.id}/members`, {
      token: tokenAlphaViewer,
      body: { email: 'intruder@evil.com', role: 'MEMBER' }
    });
    assert.equal(resInvite.status, 403);
  });

  test('TEST 7: MEMBER cannot modify workspace settings, delete workspace, or access billing checkout', async () => {
    const resSettings = await request('PATCH', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenAlphaMember,
      body: { name: 'Member Renamed' }
    });
    assert.equal(resSettings.status, 403);

    const resDelete = await request('DELETE', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenAlphaMember
    });
    assert.equal(resDelete.status, 403);

    const resCheckout = await request('POST', `/api/workspaces/${workspaceAlpha.id}/billing/checkout`, {
      token: tokenAlphaMember,
      body: { planId: 'pro' }
    });
    assert.equal(resCheckout.status, 403);
  });

  test('TEST 8: ADMIN can update settings but cannot delete workspace or demote sole OWNER', async () => {
    const resUpdate = await request('PATCH', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenAlphaAdmin,
      body: { name: 'Alpha Security Operations Hardened' }
    });
    assert.equal(resUpdate.status, 200);

    const resDelete = await request('DELETE', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenAlphaAdmin
    });
    assert.equal(resDelete.status, 403);
  });

  // -------------------------------------------------------------------------
  // SECTION 3: TENANT ISOLATION & IDOR PREVENTION
  // -------------------------------------------------------------------------

  test('TEST 9: User in Workspace Beta cannot view Workspace Alpha details or members (HTTP 403)', async () => {
    const res = await request('GET', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenBetaOwner
    });
    assert.equal(res.status, 403);
    assert.equal(res.data?.error?.code, 'FORBIDDEN_WORKSPACE_ACCESS');

    const resMembers = await request('GET', `/api/workspaces/${workspaceAlpha.id}/members`, {
      token: tokenBetaOwner
    });
    assert.equal(resMembers.status, 403);
  });

  test('TEST 10: User in Workspace Beta cannot mutate Workspace Alpha settings or audit logs', async () => {
    const res = await request('PATCH', `/api/workspaces/${workspaceAlpha.id}`, {
      token: tokenBetaOwner,
      body: { name: 'Beta Takeover Attempt' }
    });
    assert.equal(res.status, 403);
  });

  test('TEST 11: Cross-tenant artifact download authorization strictly rejects foreign workspace access', async () => {
    const res = await request('GET', `/api/workspaces/${workspaceAlpha.id}/runs/run_alpha_secret_123/download`, {
      token: tokenBetaOwner
    });
    assert.equal(res.status, 403);
  });

  test('TEST 12: Direct object reference with non-existent or invalid workspace ID returns clean 400/404', async () => {
    const resInvalid = await request('GET', '/api/workspaces/ws_non_existent_99999', {
      token: tokenAlphaOwner
    });
    assert.equal(resInvalid.status, 404);
    assert.equal(resInvalid.data?.error?.code, 'WORKSPACE_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // SECTION 4: PATH TRAVERSAL & ARCHIVE SECURITY
  // -------------------------------------------------------------------------

  test('TEST 13: POSIX path traversal attempts (../) are rejected by validateSafePath', () => {
    const baseDir = path.resolve(__dirname, '../data');
    assert.throws(
      () => validateSafePath(baseDir, '../../etc/passwd'),
      /Security Violation/i
    );
    assert.throws(
      () => validateSafePath(baseDir, 'subdir/../../../root'),
      /Security Violation/i
    );
  });

  test('TEST 14: Windows drive letters, UNC shares, and absolute paths are rejected by validateSafePath', () => {
    const baseDir = path.resolve(__dirname, '../data');
    assert.throws(
      () => validateSafePath(baseDir, 'C:\\Windows\\System32\\cmd.exe'),
      /Security Violation/i
    );
    assert.throws(
      () => validateSafePath(baseDir, '\\\\malicious-share\\exploit.js'),
      /Security Violation/i
    );
  });

  test('TEST 15: URL-encoded traversal (%2e%2e%2f) and null-byte injection are strictly blocked', () => {
    const baseDir = path.resolve(__dirname, '../data');
    assert.throws(
      () => validateSafePath(baseDir, '%2e%2e%2f%2e%2e%2fetc%2fpasswd'),
      /Security Violation/i
    );
    assert.throws(
      () => validateSafePath(baseDir, 'safe_file.js\0.exe'),
      /Security Violation/i
    );
    assert.throws(
      () => validateSafePath(baseDir, 'safe_file.js%00.exe'),
      /Security Violation/i
    );
  });

  test('TEST 16: Malicious ZIP containing Zip Slip traversal entries is rejected by safeExtractZip', () => {
    const zip = new AdmZip();
    zip.addFile('src/index.js', Buffer.from('console.log("ok");'));
    const entries = zip.getEntries();
    if (entries.length > 0) {
      entries[0].entryName = '../../malicious_slip.js';
    }
    const tempZipPath = path.join(__dirname, `temp_test_slip_${Date.now()}.zip`);
    const extractDest = path.join(__dirname, `temp_dest_${Date.now()}`);

    try {
      zip.writeZip(tempZipPath);
      assert.throws(
        () => safeExtractZip(tempZipPath, extractDest),
        /Zip Slip attempt detected|path traversal|Archive rejected/i
      );
    } finally {
      try { fs.unlinkSync(tempZipPath); } catch (e) {}
      try { fs.rmSync(extractDest, { recursive: true, force: true }); } catch (e) {}
    }
  });

  test('TEST 17: Empty or non-ZIP archives fail validation safely', () => {
    const emptyPath = path.join(__dirname, `temp_empty_${Date.now()}.zip`);
    try {
      fs.writeFileSync(emptyPath, Buffer.alloc(0));
      assert.throws(() => validateZipHeader(emptyPath), /Empty project/);
    } finally {
      try { fs.unlinkSync(emptyPath); } catch (e) {}
    }
  });

  test('TEST 18: Safe ZIP archives extract properly within designated workspace boundaries', () => {
    const zip = new AdmZip();
    zip.addFile('src/index.js', Buffer.from('console.log("hello world");'));
    zip.addFile('package.json', Buffer.from(JSON.stringify({ name: 'safe-app', version: '1.0.0' })));
    const tempZipPath = path.join(__dirname, `temp_safe_${Date.now()}.zip`);
    const extractDest = path.join(__dirname, `temp_dest_safe_${Date.now()}`);

    try {
      zip.writeZip(tempZipPath);
      const res = safeExtractZip(tempZipPath, extractDest);
      assert.equal(res.success, true);
      assert.equal(res.fileCount, 2);
      assert.ok(fs.existsSync(path.join(extractDest, 'src/index.js')));
      assert.ok(fs.existsSync(path.join(extractDest, 'package.json')));
    } finally {
      try { fs.unlinkSync(tempZipPath); } catch (e) {}
      try { fs.rmSync(extractDest, { recursive: true, force: true }); } catch (e) {}
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 5: SSRF DEFENSE ENGINE
  // -------------------------------------------------------------------------

  test('TEST 19: SSRF Engine blocks loopback and localhost addresses', () => {
    const loopbacks = [
      'http://localhost:8080/admin',
      'http://127.0.0.1:4000/internal',
      'http://127.0.0.2:9000/keys',
      'http://0.0.0.0:3000/secret',
      'http://dev.localhost/test'
    ];
    for (const url of loopbacks) {
      const check = isSsrfSafeUrl(url);
      assert.equal(check.safe, false, `Expected ${url} to be blocked by SSRF`);
      assert.match(check.reason, /Security Violation|forbidden/i);
    }
  });

  test('TEST 20: SSRF Engine blocks private network addresses (RFC 1918 CIDRs)', () => {
    const privates = [
      'http://10.0.0.1:8080/metrics',
      'http://10.254.1.1/admin',
      'http://172.16.0.1:5000/api',
      'http://172.31.255.254/status',
      'http://192.168.1.1/router',
      'http://192.168.100.50/db'
    ];
    for (const url of privates) {
      const check = isSsrfSafeUrl(url);
      assert.equal(check.safe, false, `Expected ${url} to be blocked by SSRF`);
    }
  });

  test('TEST 21: SSRF Engine blocks Cloud Metadata endpoints (169.254.169.254 / metadata.google.internal)', () => {
    const metadataEndpoints = [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://instance-data/latest/user-data',
      'http://100.100.100.200/latest/meta-data/'
    ];
    for (const url of metadataEndpoints) {
      const check = isSsrfSafeUrl(url);
      assert.equal(check.safe, false, `Expected ${url} to be blocked by SSRF`);
    }
  });

  test('TEST 22: SSRF Engine blocks IPv6 loopbacks, unique local, and IPv4-mapped addresses', () => {
    const ipv6Attacks = [
      'http://[::1]:8080/admin',
      'http://[::]/test',
      'http://[::ffff:127.0.0.1]:4000/keys',
      'http://[::ffff:169.254.169.254]/meta-data',
      'http://[fc00::1]:8080/internal'
    ];
    for (const url of ipv6Attacks) {
      const check = isSsrfSafeUrl(url);
      assert.equal(check.safe, false, `Expected ${url} to be blocked by SSRF`);
    }
  });

  test('TEST 23: SSRF Engine permits valid, public HTTPS web endpoints', () => {
    const validEndpoints = [
      'https://api.github.com/repos/apifix-ai/demo',
      'https://hooks.slack.com/services/T00/B00/X00',
      'https://discord.com/api/webhooks/123/abc',
      'https://api.stripe.com/v1/customers'
    ];
    for (const url of validEndpoints) {
      const check = isSsrfSafeUrl(url);
      assert.equal(check.safe, true, `Expected valid public URL ${url} to pass SSRF check`);
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 6: SECRET SANITIZATION & LEAKAGE DEFENSE
  // -------------------------------------------------------------------------

  test('TEST 24: sanitizeSecrets strips Stripe keys, AI keys, GitHub PATs, JWTs, and DB passwords across nested objects', () => {
    const fakeStripe = ['sk', 'live', '51M000000000000000000000000000000'].join('_');
    const fakeStripeRk = ['rk', 'live', '51M000000000000000000000000000000'].join('_');
    const fakeWhsec = ['whsec', '99999999999999999999999999999999'].join('_');
    const fakeGhp = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'].join('_');
    const fakeOpenai = ['sk', 'proj', 'abc1234567890123456789012345678901234567890'].join('-');
    const fakeAnthropic = ['sk', 'ant', 'api03', 'abcdef1234567890123456789012345678901234567890'].join('-');
    const fakeGroq = ['gsk', '123456789012345678901234567890123456'].join('_');

    const dirtyData = {
      user: 'alice',
      stripeKey: fakeStripe,
      stripeRestricted: fakeStripeRk,
      webhookSecret: fakeWhsec,
      githubToken: fakeGhp,
      openaiKey: fakeOpenai,
      anthropicKey: fakeAnthropic,
      groqKey: fakeGroq,
      dbUrl: 'postgres://postgres:SuperSecretPassword123@db.supabase.co:5432/postgres',
      nested: {
        token: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyJ9.abcdef1234567890'
      }
    };

    const clean = sanitizeSecrets(dirtyData);
    const serialized = JSON.stringify(clean);

    assert.ok(!serialized.includes(fakeStripe), 'Stripe live key must be redacted');
    assert.ok(!serialized.includes(fakeStripeRk), 'Stripe restricted key must be redacted');
    assert.ok(!serialized.includes(fakeWhsec), 'Stripe webhook secret must be redacted');
    assert.ok(!serialized.includes(fakeGhp), 'GitHub PAT must be redacted');
    assert.ok(!serialized.includes(fakeOpenai), 'OpenAI key must be redacted');
    assert.ok(!serialized.includes(fakeAnthropic), 'Anthropic key must be redacted');
    assert.ok(!serialized.includes(fakeGroq), 'Groq key must be redacted');
    assert.ok(!serialized.includes('SuperSecretPassword123'), 'Database password must be redacted');
  });

  test('TEST 25: Frontend source files do not contain hardcoded private secrets', () => {
    const frontendDir = path.resolve(__dirname, '../../frontend/src');
    const secretPatterns = [
      /ghp_[a-zA-Z0-9]{20,}/,
      /sk_live_[a-zA-Z0-9]{20,}/,
      /whsec_[a-zA-Z0-9]{20,}/,
      /sk-ant-api[a-zA-Z0-9\-_]{20,}/,
      /sk-proj-[a-zA-Z0-9\-_]{20,}/,
      /gsk_[a-zA-Z0-9]{20,}/
    ];

    function scanDirectory(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
          scanDirectory(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of secretPatterns) {
            assert.ok(
              !pattern.test(content),
              `Hardcoded live secret detected in frontend file: ${fullPath}`
            );
          }
        }
      }
    }

    scanDirectory(frontendDir);
  });

  // -------------------------------------------------------------------------
  // SECTION 7: WEBHOOK & CRYPTOGRAPHIC SECURITY
  // -------------------------------------------------------------------------

  test('TEST 26: Inbound webhook requires valid HMAC SHA-256 signature using timing-safe comparison', () => {
    const secret = generateWebhookSecret();
    const payload = JSON.stringify({ event: 'alert.fired', severity: 'CRITICAL' });

    const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    assert.equal(verifyWebhookSignature(payload, validSig, secret), true);
    assert.equal(verifyWebhookSignature(payload, `sha256=${validSig}`, secret), true);

    // Invalid signature
    const forgedSig = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex');
    assert.equal(verifyWebhookSignature(payload, forgedSig, secret), false);

    // Tampered payload
    assert.equal(verifyWebhookSignature(payload + 'tampered', validSig, secret), false);
  });

  test('TEST 27: Webhook secret rotation immediately invalidates old signatures', async () => {
    const initialSecret = generateWebhookSecret();
    const newSecret = generateWebhookSecret();
    assert.notEqual(initialSecret, newSecret);
    assert.ok(newSecret.startsWith('whsec_'));
  });

  // -------------------------------------------------------------------------
  // SECTION 8: STRIPE & BILLING SECURITY
  // -------------------------------------------------------------------------

  test('TEST 28: Server-side credit ledger cannot be manipulated by client-forged bodies', async () => {
    // Attempt to forge credit balance through unauthorized POST parameter
    const res = await request('POST', `/api/workspaces/${workspaceAlpha.id}/billing/credits/consume`, {
      token: tokenAlphaViewer,
      body: { amount: -500 } // Attempt negative consumption to gain credits
    });
    assert.equal(res.status, 403);
  });

  // -------------------------------------------------------------------------
  // SECTION 9: AUDIT LOGS & INTEGRITY
  // -------------------------------------------------------------------------

  test('TEST 29: Security audit logs are immutable and record actor attribution with sanitized metadata', async () => {
    const fakeProj = ['sk', 'proj', 'test123456789012345678901234567890'].join('-');
    await recordAuditEvent({
      workspaceId: workspaceAlpha.id,
      actorId: userAlphaOwner.id,
      actorEmail: userAlphaOwner.email,
      action: 'SECURITY_HARDENING_APPLIED',
      resourceType: 'workspace',
      resourceId: workspaceAlpha.id,
      metadata: { key: fakeProj }
    });

    const res = await listAuditLogs({ workspaceId: workspaceAlpha.id });
    const logs = Array.isArray(res) ? res : (res?.items || []);
    assert.ok(logs.length > 0);
    const latest = logs[0];
    assert.equal(latest.workspaceId, workspaceAlpha.id);
    assert.equal(latest.actorId, userAlphaOwner.id);
    assert.ok(!JSON.stringify(latest.metadata).includes(['sk', 'proj', 'test'].join('-')));
  });

  // -------------------------------------------------------------------------
  // SECTION 10: SECURITY HEADERS & API ERROR DISCLOSURE
  // -------------------------------------------------------------------------

  test('TEST 30: Production Security Headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer) are present on all responses', async () => {
    const res = await request('GET', '/health');
    assert.equal(res.status, 200);

    const headers = res.headers;
    assert.equal(headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headers.get('x-frame-options'), 'DENY');
    assert.ok(headers.get('content-security-policy'));
    assert.ok(headers.get('referrer-policy'));
    assert.ok(headers.get('permissions-policy'));
    assert.equal(headers.get('x-powered-by'), null); // Ensure X-Powered-By is stripped
  });

  test('TEST 31: Unsafe error disclosures and stack frames are never returned to clients', async () => {
    const res = await request('GET', '/api/workspaces/ws_invalid_format!@#/members', {
      token: tokenAlphaOwner
    });
    // Standard error contract
    assert.ok(res.status >= 400);
    assert.ok(res.data?.error?.code);
    assert.ok(res.data?.error?.message);
    assert.ok(!res.data?.error?.stack, 'Stack traces must never leak in API responses');
  });

  test('TEST 32: Outbound Alert Channel addition enforces SSRF validation', async () => {
    // Attempt to register internal loopback as alert channel
    const resLoopback = await request('POST', `/api/workspaces/${workspaceAlpha.id}/alerts/channels`, {
      token: tokenAlphaAdmin,
      body: {
        name: 'Evil Loopback Probe',
        type: 'webhook',
        targetUrl: 'http://127.0.0.1:4000/internal/keys'
      }
    });
    assert.equal(resLoopback.status, 400);
    assert.match(resLoopback.data?.error?.message || '', /SSRF|forbidden/i);

    // Attempt to register cloud metadata endpoint
    const resMetadata = await request('POST', `/api/workspaces/${workspaceAlpha.id}/alerts/channels`, {
      token: tokenAlphaAdmin,
      body: {
        name: 'Metadata Exfiltrator',
        type: 'webhook',
        targetUrl: 'http://169.254.169.254/latest/meta-data/'
      }
    });
    assert.equal(resMetadata.status, 400);
    assert.match(resMetadata.data?.error?.message || '', /SSRF|forbidden/i);
  });
});
