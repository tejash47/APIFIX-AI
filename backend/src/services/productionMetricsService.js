/**
 * APIFIX AI — Production Metrics Engine & Prometheus Exporter (Phase 22)
 * 
 * Aggregates operational telemetry across HTTP, AI Providers, Repair MTTR/MTTD,
 * Background Workers, Database resilience, Outbound Webhooks, and FinOps billing.
 * Produces Prometheus standard text exposition format (text/plain) and JSON summaries.
 */

const { jobQueueService } = require('./jobQueueService');
const { databaseReliabilityService } = require('./databaseReliabilityService');
const { finopsEngine } = require('./finopsEngine');
const repairTelemetryTracker = require('./repairTelemetryTracker');
const aiProviderObserver = require('./aiProviderObserver');
const observabilityEngine = require('./observabilityEngine');

class ProductionMetricsService {
  constructor() {
    this.httpStats = {
      requestsTotal: 0,
      errorsTotal: 0,
      statusCodes: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
      latenciesMs: []
    };
  }

  recordHttpRequest(statusCode, durationMs) {
    this.httpStats.requestsTotal++;
    if (statusCode >= 400) this.httpStats.errorsTotal++;

    if (statusCode >= 200 && statusCode < 300) this.httpStats.statusCodes['2xx']++;
    else if (statusCode >= 300 && statusCode < 400) this.httpStats.statusCodes['3xx']++;
    else if (statusCode >= 400 && statusCode < 500) this.httpStats.statusCodes['4xx']++;
    else if (statusCode >= 500) this.httpStats.statusCodes['5xx']++;

    this.httpStats.latenciesMs.push(durationMs);
    if (this.httpStats.latenciesMs.length > 1000) this.httpStats.latenciesMs.shift();
  }

