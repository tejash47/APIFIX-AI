/**
 * APIFIX AI — Public API v1: Workspaces
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const workspaceService = require('../../services/workspaceService');

const router = express.Router();

/**
 * GET /api/v1/workspaces
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const workspaces = await workspaceService.listUserWorkspaces(req.user.id, req.user.email);
    return formatResponse(res, workspaces);
  } catch (err) {
    return formatError(res, 500, 'WORKSPACES_FETCH_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/workspaces/:id
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const ws = await workspaceService.getWorkspaceById(req.params.id);
    if (!ws) {
      return formatError(res, 404, 'WORKSPACE_NOT_FOUND', `Workspace ${req.params.id} not found.`, req);
    }
    return formatResponse(res, ws);
  } catch (err) {
    return formatError(res, 500, 'WORKSPACE_FETCH_FAILED', err.message, req);
  }
});

/**
 * POST /api/v1/workspaces
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { name } = req.body || {};
    const created = await workspaceService.createWorkspace({
      name,
      ownerId: req.user.id,
      ownerEmail: req.user.email,
      ownerName: req.user.name
    });
    return formatResponse(res, created, { statusCode: 201 });
  } catch (err) {
    return formatError(res, 400, 'WORKSPACE_CREATE_FAILED', err.message, req);
  }
});

module.exports = router;
