/**
 * APIFIX AI — Enterprise Data Export REST API Routes (Phase 20)
 * Secret-sanitized JSON & CSV exports, cryptographic integrity, and authorization checks.
 */

const express = require('express');
const {
  authenticate,
  requirePermission
} = require('../middleware/authMiddleware');
const dataExportService = require('../services/dataExportService');

const router = express.Router();

/**
 * POST /api/exports
 * Generate a new data export
 */
router.post('/', authenticate, requirePermission('audit.export'), async (req, res) => {
  try {
    const { orgId, workspaceId, category, format } = req.body || {};

    const exportRecord = await dataExportService.generateExport({
      orgId,
      workspaceId,
      category,
      format,
      actor: req.user
    });

    return res.status(201).json({ export: exportRecord });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'EXPORT_GENERATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/exports
 * List previous exports
 */
router.get('/', authenticate, requirePermission('audit.export'), async (req, res) => {
  try {
    const { orgId, page, limit } = req.query;
    const result = dataExportService.listExports({
      orgId,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'EXPORT_LIST_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/exports/:exportId
 * Get export details
 */
router.get('/:exportId', authenticate, requirePermission('audit.export'), async (req, res) => {
  try {
    const exportRecord = dataExportService.getExportById(req.params.exportId, req.query.orgId);
    if (!exportRecord) {
      return res.status(404).json({
        error: {
          code: 'EXPORT_NOT_FOUND',
          message: 'Requested export record not found.',
          requestId: req.id
        }
      });
    }
    return res.json({ export: exportRecord });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'EXPORT_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
