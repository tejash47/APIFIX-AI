/**
 * APIFIX AI — Enterprise Organization REST API Routes (Phase 20)
 * Scoped organization lifecycle, members, workspaces, usage, and billing visibility.
 */

const express = require('express');
const {
  authenticate,
  requireOrganizationAccess,
  requirePermission
} = require('../middleware/authMiddleware');
const organizationService = require('../services/organizationService');

const router = express.Router();

/**
 * GET /api/organizations
 * List all organizations accessible by the authenticated user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const organizations = await organizationService.listUserOrganizations(req.user.id, req.user.email);
    return res.json({ organizations });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'ORGANIZATION_LIST_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/organizations
 * Create a new organization
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, slug, settings } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Organization name is required.',
          requestId: req.id
        }
      });
    }

    const organization = await organizationService.createOrganization({
      name: name.trim(),
      slug,
      ownerId: req.user.id,
      ownerEmail: req.user.email,
      settings
    });

    return res.status(201).json({ organization });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'ORGANIZATION_CREATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/organizations/:orgId
 * Get organization details & status
 */
router.get('/:orgId', authenticate, requireOrganizationAccess('VIEWER'), async (req, res) => {
  try {
    const members = await organizationService.getOrganizationMembers(req.organization.id);
    const workspaces = await organizationService.getOrganizationWorkspaces(req.organization.id);

    return res.json({
      organization: {
        ...req.organization,
        userRole: req.organizationMembership.role,
        memberCount: members.length,
        workspaceCount: workspaces.length
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'ORGANIZATION_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PATCH /api/organizations/:orgId
 * Update organization settings (ADMIN or OWNER)
 */
router.patch('/:orgId', authenticate, requireOrganizationAccess('ADMIN'), async (req, res) => {
  try {
    const updated = await organizationService.updateOrganization(
      req.organization.id,
      req.body || {},
      req.user
    );
    return res.json({ organization: updated });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'ORGANIZATION_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/organizations/:orgId/members
 * List members
 */
router.get('/:orgId/members', authenticate, requireOrganizationAccess('VIEWER'), async (req, res) => {
  try {
    const members = await organizationService.getOrganizationMembers(req.organization.id);
    return res.json({ members });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'MEMBERS_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/organizations/:orgId/members
 * Add member
 */
router.post('/:orgId/members', authenticate, requireOrganizationAccess('ADMIN'), async (req, res) => {
  try {
    const { email, name, role = 'MEMBER', userId } = req.body || {};
    if (!email && !userId) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Member email or userId is required.',
          requestId: req.id
        }
      });
    }

    if (role === 'OWNER' && req.organizationMembership.role !== 'OWNER' && !req.organizationMembership.isSystemAdmin) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only organization owners can assign the OWNER role.',
          requestId: req.id
        }
      });
    }

    const member = await organizationService.addOrganizationMember(
      req.organization.id,
      { userId, userEmail: email, userName: name, role },
      req.user
    );

    return res.status(201).json({ member });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'MEMBER_ADD_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PATCH /api/organizations/:orgId/members/:memberId
 * Update member role
 */
router.patch('/:orgId/members/:memberId', authenticate, requireOrganizationAccess('ADMIN'), async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!role) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'New role is required.',
          requestId: req.id
        }
      });
    }

    if (role === 'OWNER' && req.organizationMembership.role !== 'OWNER' && !req.organizationMembership.isSystemAdmin) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only organization owners can promote to OWNER.',
          requestId: req.id
        }
      });
    }

    const updated = await organizationService.updateOrganizationMemberRole(
      req.organization.id,
      req.params.memberId,
      role,
      req.user
    );

    return res.json({ member: updated });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'MEMBER_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * DELETE /api/organizations/:orgId/members/:memberId
 * Remove member
 */
router.delete('/:orgId/members/:memberId', authenticate, requireOrganizationAccess('ADMIN'), async (req, res) => {
  try {
    const result = await organizationService.removeOrganizationMember(
      req.organization.id,
      req.params.memberId,
      req.user
    );
    return res.json(result);
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'MEMBER_REMOVE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/organizations/:orgId/workspaces
 * List organization workspaces
 */
router.get('/:orgId/workspaces', authenticate, requireOrganizationAccess('VIEWER'), async (req, res) => {
  try {
    const workspaces = await organizationService.getOrganizationWorkspaces(req.organization.id);
    return res.json({ workspaces });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'WORKSPACES_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/organizations/:orgId/workspaces
 * Link existing workspace to organization
 */
router.post('/:orgId/workspaces', authenticate, requireOrganizationAccess('ADMIN'), async (req, res) => {
  try {
    const { workspaceId } = req.body || {};
    if (!workspaceId) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workspaceId is required.',
          requestId: req.id
        }
      });
    }

    const link = await organizationService.linkWorkspaceToOrganization(
      req.organization.id,
      workspaceId,
      req.user
    );

    return res.status(201).json({ link });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'WORKSPACE_LINK_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/organizations/:orgId/usage
 * Organization aggregated usage metrics
 */
router.get('/:orgId/usage', authenticate, requireOrganizationAccess('VIEWER'), async (req, res) => {
  try {
    const usage = await organizationService.getOrganizationUsage(req.organization.id);
    return res.json({ usage });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'USAGE_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
