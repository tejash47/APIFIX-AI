const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  authenticate,
  requireWorkspaceAccess
} = require('../middleware/authMiddleware');
const workspaceService = require('../services/workspaceService');
const incidentService = require('../services/incidentService');
const auditLogger = require('../services/auditLogger');
const { recordAuditEvent, listAuditLogs } = auditLogger;
const { validateSafePath } = require('../services/securitySanitizer');

const router = express.Router();

// =========================================================================
// WORKSPACE ROUTES
// =========================================================================

/**
 * GET /api/workspaces
 * List all workspaces accessible by authenticated user
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const workspaces = await workspaceService.listUserWorkspaces(req.user.id, req.user.email);
    return res.json({ workspaces });
  } catch (err) {
    console.error('[WorkspaceRoutes] List error:', err);
    return res.status(500).json({
      error: {
        code: 'WORKSPACE_LIST_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/workspaces
 * Create a new workspace
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Workspace name is required.',
          requestId: req.id
        }
      });
    }

    const workspace = await workspaceService.createWorkspace({
      name: name.trim(),
      ownerId: req.user.id,
      ownerEmail: req.user.email,
      ownerName: req.user.name
    });

    return res.status(201).json({ workspace });
  } catch (err) {
    console.error('[WorkspaceRoutes] Create error:', err);
    return res.status(500).json({
      error: {
        code: 'WORKSPACE_CREATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId
 * Get workspace details
 */
