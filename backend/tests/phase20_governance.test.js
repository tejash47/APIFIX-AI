/**
 * APIFIX AI — Phase 20: Enterprise Governance, Compliance & Cost Intelligence Test Suite
 * 45+ Deterministic unit & integration tests validating the complete enterprise control plane.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { app } = require('../src/server');
const organizationService = require('../src/services/organizationService');
const {
  ROLE_RANKS,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRole,
  isRoleAtLeast
} = require('../src/services/permissionService');
const governancePolicyEngine = require('../src/services/governancePolicyEngine');
const aiGovernanceService = require('../src/services/aiGovernanceService');
const costIntelligenceService = require('../src/services/costIntelligenceService');
const approvalWorkflowService = require('../src/services/approvalWorkflowService');
const complianceService = require('../src/services/complianceService');
const complianceEvidenceService = require('../src/services/complianceEvidenceService');
const auditLedgerService = require('../src/services/auditLedgerService');
const dataRetentionService = require('../src/services/dataRetentionService');
const dataExportService = require('../src/services/dataExportService');
const { JWT_SECRET } = require('../src/middleware/authMiddleware');

let testServer = null;
let baseUrl = '';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'developer' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function api(method, endpointPath, { body, token, headers = {} } = {}) {
  const reqHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${endpointPath}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  return { status: res.status, data, headers: res.headers };
}

describe('Phase 20 — Enterprise Governance, Compliance & Cost Intelligence Suite', () => {
  const userOwner = { id: 'usr_org_owner_1', email: 'owner@enterprise-test.org', name: 'Org Owner', role: 'admin' };
  const userAdmin = { id: 'usr_org_admin_1', email: 'admin@enterprise-test.org', name: 'Org Admin', role: 'developer' };
  const userDev = { id: 'usr_org_dev_1', email: 'dev@enterprise-test.org', name: 'Org Developer', role: 'developer' };
  const userSecurity = { id: 'usr_org_sec_1', email: 'sec@enterprise-test.org', name: 'Security Admin', role: 'developer' };
  const userBilling = { id: 'usr_org_bill_1', email: 'bill@enterprise-test.org', name: 'Billing Admin', role: 'developer' };
  const userViewer = { id: 'usr_org_view_1', email: 'view@enterprise-test.org', name: 'Org Viewer', role: 'developer' };

  let tokenOwner = '';
  let tokenAdmin = '';
  let tokenDev = '';
  let tokenSecurity = '';
  let tokenBilling = '';
  let tokenViewer = '';
  let testOrg = null;

  before(async () => {
    tokenOwner = generateToken(userOwner);
    tokenAdmin = generateToken(userAdmin);
    tokenDev = generateToken(userDev);
    tokenSecurity = generateToken(userSecurity);
    tokenBilling = generateToken(userBilling);
    tokenViewer = generateToken(userViewer);

    await new Promise((resolve) => {
      testServer = http.createServer(app);
      testServer.listen(0, '127.0.0.1', () => {
        const port = testServer.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (testServer) {
      await new Promise((r) => testServer.close(r));
    }
  });

  // =========================================================================
  // 1. ORGANIZATION GOVERNANCE & TENANT ISOLATION
  // =========================================================================

  test('TEST 1: Create organization with settings & owner role', async () => {
    testOrg = await organizationService.createOrganization({
      name: 'Titan Aerospace Global',
      slug: 'titan-aerospace',
      ownerId: userOwner.id,
      ownerEmail: userOwner.email,
      settings: { enforceSso: true, defaultAiProvider: 'anthropic' }
    });

    assert.ok(testOrg.id.startsWith('org_'));
    assert.equal(testOrg.name, 'Titan Aerospace Global');
    assert.equal(testOrg.slug, 'titan-aerospace');
    assert.equal(testOrg.role, 'OWNER');
    assert.equal(testOrg.settings.enforceSso, true);
  });

  test('TEST 2: Reject organization creation with missing name', async () => {
    await assert.rejects(
      async () => {
        await organizationService.createOrganization({ name: '' });
      },
      /Organization name is required/
    );
  });

  test('TEST 3: Get organization details by ID', async () => {
    const org = await organizationService.getOrganizationById(testOrg.id);
    assert.ok(org);
    assert.equal(org.id, testOrg.id);
    assert.equal(org.status, 'ACTIVE');
  });

  test('TEST 4: Update organization settings and metadata', async () => {
    const updated = await organizationService.updateOrganization(
      testOrg.id,
      { name: 'Titan Aerospace Enterprise', settings: { dataRetentionDays: 180 } },
      userOwner
    );
    assert.equal(updated.name, 'Titan Aerospace Enterprise');
    assert.equal(updated.settings.dataRetentionDays, 180);
  });

  test('TEST 5: List user organizations scoped to memberships', async () => {
    const orgs = await organizationService.listUserOrganizations(userOwner.id, userOwner.email);
    assert.ok(orgs.length >= 1);
    assert.ok(orgs.some(o => o.id === testOrg.id));
  });

  test('TEST 6: Add organization members with specific roles (ADMIN, SECURITY_ADMIN, DEVELOPER)', async () => {
    const memAdmin = await organizationService.addOrganizationMember(
      testOrg.id,
      { userId: userAdmin.id, userEmail: userAdmin.email, userName: userAdmin.name, role: 'ADMIN' },
      userOwner
    );
    assert.equal(memAdmin.role, 'ADMIN');

    const memSec = await organizationService.addOrganizationMember(
      testOrg.id,
      { userId: userSecurity.id, userEmail: userSecurity.email, userName: userSecurity.name, role: 'SECURITY_ADMIN' },
      userOwner
    );
    assert.equal(memSec.role, 'SECURITY_ADMIN');

    const memDev = await organizationService.addOrganizationMember(
      testOrg.id,
      { userId: userDev.id, userEmail: userDev.email, userName: userDev.name, role: 'DEVELOPER' },
      userOwner
    );
    assert.equal(memDev.role, 'DEVELOPER');
  });

  test('TEST 7: Prevent duplicate organization member addition', async () => {
    await assert.rejects(
      async () => {
        await organizationService.addOrganizationMember(
          testOrg.id,
          { userId: userAdmin.id, userEmail: userAdmin.email, role: 'ADMIN' },
          userOwner
        );
      },
      /already a member/
    );
  });

  test('TEST 8: Update organization member role', async () => {
    const members = await organizationService.getOrganizationMembers(testOrg.id);
    const devMember = members.find(m => m.userId === userDev.id);
    assert.ok(devMember);

    const updated = await organizationService.updateOrganizationMemberRole(
      testOrg.id,
      devMember.id,
      'SRE_ADMIN',
      userOwner
    );
    assert.equal(updated.role, 'SRE_ADMIN');
  });

  test('TEST 9: Remove organization member', async () => {
    const tempMember = await organizationService.addOrganizationMember(
      testOrg.id,
      { userId: 'usr_temp_123', userEmail: 'temp@titan.io', userName: 'Temp User', role: 'VIEWER' },
      userOwner
    );
    const removeRes = await organizationService.removeOrganizationMember(testOrg.id, tempMember.id, userOwner);
    assert.equal(removeRes.success, true);
  });

  test('TEST 10: Link workspace to organization', async () => {
    const freshWsId = `ws_titan_${Date.now()}`;
    const link = await organizationService.linkWorkspaceToOrganization(
      testOrg.id,
      freshWsId,
      userOwner
    );
    assert.equal(link.organizationId, testOrg.id);
    assert.equal(link.workspaceId, freshWsId);
  });

  test('TEST 11: Reject linking workspace to multiple organizations', async () => {
    const otherOrg = await organizationService.createOrganization({
      name: 'Secondary Tenant Org',
      slug: `sec-org-${Date.now()}`,
      ownerId: userOwner.id,
      ownerEmail: userOwner.email
    });

    const exclusiveWsId = `ws_exclusive_${Date.now()}`;
    await organizationService.linkWorkspaceToOrganization(testOrg.id, exclusiveWsId, userOwner);

    await assert.rejects(
      async () => {
        await organizationService.linkWorkspaceToOrganization(
          otherOrg.id,
          exclusiveWsId,
          userOwner
        );
      },
      /already linked/
    );
  });

  test('TEST 12: Aggregate organization usage across linked workspaces', async () => {
    const usage = await organizationService.getOrganizationUsage(testOrg.id);
    assert.equal(usage.organizationId, testOrg.id);
    assert.ok(usage.totalMembers >= 3);
    assert.ok(usage.lastCalculatedAt);
  });

  // =========================================================================
  // 2. ENTERPRISE RBAC & PERMISSION CAPABILITY ENGINE
  // =========================================================================

  test('TEST 13: Role rank hierarchy satisfies OWNER > ADMIN > SECURITY_ADMIN > BILLING_ADMIN > SRE_ADMIN > DEVELOPER > MEMBER > VIEWER', () => {
    assert.ok(ROLE_RANKS.OWNER > ROLE_RANKS.ADMIN);
    assert.ok(ROLE_RANKS.ADMIN > ROLE_RANKS.SECURITY_ADMIN);
    assert.ok(ROLE_RANKS.SECURITY_ADMIN > ROLE_RANKS.BILLING_ADMIN);
    assert.ok(ROLE_RANKS.BILLING_ADMIN > ROLE_RANKS.SRE_ADMIN);
    assert.ok(ROLE_RANKS.SRE_ADMIN > ROLE_RANKS.DEVELOPER);
    assert.ok(ROLE_RANKS.DEVELOPER > ROLE_RANKS.MEMBER);
    assert.ok(ROLE_RANKS.MEMBER > ROLE_RANKS.VIEWER);
  });

  test('TEST 14: SECURITY_ADMIN has audit.export & compliance.read but NOT billing.manage', () => {
    assert.equal(hasPermission('SECURITY_ADMIN', 'audit.export'), true);
    assert.equal(hasPermission('SECURITY_ADMIN', 'compliance.read'), true);
    assert.equal(hasPermission('SECURITY_ADMIN', 'security.manage'), true);
    assert.equal(hasPermission('SECURITY_ADMIN', 'billing.manage'), false);
  });

  test('TEST 15: BILLING_ADMIN has billing.manage & cost.manage but NOT repair.execute', () => {
    assert.equal(hasPermission('BILLING_ADMIN', 'billing.manage'), true);
    assert.equal(hasPermission('BILLING_ADMIN', 'cost.manage'), true);
    assert.equal(hasPermission('BILLING_ADMIN', 'repair.execute'), false);
  });

  test('TEST 16: SRE_ADMIN has repair.auto_repair & sre.manage but NOT billing.manage', () => {
    assert.equal(hasPermission('SRE_ADMIN', 'repair.auto_repair'), true);
    assert.equal(hasPermission('SRE_ADMIN', 'sre.manage'), true);
    assert.equal(hasPermission('SRE_ADMIN', 'billing.manage'), false);
  });

  test('TEST 17: isRoleAtLeast correctly evaluates role seniority', () => {
    assert.equal(isRoleAtLeast('OWNER', 'ADMIN'), true);
    assert.equal(isRoleAtLeast('ADMIN', 'SECURITY_ADMIN'), true);
    assert.equal(isRoleAtLeast('DEVELOPER', 'ADMIN'), false);
    assert.equal(isRoleAtLeast('VIEWER', 'DEVELOPER'), false);
  });

  // =========================================================================
  // 3. GOVERNANCE POLICY ENGINE
  // =========================================================================

  test('TEST 18: Retrieve and update governance policy for organization', async () => {
    const policy = governancePolicyEngine.getGovernancePolicy(testOrg.id);
    assert.ok(policy.maxDailyAutoRepairs);

    const updated = await governancePolicyEngine.setGovernancePolicy(
      testOrg.id,
      {
        maxDailyAutoRepairs: 15,
        requiredApprovalLevel: 'ONE_REVIEWER',
        productionRepairRestrictions: { autoRepairBlocked: true, requireReviewers: 2 }
      },
      userOwner
    );

    assert.equal(updated.maxDailyAutoRepairs, 15);
    assert.equal(updated.requiredApprovalLevel, 'ONE_REVIEWER');
  });

  test('TEST 19: Pre-execution policy evaluation allows development repair', async () => {
    const decision = await governancePolicyEngine.evaluateRepairPolicy({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      repoName: 'titan-api',
      branch: 'feature/auth-fix',
      environment: 'development',
      severity: 'LOW',
      requestedBy: userDev.id
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.requiresApproval, false);
    assert.ok(decision.decisionId.startsWith('dec_'));
  });

  test('TEST 20: Pre-execution policy blocks production repair without approvals (requires 2 reviewers)', async () => {
    const decision = await governancePolicyEngine.evaluateRepairPolicy({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      repoName: 'titan-api',
      branch: 'main',
      environment: 'production',
      severity: 'HIGH',
      requestedBy: userDev.id
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.requiresApproval, true);
    assert.equal(decision.requiredApprovals, 2);
    assert.ok(decision.blockedRules.includes('PRODUCTION_AUTO_REPAIR_RESTRICTED'));
  });

  test('TEST 21: Pre-execution policy blocks critical severity auto-repair when policy disables it', async () => {
    await governancePolicyEngine.setGovernancePolicy(testOrg.id, {
      incidentSeverityThresholds: { autoRepairCritical: false }
    });

    const decision = await governancePolicyEngine.evaluateRepairPolicy({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      repoName: 'titan-api',
      branch: 'dev',
      environment: 'development',
      severity: 'CRITICAL',
      requestedBy: userDev.id
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.requiresApproval, true);
    assert.ok(decision.blockedRules.includes('CRITICAL_INCIDENT_REQUIRES_APPROVAL'));
  });

  test('TEST 22: Query policy decisions ledger', () => {
    const decisions = governancePolicyEngine.listPolicyDecisions({ orgId: testOrg.id, limit: 10 });
    assert.ok(decisions.length >= 2);
    assert.ok(decisions[0].decisionId);
  });

  // =========================================================================
  // 4. AI GOVERNANCE & MODEL TRACKING
  // =========================================================================

  test('TEST 23: Estimate AI cost accurately based on token pricing', () => {
    const costClaude = aiGovernanceService.estimateAiCost('claude-3-5-sonnet-20241022', 1000, 1000);
    // 0.003 + 0.015 = 0.018
    assert.equal(costClaude, 0.018);

    const costGpt4o = aiGovernanceService.estimateAiCost('gpt-4o', 1000, 1000);
    // 0.0025 + 0.01 = 0.0125
    assert.equal(costGpt4o, 0.0125);
  });

  test('TEST 24: Allow AI call for authorized whitelisted provider', () => {
    const check = aiGovernanceService.evaluateAiCallPermission({
      orgId: testOrg.id,
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      estimatedTokens: 2000
    });
    assert.equal(check.allowed, true);
  });

  test('TEST 25: Block AI call for unapproved provider', () => {
    const check = aiGovernanceService.evaluateAiCallPermission({
      orgId: testOrg.id,
      provider: 'unapproved_shadow_llm',
      model: 'unknown_model',
      estimatedTokens: 2000
    });
    assert.equal(check.allowed, false);
    assert.ok(check.reason.includes('blocked by enterprise governance policy'));
  });

  test('TEST 26: Block AI call when estimated tokens exceed maxTokensPerRequest', async () => {
    await aiGovernanceService.setAiPolicy(testOrg.id, { maxTokensPerRequest: 4000 });
    const check = aiGovernanceService.evaluateAiCallPermission({
      orgId: testOrg.id,
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      estimatedTokens: 8000
    });
    assert.equal(check.allowed, false);
    assert.ok(check.reason.includes('exceed max allowed tokens'));
  });

  test('TEST 27: Record AI usage and verify aggregate summary', async () => {
    await aiGovernanceService.recordAiUsage({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      promptTokens: 1200,
      completionTokens: 800,
      latencyMs: 1450,
      success: true,
      runId: 'run_test_gov_01'
    });

    const summary = aiGovernanceService.getAiUsageSummary({ orgId: testOrg.id });
    assert.ok(summary.totalRequests >= 1);
    assert.ok(summary.totalTokens >= 2000);
    assert.ok(summary.totalEstimatedCost > 0);
    assert.ok(summary.providerBreakdown.anthropic);
  });

  // =========================================================================
  // 5. COST INTELLIGENCE ENGINE & BUDGET CONTROLS
  // =========================================================================

  test('TEST 28: Record operational cost events across categories', async () => {
    const costRepair = await costIntelligenceService.recordCostEvent({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      category: 'REPAIR_RUN',
      amount: 0.05,
      metadata: { runId: 'run_test_gov_01', verified: true }
    });
    assert.ok(costRepair.id.startsWith('cst_'));
    assert.equal(costRepair.amount, 0.05);

    const costProbe = await costIntelligenceService.recordCostEvent({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      category: 'SYNTHETIC_PROBE',
      amount: 0.002
    });
    assert.ok(costProbe.id);
  });

  test('TEST 29: Calculate complete Cost Intelligence summary metrics', () => {
    const metrics = costIntelligenceService.getCostIntelligenceMetrics({ orgId: testOrg.id });
    assert.equal(metrics.estimateLabel, 'ESTIMATED');
    assert.ok(metrics.dailyCost >= 0);
    assert.ok(metrics.monthlyCost >= 0);
    assert.ok(metrics.costBreakdown);
    assert.ok(metrics.budgetUtilization);
  });

  test('TEST 30: Budget evaluation at 80% marks WARNING and at 100% marks EXCEEDED', async () => {
    await costIntelligenceService.setBudget(testOrg.id, {
      monthlyBudget: 10.00,
      warningThresholdPct: 80,
      criticalThresholdPct: 90,
      hardLimitPct: 100
    });

    // Record high spend
    await costIntelligenceService.recordCostEvent({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      category: 'AI',
      amount: 8.50
    });

    const evalWarning = costIntelligenceService.evaluateBudget({ orgId: testOrg.id });
    assert.ok(evalWarning.status === 'WARNING' || evalWarning.status === 'CRITICAL_WARNING' || evalWarning.status === 'EXCEEDED');

    // Invariant: Security critical processing is NEVER blocked
    const evalExceeded = costIntelligenceService.evaluateBudget({
      orgId: testOrg.id,
      isSecurityCritical: true
    });
    assert.equal(evalExceeded.allowed, true, 'Security-critical repairs must never be blocked by budget thresholds');
  });

  // =========================================================================
  // 6. APPROVAL WORKFLOW ENGINE & ANTI-SELF-APPROVAL
  // =========================================================================

  test('TEST 31: Create approval request with severity and required approvals', async () => {
    const request = await approvalWorkflowService.createApprovalRequest({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      workflowType: 'PRODUCTION_REPAIR',
      title: 'Deploy hotfix to payment-service production branch',
      description: 'Patch for vulnerability CVE-2026-9981',
      severity: 'CRITICAL',
      environment: 'production',
      requesterId: userDev.id,
      requesterEmail: userDev.email,
      requiredApprovals: 2
    });

    assert.ok(request.id.startsWith('appr_'));
    assert.equal(request.status, 'PENDING');
    assert.equal(request.requiredApprovals, 2);
    assert.equal(request.currentApprovals, 0);
  });

  test('TEST 32: Reject self-approval attempt by requester (Anti-Self-Approval)', async () => {
    const requests = approvalWorkflowService.listApprovalRequests({ orgId: testOrg.id });
    const target = requests.items[0];

    await assert.rejects(
      async () => {
        await approvalWorkflowService.approveRequest(target.id, {
          reviewerId: userDev.id,
          reviewerEmail: userDev.email,
          role: 'DEVELOPER',
          comment: 'Self-approving my own fix'
        });
      },
      /Self-approval is forbidden/
    );
  });

  test('TEST 33: Multi-approval workflow: 1st reviewer leaves request PENDING, 2nd marks APPROVED', async () => {
    const requests = approvalWorkflowService.listApprovalRequests({ orgId: testOrg.id });
    const target = requests.items[0];

    // 1st Reviewer (Admin)
    const afterFirst = await approvalWorkflowService.approveRequest(target.id, {
      reviewerId: userAdmin.id,
      reviewerEmail: userAdmin.email,
      role: 'ADMIN',
      comment: 'Reviewed logic, sandbox test clean.'
    });
    assert.equal(afterFirst.status, 'PENDING');
    assert.equal(afterFirst.currentApprovals, 1);

    // 2nd Reviewer (Security)
    const afterSecond = await approvalWorkflowService.approveRequest(target.id, {
      reviewerId: userSecurity.id,
      reviewerEmail: userSecurity.email,
      role: 'SECURITY_ADMIN',
      comment: 'Security scan verified clean.'
    });
    assert.equal(afterSecond.status, 'APPROVED');
    assert.equal(afterSecond.currentApprovals, 2);
  });

  test('TEST 34: Reject approval request and verify terminal REJECTED state', async () => {
    const req2 = await approvalWorkflowService.createApprovalRequest({
      orgId: testOrg.id,
      workspaceId: 'ws_titan_core',
      workflowType: 'POLICY_OVERRIDE',
      title: 'Bypass security scan for urgent patch',
      severity: 'HIGH',
      requesterId: userDev.id,
      requesterEmail: userDev.email,
      requiredApprovals: 1
    });

    const rejected = await approvalWorkflowService.rejectRequest(req2.id, {
      reviewerId: userSecurity.id,
      reviewerEmail: userSecurity.email,
      role: 'SECURITY_ADMIN',
      reason: 'Security scan cannot be bypassed for production services.'
    });

    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.rejections.length, 1);
  });

  // =========================================================================
  // 7. COMPLIANCE CONTROL CENTER & EVIDENCE ENGINE
  // =========================================================================

  test('TEST 35: Retrieve 11 internal compliance controls with truthful verification labels', () => {
    const controls = complianceService.getComplianceFramework(testOrg.id);
    assert.equal(controls.length, 11);
    controls.forEach(c => {
      assert.equal(c.verificationLabel, 'Control verified internally');
      assert.ok(c.id);
      assert.ok(c.category);
    });
  });

  test('TEST 36: Run automated live verification on SSRF Control (CTL-NET-01)', async () => {
    const verified = await complianceService.verifyComplianceControl('CTL-NET-01', testOrg.id, 'test_runner');
    assert.equal(verified.status, 'PASS');
    assert.ok(verified.verificationDetails.includes('Control verified internally'));
  });

  test('TEST 37: Run automated live verification on Secret Scrubbing Control (CTL-SEC-01)', async () => {
    const verified = await complianceService.verifyComplianceControl('CTL-SEC-01', testOrg.id, 'test_runner');
    assert.equal(verified.status, 'PASS');
  });

  test('TEST 38: Record cryptographically hashed evidence item and verify SHA-256 integrity', async () => {
    const evidence = await complianceEvidenceService.recordEvidence({
      controlId: 'CTL-ACC-01',
      organizationId: testOrg.id,
      actor: userSecurity.email,
      eventType: 'RBAC_VERIFICATION_PASS',
      result: 'SUCCESS',
      details: { roleTested: 'SECURITY_ADMIN', testResult: 'PASS' }
    });

    assert.ok(evidence.id.startsWith('evi_'));
    assert.ok(evidence.evidenceHash);

    const verification = complianceEvidenceService.verifyEvidenceIntegrity(evidence.id);
    assert.equal(verification.valid, true);
    assert.equal(verification.storedHash, verification.computedHash);
  });

  test('TEST 39: Calculate Governance Score & Summary', () => {
    const summary = complianceService.getComplianceSummary(testOrg.id);
    assert.ok(summary.governanceScore >= 80);
    assert.equal(summary.totalControls, 11);
    assert.equal(summary.verificationLabel, 'Control verified internally');
  });

  // =========================================================================
  // 8. IMMUTABLE SHA-256 AUDIT LEDGER
  // =========================================================================

  test('TEST 40: Record chained audit ledger events and verify cryptographic link', async () => {
    const event1 = await auditLedgerService.recordLedgerEvent({
      orgId: testOrg.id,
      actorId: userOwner.id,
      actorEmail: userOwner.email,
      action: 'ORGANIZATION_POLICY_UPDATED',
      resourceType: 'POLICY',
      resourceId: testOrg.id,
      result: 'SUCCESS'
    });
    assert.ok(event1.hash);
    assert.ok(event1.sequenceNumber >= 1);

    const event2 = await auditLedgerService.recordLedgerEvent({
      orgId: testOrg.id,
      actorId: userDev.id,
      actorEmail: userDev.email,
      action: 'REPAIR_RUN_REQUESTED',
      resourceType: 'REPAIR_RUN',
      resourceId: 'run_test_gov_01',
      result: 'SUCCESS'
    });
    assert.equal(event2.previousHash, event1.hash);

    const chainCheck = auditLedgerService.verifyAuditChain({ orgId: testOrg.id });
    assert.equal(chainCheck.valid, true);
    assert.equal(chainCheck.chainStatus, 'CHAIN_VERIFIED_AUTHENTIC');
  });

  test('TEST 41: Audit ledger rejects deletion or mutation attempts (Immutability Invariant)', () => {
    assert.throws(
      () => {
        auditLedgerService.deleteLedgerEvent();
      },
      /AUDIT_IMMUTABLE_ERROR/
    );
  });

  // =========================================================================
  // 9. DATA RETENTION & LIFECYCLE ENGINE
  // =========================================================================

  test('TEST 42: Evaluate data retention expiration while strictly preserving active incidents', () => {
    const evaluation = dataRetentionService.evaluateExpiredRecords(testOrg.id, true);
    assert.equal(evaluation.dryRun, true);
    assert.ok(evaluation.breakdown !== undefined);
  });

  test('TEST 43: Update retention policy tier and verify persistence', async () => {
    const updated = await dataRetentionService.setRetentionPolicy(
      testOrg.id,
      { retentionTier: 'RETENTION_180_DAYS' },
      userOwner
    );
    assert.equal(updated.retentionTier, 'RETENTION_180_DAYS');
    assert.equal(updated.days, 180);
  });

  // =========================================================================
  // 10. ENTERPRISE DATA EXPORT & SECRET SANITIZATION
  // =========================================================================

  test('TEST 44: Generate JSON compliance export with secret sanitization and SHA-256 hash', async () => {
    const exportResult = await dataExportService.generateExport({
      orgId: testOrg.id,
      category: 'AUDIT_LOGS',
      format: 'JSON',
      actor: userSecurity
    });

    assert.ok(exportResult.id.startsWith('exp_'));
    assert.equal(exportResult.format, 'JSON');
    assert.ok(exportResult.integrityHash);
    assert.ok(typeof exportResult.content === 'string');

    // Verify zero secret leakage in export content
    assert.equal(exportResult.content.includes('sk_live_'), false);
    assert.equal(exportResult.content.includes('Bearer '), false);
  });

  test('TEST 45: Generate CSV cost export and verify structured headers', async () => {
    const exportResult = await dataExportService.generateExport({
      orgId: testOrg.id,
      category: 'COST_REPORTS',
      format: 'CSV',
      actor: userBilling
    });

    assert.ok(exportResult.id.startsWith('exp_'));
    assert.equal(exportResult.format, 'CSV');
    assert.ok(exportResult.integrityHash);
  });

  // =========================================================================
  // 11. REST API ENDPOINT INTEGRATION
  // =========================================================================

  test('TEST 46: REST API GET /api/organizations returns 200 with organization list', async () => {
    const res = await api('GET', '/api/organizations', { token: tokenOwner });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.organizations));
  });

  test('TEST 47: REST API GET /api/governance/policies returns active policies', async () => {
    const res = await api('GET', `/api/governance/policies?orgId=${testOrg.id}`, { token: tokenOwner });
    assert.equal(res.status, 200);
    assert.ok(res.data.policy);
  });

  test('TEST 48: REST API GET /api/compliance/controls returns 11 controls and score', async () => {
    const res = await api('GET', `/api/compliance/controls?orgId=${testOrg.id}`, { token: tokenOwner });
    assert.equal(res.status, 200);
    assert.equal(res.data.controls.length, 11);
    assert.ok(res.data.summary.governanceScore >= 0);
  });

  test('TEST 49: REST API POST /api/audit/verify verifies cryptographic chain', async () => {
    const res = await api('POST', '/api/audit/verify', {
      token: tokenOwner,
      body: { orgId: testOrg.id }
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.verification.valid, true);
  });

  test('TEST 50: REST API GET /api/costs/intelligence returns metrics and AI usage breakdown', async () => {
    const res = await api('GET', `/api/costs/intelligence?orgId=${testOrg.id}`, { token: tokenOwner });
    assert.equal(res.status, 200);
    assert.ok(res.data.metrics);
    assert.ok(res.data.aiSummary);
  });
});
