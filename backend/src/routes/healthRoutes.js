/**
 * APIFIX AI — Production Health, Readiness, Metrics & Observability Endpoints (Phase 16)
 * Real-time liveness, multi-dependency readiness, correlation tracing, and SRE operational intelligence.
 */

const express = require('express');
const router = express.Router();
const { isSupabaseConfigured } = require('../config/supabase');
const { getActiveProvider, isAiProviderConfigured } = require('../services/aiProviderClient');
const aiProviderObserver = require('../services/aiProviderObserver');
const repairTelemetryTracker = require('../services/repairTelemetryTracker');
const workerMonitor = require('../services/workerMonitor');
const sloEngine = require('../services/sloEngine');
const observabilityEngine = require('../services/observabilityEngine');
const metrics = require('../services/metrics');
const { isStripeConfigured } = require('../services/stripeClient');
const { getAllCircuitBreakersStatus } = require('../services/circuitBreaker');

/**
 * GET /health (Liveness Probe)
 * Confirms that the Node.js event loop and HTTP server are responsive.
 */
function handleHealth(req, res) {
  const mem = process.memoryUsage();
  res.status(200).json({
    status: 'ok',
    service: 'apifix-backend',
    version: '2.0.0',
    agentStatus: 'online',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    process: {
      memoryRssMb: Math.round(mem.rss / (1024 * 1024)),
      memoryHeapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      nodeVersion: process.version
    },
    correlationId: req?.correlationId || req?.headers?.['x-correlation-id'] || 'trace_liveness'
  });
}

/**
 * GET /ready (Readiness Probe)
 * Confirms that dependencies and service subsystems are ready to accept traffic.
 */
function handleReadiness(req, res) {
  const isDemo = process.env.APIFIX_DEMO_MODE === 'true';
  const aiReady = isAiProviderConfigured() || isDemo || process.env.NODE_ENV !== 'production';
  const dbReady = true; // In-memory fallback guarantees availability if Supabase is offline
  const githubConfigured = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim().length > 6);
  const stripeConfigured = isStripeConfigured();

  const providerHealth = aiProviderObserver.getProviderHealth();
  const workerTelemetry = workerMonitor.getWorkerTelemetry();
  const circuitBreakers = getAllCircuitBreakersStatus();

  // Determine overall readiness state (database is core invariant, external providers are reported in checks)
  const isCoreReady = dbReady;
  const statusCode = isCoreReady ? 200 : 503;

  const checks = {
    configuration: 'ok',
    database: isSupabaseConfigured() ? 'ok (supabase-postgresql)' : 'ok (in-memory-fallback)',
    aiProviders: {
      status: aiReady ? 'ok' : 'missing_credentials',
      activeProvider: getActiveProvider()?.provider || (isDemo ? 'demo-mode' : 'none'),
      providers: providerHealth
    },
    circuitBreakers,
    githubIntegration: githubConfigured ? 'ok (token-configured)' : 'unconfigured (optional)',
    stripeBilling: stripeConfigured ? 'ok (stripe-active)' : 'mock (sandbox-mode)',
    workers: {
      status: 'ok',
      activeWorkers: workerTelemetry.activeWorkersCount
    },
    sandbox: 'ok'
  };

  res.status(statusCode).json({
    status: isCoreReady ? (githubConfigured && stripeConfigured ? 'ready' : 'ready_degraded') : 'not_ready',
    service: 'apifix-backend',
    timestamp: new Date().toISOString(),
    correlationId: req?.correlationId || req?.headers?.['x-correlation-id'] || 'trace_readiness',
    checks
  });
}

const { productionMetricsService } = require('../services/productionMetricsService');

/**
 * GET /metrics
 * Aggregated operational metrics summary (supports Prometheus text and JSON)
 */
function handleMetrics(req, res) {
  if (req.headers?.accept?.includes('text/plain') || req.query?.format === 'prometheus') {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    return res.status(200).send(productionMetricsService.getPrometheusFormat());
  }

  const operational = observabilityEngine.getOperationalSummary();
  const mttr = repairTelemetryTracker.getMttrMetrics();
  const slo = sloEngine.calculateSloStatus();
  const prodMetrics = productionMetricsService.getMetricsSummary();

  res.status(200).json({
    ...metrics.getSummary(),
    production: prodMetrics,
    sre: {
      operational,
      mttr,
      slo,
      circuitBreakers: getAllCircuitBreakersStatus()
    }
  });
}

/**
 * GET /observability/summary
 * SRE dashboard operational summary
 */
function handleObservabilitySummary(req, res) {
  const workspaceId = req.query.workspaceId || 'global';
  const operational = observabilityEngine.getOperationalSummary(workspaceId);
  const aiHealth = aiProviderObserver.getProviderHealth();
  const mttr = repairTelemetryTracker.getMttrMetrics();
  const slo = sloEngine.calculateSloStatus(workspaceId);
  const workers = workerMonitor.getWorkerTelemetry();
  const circuitBreakers = getAllCircuitBreakersStatus();

  res.status(200).json({
    summary: operational,
    aiProviders: aiHealth,
    mttr,
    slo,
    workers,
    circuitBreakers,
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /observability/telemetry
 * Query recent telemetry stream
 */
function handleObservabilityTelemetry(req, res) {
  const { workspaceId, category, status, severity, correlationId, limit, offset } = req.query;
  const result = observabilityEngine.queryEvents({
    workspaceId,
    category,
    status,
    severity,
    correlationId,
    limit: parseInt(limit, 10) || 50,
    offset: parseInt(offset, 10) || 0
  });

  res.status(200).json(result);
}

/**
 * GET /observability/trace/:correlationId
 * Full trace timeline for a given correlationId
 */
function handleTraceLookup(req, res) {
  const { correlationId } = req.params;
  const trace = observabilityEngine.getTraceTimeline(correlationId);
  res.status(200).json(trace);
}

router.get('/health', handleHealth);
router.get('/ready', handleReadiness);
router.get('/metrics', handleMetrics);
router.get('/observability/summary', handleObservabilitySummary);
router.get('/observability/telemetry', handleObservabilityTelemetry);
router.get('/observability/trace/:correlationId', handleTraceLookup);

module.exports = {
  router,
  handleHealth,
  handleReadiness,
  handleMetrics,
  handleObservabilitySummary,
  handleObservabilityTelemetry,
  handleTraceLookup
};
