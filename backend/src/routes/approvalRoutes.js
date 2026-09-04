/**
 * APIFIX AI — Enterprise Approval Workflow REST API Routes (Phase 20)
 * Scoped approval requests, multi-reviewer actions, anti-self-approval enforcement.
 */

const express = require('express');
const {
  authenticate,
  requirePermission
} = require('../middleware/authMiddleware');
const approvalWorkflowService = require('../services/approvalWorkflowService');

const router = express.Router();

/**
 * GET /api/approvals
 * List approval requests
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { orgId, workspaceId, status, page, limit } = req.query;
    const result = approvalWorkflowService.listApprovalRequests({
      orgId,
      workspaceId,
      status,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'APPROVALS_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/approvals
 * Create a new approval request
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      orgId,
      workspaceId,
      workflowType,
      title,
      description,
      severity,
      environment,
      requiredApprovals,
      expiresInHours,
      metadata
    } = req.body || {};

    if (!title) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Title is required for approval request.',
          requestId: req.id
        }
      });
    }

    const request = await approvalWorkflowService.createApprovalRequest({
      orgId,
      workspaceId,
      workflowType,
      title,
      description,
      severity,
      environment,
      requesterId: req.user.id,
      requesterEmail: req.user.email,
      requiredApprovals,
      expiresInHours,
      metadata
    });

    return res.status(201).json({ request });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'APPROVAL_CREATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/approvals/:requestId
 * Get details of a specific approval request
 */
router.get('/:requestId', authenticate, async (req, res) => {
  try {
    const request = await approvalWorkflowService.getApprovalRequestById(req.params.requestId);
    if (!request) {
      return res.status(404).json({
        error: {
          code: 'APPROVAL_NOT_FOUND',
          message: 'Approval request not found.',
          requestId: req.id
        }
      });
    }
    return res.json({ request });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'APPROVAL_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/approvals/:requestId/approve
 * Approve request (strictly enforces anti-self-approval)
 */
router.post('/:requestId/approve', authenticate, requirePermission('repair.approve'), async (req, res) => {
  try {
    const { comment } = req.body || {};
    const updated = await approvalWorkflowService.approveRequest(
      req.params.requestId,
      {
        reviewerId: req.user.id,
        reviewerEmail: req.user.email,
        role: req.user.role,
        comment
      }
    );

    return res.json({ request: updated });
  } catch (err) {
    const isForbidden = err.message.includes('Self-approval is forbidden') || err.message.includes('already approved');
    return res.status(isForbidden ? 403 : 400).json({
      error: {
        code: isForbidden ? 'FORBIDDEN_SELF_APPROVAL' : 'APPROVAL_ACTION_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/approvals/:requestId/reject
 * Reject request
 */
router.post('/:requestId/reject', authenticate, requirePermission('repair.approve'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const updated = await approvalWorkflowService.rejectRequest(
      req.params.requestId,
      {
        reviewerId: req.user.id,
        reviewerEmail: req.user.email,
        role: req.user.role,
        reason
      }
    );

    return res.json({ request: updated });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'REJECTION_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/approvals/:requestId/cancel
 * Cancel request
 */
router.post('/:requestId/cancel', authenticate, async (req, res) => {
  try {
    const updated = await approvalWorkflowService.cancelApprovalRequest(
      req.params.requestId,
      req.user
    );
    return res.json({ request: updated });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'CANCEL_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