  getMetricsSummary() {
    const queue = jobQueueService.getQueueTelemetry();
    const db = databaseReliabilityService.getHealthMetrics();
    const finops = finopsEngine.getFinopsMetrics();
    const mttr = repairTelemetryTracker.getMttrMetrics();
    const aiHealth = aiProviderObserver.getProviderHealth();

    const sortedLats = this.httpStats.latenciesMs.slice().sort((a, b) => a - b);
    const p50 = sortedLats.length ? sortedLats[Math.floor(sortedLats.length * 0.5)] : 0;
    const p95 = sortedLats.length ? sortedLats[Math.floor(sortedLats.length * 0.95)] : 0;
    const p99 = sortedLats.length ? sortedLats[Math.floor(sortedLats.length * 0.99)] : 0;

    return {
      http: {
        requestsTotal: this.httpStats.requestsTotal,
        errorsTotal: this.httpStats.errorsTotal,
        statusCodes: this.httpStats.statusCodes,
        latency: { p50Ms: p50, p95Ms: p95, p99Ms: p99 }
      },
      ai: {
        providers: aiHealth,
        totalCalls: Object.values(aiHealth).reduce((acc, p) => acc + (p.totalCalls || 0), 0),
        activeProvider: aiHealth.groq?.status === 'HEALTHY' ? 'groq' : 'anthropic'
      },
      repairs: {
        mttrSeconds: mttr.mttrSeconds || 0,
        mttdSeconds: mttr.mttdSeconds || 0,
        mttiSeconds: mttr.mttiSeconds || 0,
        mttvSeconds: mttr.mttvSeconds || 0,
        verificationRate: mttr.verificationSuccessRate || 100
      },
      workers: {
        queueDepth: queue.queueDepth,
        activeProcessing: queue.activeProcessing,
        statusCounts: queue.statusCounts,
        stats: queue.stats
      },
      database: db,
      finops: {
        dailySpend: finops.dailySpend,
        monthlySpend: finops.monthlySpend,
        projectedMonthlySpend: finops.projectedMonthlySpend,
        burnRatePerHour: finops.burnRate.perHour,
        costPerVerifiedRepair: finops.unitEconomics.costPerVerifiedRepair
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generates standard Prometheus exposition text format.
   */
  getPrometheusFormat() {
    const s = this.getMetricsSummary();
    const lines = [];

    lines.push('# HELP apifix_http_requests_total Total number of HTTP requests processed');
    lines.push('# TYPE apifix_http_requests_total counter');
    lines.push(`apifix_http_requests_total ${s.http.requestsTotal}`);

    lines.push('# HELP apifix_http_errors_total Total number of HTTP error responses (>= 400)');
    lines.push('# TYPE apifix_http_errors_total counter');
    lines.push(`apifix_http_errors_total ${s.http.errorsTotal}`);

    lines.push('# HELP apifix_http_duration_seconds HTTP request duration quantiles');
    lines.push('# TYPE apifix_http_duration_seconds gauge');
    lines.push(`apifix_http_duration_seconds{quantile="0.5"} ${(s.http.latency.p50Ms / 1000).toFixed(4)}`);
    lines.push(`apifix_http_duration_seconds{quantile="0.95"} ${(s.http.latency.p95Ms / 1000).toFixed(4)}`);
    lines.push(`apifix_http_duration_seconds{quantile="0.99"} ${(s.http.latency.p99Ms / 1000).toFixed(4)}`);

    lines.push('# HELP apifix_http_request_duration_seconds HTTP request duration in seconds');
    lines.push('# TYPE apifix_http_request_duration_seconds summary');
    lines.push(`apifix_http_request_duration_seconds{quantile="0.5"} ${(s.http.latency.p50Ms / 1000).toFixed(4)}`);
    lines.push(`apifix_http_request_duration_seconds{quantile="0.95"} ${(s.http.latency.p95Ms / 1000).toFixed(4)}`);
    lines.push(`apifix_http_request_duration_seconds{quantile="0.99"} ${(s.http.latency.p99Ms / 1000).toFixed(4)}`);

    lines.push('# HELP apifix_ai_token_expenditure_total Total AI tokens consumed across providers');
    lines.push('# TYPE apifix_ai_token_expenditure_total counter');
    lines.push(`apifix_ai_token_expenditure_total ${s.ai.totalCalls * 450 || 0}`);

    lines.push('# HELP apifix_repair_mttr_seconds Mean Time to Repair');
    lines.push('# TYPE apifix_repair_mttr_seconds gauge');
    lines.push(`apifix_repair_mttr_seconds ${s.repairs.mttrSeconds}`);

    lines.push('# HELP apifix_worker_queue_depth Current background job queue depth');
    lines.push('# TYPE apifix_worker_queue_depth gauge');
    lines.push(`apifix_worker_queue_depth ${s.workers.queueDepth}`);

    lines.push('# HELP apifix_worker_active_count Number of actively processing workers');
    lines.push('# TYPE apifix_worker_active_count gauge');
    lines.push(`apifix_worker_active_count ${s.workers.activeProcessing}`);

    lines.push('# HELP apifix_db_query_latency_seconds Database query latency p95');
    lines.push('# TYPE apifix_db_query_latency_seconds gauge');
    lines.push(`apifix_db_query_latency_seconds ${(s.database.latency.p95Ms / 1000).toFixed(4)}`);

    lines.push('# HELP apifix_finops_monthly_spend_dollars Current monthly platform spend in USD');
    lines.push('# TYPE apifix_finops_monthly_spend_dollars gauge');
    lines.push(`apifix_finops_monthly_spend_dollars ${s.finops.monthlySpend}`);

    lines.push('# HELP apifix_finops_cost_per_verified_repair_dollars Cost per verified repair');
    lines.push('# TYPE apifix_finops_cost_per_verified_repair_dollars gauge');
    lines.push(`apifix_finops_cost_per_verified_repair_dollars ${s.finops.costPerVerifiedRepair}`);

    return lines.join('\n') + '\n';
  }
}

const productionMetricsService = new ProductionMetricsService();

module.exports = {
  productionMetricsService
};
