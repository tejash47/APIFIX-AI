/**
 * APIFIX AI — Feature Flags API v1 Routes (Phase 22)
 * Protected with RBAC (Admin/Owner for mutations) and standardized response envelopes.
 */

const express = require('express');
const router = express.Router();
const { featureFlagService } = require('../../services/featureFlagService');
const { authenticate } = require('../../middleware/authMiddleware');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');

// GET /api/v1/feature-flags (List all flags)
router.get('/', authenticate, (req, res) => {
  try {
    const flags = featureFlagService.listFlags();
    res.status(200).json(formatResponse(req, flags));
  } catch (err) {
    res.status(500).json(formatError(req, 'FEATURE_FLAGS_ERROR', err.message, 500));
  }
});

// GET /api/v1/feature-flags/:name (Get single flag)
router.get('/:name', authenticate, (req, res) => {
  try {
    const flag = featureFlagService.getFlag(req.params.name);
    if (!flag) {
      return res.status(404).json(formatError(req, 'FLAG_NOT_FOUND', `Feature flag '${req.params.name}' not found`, 404));
    }
    res.status(200).json(formatResponse(req, flag));
  } catch (err) {
    res.status(500).json(formatError(req, 'FEATURE_FLAGS_ERROR', err.message, 500));
  }
});

// POST /api/v1/feature-flags (Create or update flag - Admin only)
router.post('/', authenticate, async (req, res) => {
  try {
    const role = (req.user?.role || req.apiKey?.role || 'VIEWER').toUpperCase();
    if (!['OWNER', 'ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      return res.status(403).json(formatError(req, 'FORBIDDEN', 'Only Admins or Owners can modify feature flags', 403));
    }

    const { name, description, enabled, scope, rolloutPercentage, targetEntities } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json(formatError(req, 'INVALID_PAYLOAD', 'Flag name is required', 400));
    }

    const updated = await featureFlagService.setFlag({
      name,
      description,
      enabled,
      scope,
      rolloutPercentage,
      targetEntities
    }, { id: req.user?.id || 'admin', email: req.user?.email || '', role });

    res.status(200).json(formatResponse(req, updated));
  } catch (err) {
    res.status(500).json(formatError(req, 'FLAG_UPDATE_FAILED', err.message, 500));
  }
});

// DELETE /api/v1/feature-flags/:name (Delete flag - Admin only)
router.delete('/:name', authenticate, async (req, res) => {
  try {
    const role = (req.user?.role || req.apiKey?.role || 'VIEWER').toUpperCase();
    if (!['OWNER', 'ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      return res.status(403).json(formatError(req, 'FORBIDDEN', 'Only Admins or Owners can delete feature flags', 403));
    }

    const result = await featureFlagService.deleteFlag(req.params.name, {
      id: req.user?.id || 'admin',
      role
    });
    if (!result.success) {
      return res.status(404).json(formatError(req, 'FLAG_NOT_FOUND', result.message, 404));
    }
    res.status(200).json(formatResponse(req, { deleted: true, name: req.params.name }));
  } catch (err) {
    res.status(500).json(formatError(req, 'FLAG_DELETE_FAILED', err.message, 500));
  }
});

module.exports = router;
