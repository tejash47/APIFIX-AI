/**
 * APIFIX AI — Product & Customer Experience Routes (Phase 25)
 */

const express = require('express');
const router = express.Router();
const { productAnalyticsService } = require('../services/productAnalyticsService');
const { supportDiagnosticsService } = require('../services/supportDiagnosticsService');
const { finalLaunchCertification } = require('../services/finalLaunchCertification');

// In-memory workspace onboarding state storage
const onboardingStates = new Map();

/**
 * GET /api/product/onboarding
 * Retrieves current onboarding state for the workspace.
 */
router.get('/onboarding', (req, res) => {
  const workspaceId = req.query.workspaceId || 'default_workspace';
  const state = onboardingStates.get(workspaceId) || {
    workspaceId,
    currentStep: 1,
    totalSteps: 7,
    completed: false,
    completedSteps: [],
    skipped: false,
    lastUpdated: new Date().toISOString()
  };

  res.json({
    success: true,
    data: state
  });
});

/**
 * POST /api/product/onboarding/step
 * Updates onboarding step progress.
 */
router.post('/onboarding/step', (req, res) => {
  const { workspaceId = 'default_workspace', step, action = 'complete', skipped = false } = req.body;

  let state = onboardingStates.get(workspaceId) || {
    workspaceId,
    currentStep: 1,
    totalSteps: 7,
    completed: false,
    completedSteps: [],
    skipped: false,
    lastUpdated: new Date().toISOString()
  };

  if (skipped) {
    state.skipped = true;
    state.completed = true;
    productAnalyticsService.trackEvent({
      eventName: 'onboarding_skipped',
      workspaceId
    });
  } else if (step) {
    if (!state.completedSteps.includes(step)) {
      state.completedSteps.push(step);
    }
    state.currentStep = Math.min(state.totalSteps, step + 1);
    if (state.completedSteps.length >= state.totalSteps || step >= state.totalSteps) {
      state.completed = true;
      productAnalyticsService.trackEvent({
        eventName: 'onboarding_completed',
        workspaceId
      });
    }
  }

  state.lastUpdated = new Date().toISOString();
  onboardingStates.set(workspaceId, state);

  res.json({
    success: true,
    data: state
  });
});

/**
 * POST /api/product/support/diagnostics
 * Generates a sanitized diagnostic package for a support request.
 */
router.post('/support/diagnostics', (req, res) => {
  const { workspaceId, projectId, incidentId, repairId, correlationId, userDescription } = req.body;

  if (!workspaceId) {
    return res.status(400).json({
      error: {
        code: 'MISSING_WORKSPACE_ID',
        message: 'workspaceId is required to generate diagnostic package'
      }
    });
  }

  try {
    const bundle = supportDiagnosticsService.generateDiagnosticPackage({
      workspaceId,
      projectId,
      incidentId,
      repairId,
      correlationId: correlationId || req.headers['x-correlation-id'],
      userDescription
    });

    productAnalyticsService.trackEvent({
      eventName: 'support_diagnostic_generated',
      workspaceId,
      metadata: { incidentId, repairId }
    });

    res.json({
      success: true,
      data: bundle
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'DIAGNOSTIC_GENERATION_FAILED',
        message: err.message
      }
    });
  }
});

/**
 * POST /api/product/analytics/event
 * Records a privacy-conscious product lifecycle event.
 */
router.post('/analytics/event', (req, res) => {
  const { eventName, workspaceId, userId, metadata } = req.body;

  if (!eventName) {
    return res.status(400).json({
      error: {
        code: 'MISSING_EVENT_NAME',
        message: 'eventName is required'
      }
    });
  }

  try {
    const result = productAnalyticsService.trackEvent({
      eventName,
      workspaceId,
      userId,
      metadata
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'ANALYTICS_TRACKING_FAILED',
        message: err.message
      }
    });
  }
});

/**
 * GET /api/product/analytics/metrics
 * Retrieves aggregate product telemetry metrics.
 */
router.get('/analytics/metrics', (req, res) => {
  const { workspaceId } = req.query;
  const metrics = productAnalyticsService.getAggregateMetrics(workspaceId);
  res.json({
    success: true,
    data: metrics
  });
});

/**
 * GET /api/product/certification
 * Retrieves final commercial launch certification report.
 */
router.get('/certification', (req, res) => {
  const cert = finalLaunchCertification.evaluateCommercialLaunch();
  res.json({
    success: true,
    data: cert
  });
});

module.exports = router;
