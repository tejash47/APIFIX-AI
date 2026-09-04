/**
 * APIFIX AI — Public API v1 Master Router
 * 
 * Aggregates all v1 resources with hierarchical rate limiting, idempotency handling,
 * API analytics telemetry, and correlation tracing.
 */

const express = require('express');
const hierarchicalRateLimiterMiddleware = require('../../middleware/hierarchicalRateLimiterMiddleware');
const idempotencyMiddleware = require('../../middleware/idempotencyMiddleware');
const { recordApiRequest } = require('../../services/apiUsageService');

const projectsV1 = require('./projectsV1');
const incidentsV1 = require('./incidentsV1');
const runsV1 = require('./runsV1');
const repairsV1 = require('./repairsV1');
const patchesV1 = require('./patchesV1');
const verificationV1 = require('./verificationV1');
const webhooksV1 = require('./webhooksV1');
const apiKeysV1 = require('./apiKeysV1');
const workspacesV1 = require('./workspacesV1');
const organizationsV1 = require('./organizationsV1');
const usageV1 = require('./usageV1');
const auditV1 = require('./auditV1');
const healthV1 = require('./healthV1');
const featureFlagsV1 = require('./featureFlagsV1');
const productionReadinessV1 = require('./productionReadinessV1');
const performanceV1 = require('../performanceRoutes');

const router = express.Router();

// Telemetry recording middleware for v1 API
router.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    recordApiRequest({
      method: req.method,
      pathUrl: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      apiKeyId: req.apiKey ? req.apiKey.id : null,
      organizationId: req.organizationId || null,
      workspaceId: req.workspaceId || null
    });
  });
  next();
});

// Apply hierarchical rate limiting and idempotency middleware
router.use(hierarchicalRateLimiterMiddleware);
router.use(idempotencyMiddleware);

// Mount Sub-resources
router.use('/projects', projectsV1);
router.use('/incidents', incidentsV1);
router.use('/runs', runsV1);
router.use('/repairs', repairsV1);
router.use('/patches', patchesV1);
router.use('/verification', verificationV1);
router.use('/webhooks', webhooksV1);
router.use('/api-keys', apiKeysV1);
router.use('/workspaces', workspacesV1);
router.use('/organizations', organizationsV1);
router.use('/usage', usageV1);
router.use('/audit', auditV1);
router.use('/health', healthV1);
router.use('/feature-flags', featureFlagsV1);
router.use('/admin', productionReadinessV1);
router.use('/performance', performanceV1);

module.exports = router;