router.get('/:workspaceId', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const members = await workspaceService.getMembers(req.workspace.id);
    return res.json({
      workspace: {
        ...req.workspace,
        role: req.workspaceMembership.role,
        memberCount: members.length
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'WORKSPACE_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId
 * Update workspace name or settings (ADMIN or OWNER)
 */
router.patch('/:workspaceId', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  try {
    const { name, settings } = req.body || {};
    const updated = await workspaceService.updateWorkspace(
      req.workspace.id,
      { name, settings },
      req.user
    );
    return res.json({ workspace: updated });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'WORKSPACE_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId
 * Delete workspace (OWNER only)
 */
router.delete('/:workspaceId', authenticate, requireWorkspaceAccess('OWNER'), async (req, res) => {
  try {
    const result = await workspaceService.deleteWorkspace(req.workspace.id, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'WORKSPACE_DELETE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

// =========================================================================
// MEMBERSHIP ROUTES
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/members
 */
router.get('/:workspaceId/members', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const members = await workspaceService.getMembers(req.workspace.id);
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
 * POST /api/workspaces/:workspaceId/members
 * Invite or add member (ADMIN or OWNER)
 */
router.post('/:workspaceId/members', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
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

    // Only OWNER can assign OWNER role
    if (role === 'OWNER' && req.workspaceMembership.role !== 'OWNER' && !req.workspaceMembership.isSystemAdmin) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only workspace owners can assign the OWNER role.',
          requestId: req.id
        }
      });
    }

    const member = await workspaceService.addMember(
      req.workspace.id,
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
 * PATCH /api/workspaces/:workspaceId/members/:memberId
 * Update member role (ADMIN or OWNER)
 */
router.patch('/:workspaceId/members/:memberId', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
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

    // Only OWNER can promote to or modify an OWNER
    if (role === 'OWNER' && req.workspaceMembership.role !== 'OWNER' && !req.workspaceMembership.isSystemAdmin) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only workspace owners can modify the OWNER role.',
          requestId: req.id
        }
      });
    }

    const updated = await workspaceService.updateMemberRole(
      req.workspace.id,
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
 * DELETE /api/workspaces/:workspaceId/members/:memberId
 * Remove member (ADMIN or OWNER)
 */
router.delete('/:workspaceId/members/:memberId', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  try {
    const result = await workspaceService.removeMember(
      req.workspace.id,
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

// =========================================================================
// REPOSITORY ROUTES
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/repositories
 */
router.get('/:workspaceId/repositories', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const { page, limit, search } = req.query;
    const result = await workspaceService.listRepositories(req.workspace.id, { page, limit, search });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'REPOSITORIES_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/repositories
 */
router.post('/:workspaceId/repositories', authenticate, requireWorkspaceAccess('MEMBER'), async (req, res) => {
  try {
    const { name, provider = 'github', repositoryUrl, defaultBranch = 'main' } = req.body || {};
    if (!name || !repositoryUrl) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Repository name and repositoryUrl are required.',
          requestId: req.id
        }
      });
    }

    const repo = await workspaceService.createRepository(
      req.workspace.id,
      { name, provider, repositoryUrl, defaultBranch },
      req.user
    );

    return res.status(201).json({ repository: repo });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'REPOSITORY_CREATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/repositories/:repoId
 */
router.get('/:workspaceId/repositories/:repoId', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const repo = await workspaceService.getRepository(req.workspace.id, req.params.repoId);
    if (!repo) {
      return res.status(404).json({
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository not found in this workspace.',
          requestId: req.id
        }
      });
    }
    return res.json({ repository: repo });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'REPOSITORY_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * DELETE /api/workspaces/:workspaceId/repositories/:repoId
 */
router.delete('/:workspaceId/repositories/:repoId', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  try {
    const result = await workspaceService.deleteRepository(req.workspace.id, req.params.repoId, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'REPOSITORY_DELETE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

// =========================================================================
// REPAIR RUNS & RUN HISTORY
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/runs
 */
router.get('/:workspaceId/runs', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const { page, limit, status, repositoryId } = req.query;
    const result = await workspaceService.listRepairRuns(req.workspace.id, { page, limit, status, repositoryId });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'RUNS_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/runs
 */
router.post('/:workspaceId/runs', authenticate, requireWorkspaceAccess('MEMBER'), async (req, res) => {
  try {
    const runData = req.body || {};
    const run = await workspaceService.createRepairRunRecord(req.workspace.id, runData, req.user);
    return res.status(201).json({ run });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'RUN_CREATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/runs/:runId
 */
router.get('/:workspaceId/runs/:runId', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const run = await workspaceService.getRepairRunRecord(req.workspace.id, req.params.runId);
    if (!run) {
      return res.status(404).json({
        error: {
          code: 'RUN_NOT_FOUND',
          message: 'Repair run not found in this workspace.',
          requestId: req.id
        }
      });
    }
    return res.json({ run });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'RUN_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/runs/:runId/download
 * Download verified repaired codebase ZIP with strict workspace authorization
 */
router.get('/:workspaceId/runs/:runId/download', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const { workspaceId, runId } = req.params;

    const storageArtifactsDir = path.resolve(__dirname, '../../storage/artifacts');
    const safeZipPath = validateSafePath(storageArtifactsDir, `repaired_${runId}.zip`);

    if (!fs.existsSync(safeZipPath)) {
      return res.status(404).json({
        error: {
          code: 'ARTIFACT_NOT_FOUND',
          message: 'Repaired codebase ZIP archive not found or not yet generated.',
          requestId: req.id
        }
      });
    }

    // Record audit event for authorized artifact download
    await recordAuditEvent({
      workspaceId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'ARTIFACT_DOWNLOADED',
      resourceType: 'ARTIFACT',
      resourceId: `repaired_${runId}.zip`,
      metadata: { runId }
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="repaired_${runId}.zip"`);
    const stream = fs.createReadStream(safeZipPath);
    return stream.pipe(res);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'DOWNLOAD_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

// =========================================================================
// INCIDENTS
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/incidents
 */
router.get('/:workspaceId/incidents', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const { page, limit, state, severity, repositoryId } = req.query;
    const result = await incidentService.listIncidents(req.workspace.id, { page, limit, state, severity, repositoryId });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'INCIDENTS_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * POST /api/workspaces/:workspaceId/incidents
 */
router.post('/:workspaceId/incidents', authenticate, requireWorkspaceAccess('MEMBER'), async (req, res) => {
  try {
    const incidentData = req.body || {};
    const incident = await incidentService.createIncidentRecord(req.workspace.id, incidentData);
    return res.status(201).json({ incident });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'INCIDENT_CREATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * GET /api/workspaces/:workspaceId/incidents/:incidentId
 */
router.get('/:workspaceId/incidents/:incidentId', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const incident = await incidentService.getIncidentById(req.workspace.id, req.params.incidentId);
    if (!incident) {
      return res.status(404).json({
        error: {
          code: 'INCIDENT_NOT_FOUND',
          message: 'Incident not found in this workspace.',
          requestId: req.id
        }
      });
    }
    return res.json({ incident });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'INCIDENT_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId/incidents/:incidentId
 */
router.patch('/:workspaceId/incidents/:incidentId', authenticate, requireWorkspaceAccess('MEMBER'), async (req, res) => {
  try {
    const incident = await incidentService.getIncidentById(req.workspace.id, req.params.incidentId);
    if (!incident) {
      return res.status(404).json({
        error: {
          code: 'INCIDENT_NOT_FOUND',
          message: 'Incident not found in this workspace.',
          requestId: req.id
        }
      });
    }

    const updated = await incidentService.updateIncidentRecord(req.params.incidentId, req.body || {});
    return res.json({ incident: updated });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'INCIDENT_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

// =========================================================================
// AUDIT LOGS
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/audit-logs
 */
router.get('/:workspaceId/audit-logs', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const { page, limit, action, actorId } = req.query;
    const result = await listAuditLogs({
      workspaceId: req.workspace.id,
      action,
      actorId,
      page,
      limit
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'AUDIT_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

// =========================================================================
// WORKSPACE SETTINGS
// =========================================================================

/**
 * GET /api/workspaces/:workspaceId/settings
 */
router.get('/:workspaceId/settings', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    return res.json({ settings: req.workspace.settings || {} });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'SETTINGS_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId/settings
 */
router.patch('/:workspaceId/settings', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  try {
    const updated = await workspaceService.updateWorkspace(
      req.workspace.id,
      { settings: req.body },
      req.user
    );
    return res.json({ settings: updated.settings });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'SETTINGS_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

// =========================================================================
// SRE & OBSERVABILITY
// =========================================================================

const observabilityEngine = require('../services/observabilityEngine');
const aiProviderObserver = require('../services/aiProviderObserver');
const repairTelemetryTracker = require('../services/repairTelemetryTracker');
const sloEngine = require('../services/sloEngine');
const workerMonitor = require('../services/workerMonitor');

/**
 * GET /api/workspaces/:workspaceId/observability
 * Returns workspace-scoped SRE metrics, SLO status, MTTR, AI provider health, and telemetry stream
 */
router.get('/:workspaceId/observability', authenticate, requireWorkspaceAccess('VIEWER'), async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const summary = observabilityEngine.getOperationalSummary(workspaceId);
    const aiProviders = aiProviderObserver.getProviderHealth();
    const mttr = repairTelemetryTracker.getMttrMetrics();
    const slo = sloEngine.calculateSloStatus(workspaceId);
    const workers = workerMonitor.getWorkerTelemetry();
    const recentTelemetry = observabilityEngine.queryEvents({ workspaceId, limit: 20 });

    return res.json({
      workspaceId,
      summary,
      aiProviders,
      mttr,
      slo,
      workers,
      recentTelemetry: recentTelemetry.events,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      error: {
        code: 'OBSERVABILITY_FETCH_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

/**
 * PATCH /api/workspaces/:workspaceId/observability/slo
 * Updates workspace SLO targets (requires OWNER or ADMIN)
 */
router.patch('/:workspaceId/observability/slo', authenticate, requireWorkspaceAccess('ADMIN'), async (req, res) => {
  try {
    const targets = sloEngine.setWorkspaceTargets(req.workspace.id, req.body);
    const updatedSlo = sloEngine.calculateSloStatus(req.workspace.id);
    return res.json({ targets, slo: updatedSlo });
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'SLO_UPDATE_ERROR',
        message: err.message,
        requestId: req.id
      }
    });
  }
});

module.exports = router;
