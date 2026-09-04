require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { validateEnvironment } = require('./config/envValidator');
const { requestIdMiddleware, standardErrorHandler } = require('./middleware/errorHandler');
const { generalLimiter, heavyLimiter } = require('./middleware/rateLimiter');
const { router: healthRouter } = require('./routes/healthRoutes');
const { registerGracefulShutdown } = require('./services/shutdownManager');
const logger = require('./services/logger');

// Step 1: Validate Environment on Startup
const envConfig = validateEnvironment();
logger.info('application_startup', {
  environment: envConfig.environment,
  port: envConfig.port,
  isDemoMode: envConfig.isDemoMode,
  aiProviders: envConfig.ai.activeProviderCount,
  database: envConfig.database.type
});

// Step 2: Route Modules
const authRoutes = require('./routes/authRoutes');
const agentRoutes = require('./routes/agentRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const historyRoutes = require('./routes/historyRoutes');
const projectRoutes = require('./routes/projectRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const billingRoutes = require('./routes/billingRoutes');
const webhookAlertRoutes = require('./routes/webhookAlertRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const governanceRoutes = require('./routes/governanceRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const auditRoutes = require('./routes/auditRoutes');
const costRoutes = require('./routes/costRoutes');
const exportRoutes = require('./routes/exportRoutes');
const retentionRoutes = require('./routes/retentionRoutes');
const v1Routes = require('./routes/v1');
const scimRoutes = require('./routes/scimRoutes');
const ssoRoutes = require('./routes/ssoRoutes');
const statusRoutes = require('./routes/statusRoutes');
const apiDocsRoutes = require('./routes/apiDocsRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const productRoutes = require('./routes/productRoutes');

const correlationMiddleware = require('./middleware/correlationMiddleware');
const securityHeadersMiddleware = require('./middleware/securityHeaders');
const { requestBackpressureMiddleware } = require('./middleware/requestBackpressure');
const { lifecycleManager } = require('./services/lifecycleManager');
const { productionMetricsService } = require('./services/productionMetricsService');

const app = express();

// Request tracking and production metrics
app.use((req, res, next) => {
  lifecycleManager.trackRequest(req, res);
  const start = Date.now();
  res.on('finish', () => {
    productionMetricsService.recordHttpRequest(res.statusCode, Date.now() - start);
  });
  next();
});

// Production CORS Configuration
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // In dev/test or for server-to-server/same-origin probes (origin undefined), allow
    if (!origin || !isProduction) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not permitted by production CORS policy.`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id', 'X-Correlation-Id', 'X-Workspace-Id', 'X-Organization-Id', 'X-Webhook-Signature', 'Idempotency-Key', 'X-Idempotency-Key', 'stripe-signature'],
  exposedHeaders: ['X-Request-Id', 'X-Correlation-Id', 'X-API-Version', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Cache', 'X-Idempotent-Replay', 'Retry-After'],
  credentials: true
};

// Security & Parsing Middleware (Captures rawBody for Stripe & Webhook Signature Verification)
app.use(securityHeadersMiddleware);
app.use(cors(corsOptions));
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(correlationMiddleware);
app.use(requestIdMiddleware);
app.use(generalLimiter);

// Liveness, Readiness, Status & OpenAPI Documentation Routes
app.use('/', healthRouter);
app.use('/', statusRoutes);
app.use('/', apiDocsRoutes);
app.use('/api', healthRouter);

// Phase 21 Versioned Public API & Enterprise Integration Routes
app.use('/api/v1', v1Routes);
app.use('/scim/v2', scimRoutes);
app.use('/api/sso', ssoRoutes);

// Phase 12-20 Platform Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/costs', costRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/retention', retentionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/workspaces/:workspaceId/billing', billingRoutes);
app.use('/api/workspaces/:workspaceId', webhookAlertRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/projects', requestBackpressureMiddleware, heavyLimiter, projectRoutes);
app.use('/api', requestBackpressureMiddleware, heavyLimiter, agentRoutes);
app.use('/api', incidentRoutes);
app.use('/api', historyRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/product', productRoutes);

// 404 Fallback for unmapped routes
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
      requestId: req.id || req.requestId || 'req_unknown'
    }
  });
});

// Standardized Production Error Handler
app.use(standardErrorHandler);

const PORT = envConfig.port || 4000;
let server = null;

if (require.main === module) {
  server = app.listen(PORT, () => {
    logger.info('http_server_started', {
      port: PORT,
      url: `http://localhost:${PORT}`
    });
    console.log(`[APIFIX Backend] Listening on http://localhost:${PORT}`);
  });
  registerGracefulShutdown(server);
} else {
  // If required as module in tests or external orchestrators
  server = app.listen(PORT, () => {
    logger.info('http_server_started', {
      port: PORT,
      url: `http://localhost:${PORT}`
    });
  });
  if (server) {
    server.on('error', (err) => {
      // If port is already in use by main process or test runner, gracefully ignore EADDRINUSE
      if (err.code !== 'EADDRINUSE') {
        console.error('[APIFIX Server Error]', err.message);
      }
    });
    if (server.unref) {
      server.unref();
    }
    registerGracefulShutdown(server);
  }
}

module.exports = { app, server };
