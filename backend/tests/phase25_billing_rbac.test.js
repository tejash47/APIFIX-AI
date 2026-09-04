/**
 * APIFIX AI — Phase 25 Billing & RBAC Test Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const permissionService = require('../src/services/permissionService');
const { BILLING_PLANS, isValidPlan } = require('../src/config/billingPlans');
const approvalWorkflowService = require('../src/services/approvalWorkflowService');

describe('Phase 25 — Role-Based Access Control & Commercial Tier Limits', () => {

  const workspaceId = 'ws_rbac_test';

  test('RBAC 1: OWNER role possesses full administrative and approval rights', () => {
    assert.strictEqual(permissionService.hasPermission('OWNER', 'repair.approve'), true);
    assert.strictEqual(permissionService.hasPermission('OWNER', 'billing.manage'), true);
    assert.strictEqual(permissionService.hasPermission('OWNER', 'governance.manage'), true);
  });

  test('RBAC 2: ADMIN role can approve repairs and update policies', () => {
    assert.strictEqual(permissionService.hasPermission('ADMIN', 'repair.approve'), true);
    assert.strictEqual(permissionService.hasPermission('ADMIN', 'policy.manage'), true);
  });

  test('RBAC 3: DEVELOPER role is restricted from high-risk approval actions', () => {
    assert.strictEqual(permissionService.hasPermission('DEVELOPER', 'repair.approve'), false);
    assert.strictEqual(permissionService.hasPermission('DEVELOPER', 'billing.manage'), false);
    assert.strictEqual(permissionService.hasPermission('DEVELOPER', 'repair.execute'), true);
  });

  test('RBAC 4: VIEWER role is strictly read-only', () => {
    assert.strictEqual(permissionService.hasPermission('VIEWER', 'repair.approve'), false);
    assert.strictEqual(permissionService.hasPermission('VIEWER', 'repair.execute'), false);
    assert.strictEqual(permissionService.hasPermission('VIEWER', 'organization.read'), true);
  });

  test('BILLING 1: Pricing plans enforce credit and concurrency limits', () => {
    assert.strictEqual(BILLING_PLANS.free.priceMonthly, 0);
    assert.strictEqual(BILLING_PLANS.free.maxConcurrentRepairs, 1);

    assert.strictEqual(BILLING_PLANS.pro.priceMonthly, 49);
    assert.strictEqual(BILLING_PLANS.pro.maxConcurrentRepairs, 5);

    assert.strictEqual(BILLING_PLANS.enterprise.priceMonthly, 199);
    assert.strictEqual(BILLING_PLANS.enterprise.maxConcurrentRepairs, 10);
  });

  test('BILLING 2: Subscription plan identifiers are validated', () => {
    assert.strictEqual(isValidPlan('free'), true);
    assert.strictEqual(isValidPlan('pro'), true);
    assert.strictEqual(isValidPlan('enterprise'), true);
    assert.strictEqual(isValidPlan('invalid_tier'), false);
  });

  test('APPROVAL 1: Approval request creation and multi-reviewer workflow', async () => {
    const req = await approvalWorkflowService.createApprovalRequest({
      workspaceId,
      title: 'Fix auth crash in production',
      requesterId: 'usr_dev_123',
      requesterEmail: 'dev@company.com'
    });

    assert.ok(req.id.startsWith('appr_'));
    assert.strictEqual(req.status, 'PENDING');

    // Self-approval is rejected by governance
    await assert.rejects(async () => {
      await approvalWorkflowService.approveRequest(req.id, {
        reviewerId: 'usr_dev_123',
        reviewerEmail: 'dev@company.com',
        role: 'ADMIN'
      });
    }, /Self-approval is forbidden/i);

    // Independent reviewer approval succeeds
    const approved = await approvalWorkflowService.approveRequest(req.id, {
      reviewerId: 'usr_admin_456',
      reviewerEmail: 'admin@company.com',
      role: 'ADMIN'
    });
    assert.strictEqual(approved.status, 'APPROVED');
  });
});
