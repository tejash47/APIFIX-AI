/**
 * APIFIX AI — Advanced Enterprise SLO & Error Budget Engine (Phase 24)
 * 
 * Provides automated Service Level Objective (SLO) tracking, Service Level Indicator (SLI)
 * calculations, multi-window error budget burn rate analysis, and adaptive governance enforcement.
 */

class AdvancedSloEngine {
  constructor() {
    this.slos = {
      api_availability: {
        name: 'API Gateway Availability',
        targetPercent: 99.9,
        category: 'availability',
        description: 'Percentage of successful 2xx/3xx/4xx non-5xx responses'
      },
      api_latency_p95: {
        name: 'API p95 Latency Threshold',
        targetMs: 50,
        category: 'latency',
        description: '95th percentile response latency under 50ms for synchronous routes'
      },
      repair_success_rate: {
        name: 'Autonomous Repair Success Rate',
        targetPercent: 95.0,
        category: 'quality',
        description: 'Percentage of autonomous repairs passing verification without human rollback'
      },
      webhook_delivery_rate: {
        name: 'Outbound Webhook Delivery Reliability',
        targetPercent: 99.5,
        category: 'reliability',
        description: 'Percentage of successfully delivered outbound webhook events'
      },
      ai_provider_availability: {
        name: 'AI Provider Resilience',
        targetPercent: 99.0,
        category: 'ai_infrastructure',
        description: 'Percentage of AI investigation/patch requests resolved via primary or fallback'
      }
    };

    this.metricsHistory = new Map(); // sloKey -> { total, successes, failures, latencies: [] }
  }

  /**
   * Record an SLI event.
   */
  recordEvent(sloKey, isSuccess, latencyMs = null) {
    if (!this.slos[sloKey]) return;

    if (!this.metricsHistory.has(sloKey)) {
      this.metricsHistory.set(sloKey, { total: 0, successes: 0, failures: 0, latencies: [] });
    }

    const rec = this.metricsHistory.get(sloKey);
    rec.total++;
    if (isSuccess) {
      rec.successes++;
    } else {
      rec.failures++;
    }

    if (typeof latencyMs === 'number') {
      rec.latencies.push(latencyMs);
      if (rec.latencies.length > 5000) {
        rec.latencies.shift();
      }
    }
  }

  /**
   * Calculate comprehensive SLO status, error budget, burn rate, and health state.
   */
  evaluateSloStatus() {
    const report = {
      classification: 'MEASURED',
      timestamp: new Date().toISOString(),
      overallStatus: 'NORMAL',
      activeAlertsCount: 0,
      slos: {}
    };

    let worstState = 'NORMAL';

    for (const [key, def] of Object.entries(this.slos)) {
      const rec = this.metricsHistory.get(key) || { total: 0, successes: 0, failures: 0, latencies: [] };
      const total = rec.total;
      const successes = rec.successes;
      const failures = rec.failures;

      let currentSli = 100;
      let errorBudgetTotal = 0;
      let errorBudgetConsumed = 0;
      let errorBudgetRemainingPercent = 100;
      let burnRate = 0;
      let status = 'NORMAL';

      if (total > 0) {
        if (def.category === 'latency') {
          const latenciesSorted = [...rec.latencies].sort((a, b) => a - b);
          const p95Index = Math.ceil(0.95 * latenciesSorted.length) - 1;
          const p95Latency = latenciesSorted.length > 0 ? latenciesSorted[Math.max(0, p95Index)] : 0;
          currentSli = Number(p95Latency.toFixed(2));
          status = p95Latency <= def.targetMs ? 'NORMAL' : p95Latency <= def.targetMs * 1.5 ? 'WARNING' : 'CRITICAL';
          errorBudgetRemainingPercent = p95Latency <= def.targetMs ? 100 : Math.max(0, 100 - ((p95Latency - def.targetMs) / def.targetMs) * 100);
        } else {
          currentSli = Number(((successes / total) * 100).toFixed(3));
          const allowedErrorFraction = (100 - def.targetPercent) / 100;
          errorBudgetTotal = Math.max(1, Math.ceil(total * allowedErrorFraction));
          errorBudgetConsumed = failures;
          const remainingFraction = Math.max(0, 1 - (errorBudgetConsumed / errorBudgetTotal));
          errorBudgetRemainingPercent = Number((remainingFraction * 100).toFixed(2));

          burnRate = errorBudgetTotal > 0 ? Number((errorBudgetConsumed / errorBudgetTotal).toFixed(2)) : 0;

          if (errorBudgetRemainingPercent < 10 || burnRate > 2.0 || currentSli < def.targetPercent - 2) {
            status = 'CRITICAL';
          } else if (errorBudgetRemainingPercent < 50 || burnRate > 1.0 || currentSli < def.targetPercent) {
            status = 'WARNING';
          } else {
            status = 'NORMAL';
          }
        }
      }

      if (status === 'CRITICAL') {
        worstState = 'CRITICAL';
        report.activeAlertsCount++;
      } else if (status === 'WARNING' && worstState !== 'CRITICAL') {
        worstState = 'WARNING';
        report.activeAlertsCount++;
      }

      report.slos[key] = {
        name: def.name,
        target: def.targetPercent ? `${def.targetPercent}%` : `${def.targetMs}ms`,
        currentSli: def.targetPercent ? `${currentSli}%` : `${currentSli}ms`,
        rawSli: currentSli,
        totalEvents: total,
        errorBudgetRemainingPercent,
        burnRate,
        status,
        recommendation: status === 'CRITICAL'
          ? 'Halt autonomous risky deployments; require multi-reviewer human approvals.'
          : status === 'WARNING'
          ? 'Heighten verification gating; monitor error budget depletion rate.'
          : 'Service operating within optimal SLO boundaries.'
      };
    }

    report.overallStatus = worstState;
    return report;
  }

  clear() {
    this.metricsHistory.clear();
  }
}

const defaultAdvancedSloEngine = new AdvancedSloEngine();

module.exports = {
  AdvancedSloEngine,
  advancedSloEngine: defaultAdvancedSloEngine
};
