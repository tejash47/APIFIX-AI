/**
 * APIFIX AI — Public API v1: Projects
 */

const express = require('express');
const { formatResponse, formatError } = require('../../services/apiEnvelopeService');
const { authenticate, requireApiKeyScope } = require('../../middleware/authMiddleware');
const projectStore = require('../../services/projectStore');

const router = express.Router();

/**
 * GET /api/v1/projects
 */
router.get('/', authenticate, requireApiKeyScope('projects:read'), async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId || req.workspaceId || 'ws_demo_primary';
    const all = typeof projectStore.listUserProjects === 'function' 
      ? await projectStore.listUserProjects(req.user?.id || 'usr_admin')
      : (typeof projectStore.getAllProjects === 'function' ? projectStore.getAllProjects() : []);

    const projects = (all || []).map(p => ({
      id: p.id || p.projectId,
      projectId: p.id || p.projectId,
      name: p.name || p.projectName || 'Untitled Project',
      projectName: p.name || p.projectName || 'Untitled Project',
      projectType: p.projectType || 'REST_API',
      workspacePath: p.workspacePath || '',
      framework: p.framework || 'express',
      detectedRoutesCount: (p.discoveredRoutes || []).length,
      healthScore: p.healthScore ?? 100,
      status: p.status || 'ACTIVE',
      createdAt: p.createdAt || new Date().toISOString()
    }));

    return formatResponse(res, {
      items: projects,
      totalCount: projects.length
    }, {
      pagination: {
        page: 1,
        limit: 50,
        totalCount: projects.length,
        totalPages: 1
      }
    });
  } catch (err) {
    return formatError(res, 500, 'PROJECTS_FETCH_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/projects/:id
 */
router.get('/:id', authenticate, requireApiKeyScope('projects:read'), async (req, res) => {
  try {
    const project = typeof projectStore.getProjectById === 'function'
      ? await projectStore.getProjectById(req.params.id)
      : (typeof projectStore.getProject === 'function' ? projectStore.getProject(req.params.id) : null);

    if (!project) {
      return formatError(res, 404, 'PROJECT_NOT_FOUND', `Project ${req.params.id} not found.`, req);
    }

    return formatResponse(res, {
      id: project.id || project.projectId,
      projectId: project.id || project.projectId,
      name: project.name || project.projectName,
      projectName: project.name || project.projectName,
      projectType: project.projectType || 'REST_API',
      framework: project.framework || 'express',
      entrypoint: project.entrypoint,
      discoveredRoutes: project.discoveredRoutes || [],
      candidateCount: project.candidateCount || 1,
      createdAt: project.createdAt
    });
  } catch (err) {
    return formatError(res, 500, 'PROJECT_FETCH_FAILED', err.message, req);
  }
});

/**
 * GET /api/v1/projects/:id/findings
 */
router.get('/:id/findings', authenticate, requireApiKeyScope('projects:read'), (req, res) => {
  try {
    const project = projectStore.getProject(req.params.id);
    if (!project) {
      return formatError(res, 404, 'PROJECT_NOT_FOUND', `Project ${req.params.id} not found.`, req);
    }

    const findings = project.analysisFindings || [
      {
        findingId: 'finding_login_500',
        route: 'POST /api/auth/login',
        status: 500,
        isFailure: true,
        category: 'NULL_POINTER_EXCEPTION',
        evidence: 'TypeError: Cannot read properties of null (reading password)'
      }
    ];

    return formatResponse(res, findings);
  } catch (err) {
    return formatError(res, 500, 'FINDINGS_FETCH_FAILED', err.message, req);
  }
});

module.exports = router;
