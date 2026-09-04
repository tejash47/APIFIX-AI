/**
 * APIFIX AI — Centralized Observability Engine (Phase 16)
 * Unified telemetry recording, correlation tracing, latency percentiles,
 * and zero-secret operational intelligence layer.
 */

const { sanitizeSecrets } = require('./securitySanitizer');
const { classifyOperationalError, ErrorCodes } = require('../config/errorTaxonomy');
const logger = require('./logger');

const MAX_EVENT_BUFFER = 1000;
const MAX_LATENCY_SAMPLES = 500;

class ObservabilityEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.events = [];
    this.latencies = {
      http: [],
      ai: [],
      repair: [],
      sandbox: [],
      webhook: []
    };
    this.counters = {
      totalEvents: 0,
      errors: 0,
      aiRequests: 0,
      aiFailures: 0,
      repairsStarted: 0,
      repairsVerified: 0,
      repairsFailed: 0,
      webhooksReceived: 0,
      canaryProbes: 0,
      governanceEvaluated: 0,
      governanceBlocked: 0,
      approvalsRequested: 0,
      approvalsApproved: 0,
      approvalsRejected: 0,
      complianceVerified: 0,
      complianceFailed: 0,
      auditIntegrityFailures: 0,
      budgetWarnings: 0,
      budgetExceeded: 0,
      dataExportsCreated: 0,
      retentionCleanups: 0
    };
    this.errorCountsByCode = {};
    this.workspaceEventCount = new Map();
  }

  /**
   * Records a structured operational telemetry event with automatic secret scrubbing.
   * @param {object} eventData
   * @returns {object} Sanitized stored event
   */
  recordEvent(eventData = {}) {
    const timestamp = eventData.timestamp || new Date().toISOString();
    const correlationId = eventData.correlationId || eventData.traceId || `trace_${Math.random().toString(36).substring(2, 9)}`;
    const requestId = eventData.requestId || `req_${Math.random().toString(36).substring(2, 9)}`;
    const workspaceId = eventData.workspaceId || 'system';
    const userId = eventData.userId || null;
    const category = eventData.category || 'GENERAL';
    const event = eventData.event || 'operational_event';
    const stage = eventData.stage || null;
    const status = eventData.status || (eventData.error ? 'FAILURE' : 'SUCCESS');
    const provider = eventData.provider || null;

    let errorCode = eventData.errorCode || null;
    let severity = eventData.severity || 'INFO';

    if (eventData.error || status === 'FAILURE') {
      const classified = classifyOperationalError(eventData.error || errorCode);
      errorCode = errorCode || classified.code;
      severity = classified.severity;
      this.counters.errors++;
      this.errorCountsByCode[errorCode] = (this.errorCountsByCode[errorCode] || 0) + 1;
    }

    let durationMs = null;
    if (typeof eventData.durationMs === 'number' && eventData.durationMs >= 0) {
      durationMs = Math.round(eventData.durationMs);
      const catKey = category.toLowerCase();
      if (this.latencies[catKey]) {
        this.latencies[catKey].push(durationMs);
        if (this.latencies[catKey].length > MAX_LATENCY_SAMPLES) {
          this.latencies[catKey].shift();
        }
      }
    }

    // Scrub all metadata and parameters for security
    const safeMetadata = sanitizeSecrets(eventData.metadata || {});

    const record = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      correlationId,
      requestId,
      workspaceId,
      userId,
      category,
      event,
      stage,
      status,
      durationMs,
      errorCode,
      severity,
      provider,
      metadata: safeMetadata
    };

    // Store in circular buffer
    this.events.unshift(record);
    if (this.events.length > MAX_EVENT_BUFFER) {
      this.events.pop();
    }

    this.counters.totalEvents++;
    this.workspaceEventCount.set(workspaceId, (this.workspaceEventCount.get(workspaceId) || 0) + 1);

    // Track category counters
    if (category === 'AI') {
      this.counters.aiRequests++;
      if (status === 'FAILURE') this.counters.aiFailures++;
    } else if (category === 'REPAIR') {
      if (event.includes('started')) this.counters.repairsStarted++;
      if (status === 'SUCCESS' && (event.includes('verified') || stage === 'VERIFIED')) this.counters.repairsVerified++;
      if (status === 'FAILURE') this.counters.repairsFailed++;
    } else if (category === 'WEBHOOK') {
      this.counters.webhooksReceived++;
    } else if (category === 'PROBER') {
      this.counters.canaryProbes++;
    } else if (category === 'GOVERNANCE') {
      if (event === 'governance_policy_evaluated') this.counters.governanceEvaluated++;
      if (event === 'governance_policy_blocked') this.counters.governanceBlocked++;
      if (event === 'approval_requested') this.counters.approvalsRequested++;
      if (event === 'approval_approved') this.counters.approvalsApproved++;
      if (event === 'approval_rejected') this.counters.approvalsRejected++;
      if (event === 'data_export_created') this.counters.dataExportsCreated++;
      if (event === 'retention_cleanup_completed') this.counters.retentionCleanups++;
    } else if (category === 'COMPLIANCE') {
      if (event === 'compliance_control_verified') this.counters.complianceVerified++;
      if (event === 'compliance_control_failed') this.counters.complianceFailed++;
    } else if (category === 'BILLING') {
      if (event === 'budget_warning') this.counters.budgetWarnings++;
      if (event === 'budget_exceeded') this.counters.budgetExceeded++;
    } else if (category === 'SECURITY') {
      if (event === 'audit_integrity_failure') this.counters.auditIntegrityFailures++;
    }

    return record;
  }

  /**
   * Calculates percentile latency (p50, p90, p95, p99)
   * @param {number[]} samples
   * @param {number} p
   * @returns {number}
   */
  _calculatePercentile(samples, p) {
    if (!samples || samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Returns latency metrics across categories
   */
  getLatencyMetrics() {
    const categories = Object.keys(this.latencies);
    const result = {};

    for (const cat of categories) {
      const samples = this.latencies[cat];
      const avg = samples.length > 0
        ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
        : 0;

      result[cat] = {
        sampleCount: samples.length,
        avgMs: avg,
        p50Ms: this._calculatePercentile(samples, 50),
        p90Ms: this._calculatePercentile(samples, 90),
        p95Ms: this._calculatePercentile(samples, 95),
        p99Ms: this._calculatePercentile(samples, 99)
      };
    }

    return result;
  }

  /**
   * Queries recorded telemetry events with optional filtering
   * @param {object} filter
   * @returns {object} { events: Array, total: number }
   */
  queryEvents({ workspaceId, category, correlationId, status, severity, limit = 50, offset = 0 } = {}) {
    let filtered = this.events;

    if (workspaceId && workspaceId !== 'all') {
      filtered = filtered.filter(e => e.workspaceId === workspaceId || e.workspaceId === 'system');
    }
    if (category) {
      filtered = filtered.filter(e => e.category === category);
    }
    if (correlationId) {
      filtered = filtered.filter(e => e.correlationId === correlationId);
    }
    if (status) {
      filtered = filtered.filter(e => e.status === status);
    }
    if (severity) {
      filtered = filtered.filter(e => e.severity === severity);
    }

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);

    return {
      events: items,
      total,
      limit,
      offset
    };
  }

  /**
   * Gets complete trace timeline for a given correlationId
   * @param {string} correlationId
   * @returns {object}
   */
  getTraceTimeline(correlationId) {
    if (!correlationId) return { correlationId, traceEvents: [], count: 0 };
    const traceEvents = this.events
      .filter(e => e.correlationId === correlationId)
      .slice()
      .reverse();

    const startTime = traceEvents.length > 0 ? new Date(traceEvents[0].timestamp).getTime() : 0;
    const endTime = traceEvents.length > 0 ? new Date(traceEvents[traceEvents.length - 1].timestamp).getTime() : 0;
    const totalDurationMs = endTime >= startTime ? endTime - startTime : 0;

    return {
      correlationId,
      totalDurationMs,
      eventCount: traceEvents.length,
      traceEvents
    };
  }

  /**
   * Returns comprehensive operational intelligence summary
   * @param {string} [workspaceId]
   */
  getOperationalSummary(workspaceId) {
    const memUsage = process.memoryUsage();
    const latencyMetrics = this.getLatencyMetrics();

    let eventTotal = this.counters.totalEvents;
    if (workspaceId && workspaceId !== 'all') {
      eventTotal = this.workspaceEventCount.get(workspaceId) || 0;
    }

    return {
      service: 'apifix-backend',
      timestamp: new Date().toISOString(),
      workspaceId: workspaceId || 'global',
      counters: {
        ...this.counters,
        workspaceEvents: eventTotal
      },
      errorTaxonomy: this.errorCountsByCode,
      latencies: latencyMetrics,
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round(memUsage.rss / (1024 * 1024)),
        memoryHeapUsedMb: Math.round(memUsage.heapUsed / (1024 * 1024)),
        eventBufferCount: this.events.length
      }
    };
  }
}

const observabilityEngine = new ObservabilityEngine();

module.exports = observabilityEngine;
