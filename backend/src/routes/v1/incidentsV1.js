/**
 * APIFIX AI — Public API v1: Incidents
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const incidentService = require('../../services/incidentService');

const router = express.Router();

/**
 * GET /api/v1/incidents
 */
router.get('/', authenticate, requireApiKeyScope('incidents:read'), async (req, res) => {
  try {
    const { severity, status, page = 1, limit = 20 } = req.query;
    const workspaceId = req.workspaceId || 'ws_demo_primary';

    const incidents = await incidentService.listIncidents({
      workspaceId,
      severity: severity === 'ALL' ? null : severity,
      status: status === 'ALL' ? null : status,
      limit: parseInt(limit, 10),
      offset: (parseInt(page, 10) - 1) * parseInt(limit, 10)
    });

    return formatResponse(res, incidents, {
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalCount: incidents.length,
        totalPages: 1
      }
    });
  } catch (err) {
    return formatError(res, 500, 'INCIDENTS_FETCH_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/incidents/:id
 */
router.get('/:id', authenticate, requireApiKeyScope('incidents:read'), async (req, res) => {
  try {
    const incident = await incidentService.getIncidentById(req.params.id);
    if (!incident) {
      return formatError(res, 404, 'INCIDENT_NOT_FOUND', `Incident ${req.params.id} not found.`, req);
    }
    return formatResponse(res, incident);
  } catch (err) {
    return formatError(res, 500, 'INCIDENT_FETCH_FAILED', err.message, req);
  }
});

/**
 * PATCH /api/v1/incidents/:id
 */
router.patch('/:id', authenticate, requireApiKeyScope('incidents:write'), async (req, res) => {
  try {
    const { status, resolutionSummary } = req.body || {};
    const updated = await incidentService.updateIncidentStatus(req.params.id, status, resolutionSummary, req.user);
    if (!updated) {
      return formatError(res, 404, 'INCIDENT_NOT_FOUND', `Incident ${req.params.id} not found.`, req);
    }
    return formatResponse(res, updated);
  } catch (err) {
    return formatError(res, 400, 'INCIDENT_UPDATE_FAILED', err.message, req);
  }
});

module.exports = router;
