/**
 * APIFIX AI — Performance Regression Gate Service (Phase 24)
 * 
 * Compares incoming benchmark and operational metrics against measured enterprise baselines.
 * Automatically enforces CI/CD performance regression gates (PASS, WARNING, BLOCKED).
 */

class PerformanceGateService {
  constructor() {
    this.baseline = {
      apiLatencyP95Ms: 50.0,
      apiLatencyP99Ms: 150.0,
      minThroughputRps: 150.0,
      maxErrorRatePercent: 0.5,
      maxRepairDurationSec: 5.0,
      maxMemoryRssMb: 512.0
    };

    this.tolerancePercent = {
      latency: 20, // Allow up to 20% latency regression before WARNING, >40% BLOCKED
      throughput: 25, // Allow up to 25% throughput drop before WARNING, >50% BLOCKED
      errorRate: 1.0 // Error rate > 1.0% is BLOCKED
    };
  }

  /**
   * Set custom baseline thresholds.
   */
  setBaseline(customBaseline) {
    this.baseline = { ...this.baseline, ...customBaseline };
  }

  /**
   * Evaluate a test or benchmark run against established baseline.
   * 
   * @param {Object} metrics
   * @param {number} [metrics.p95Ms] Measured p95 latency
   * @param {number} [metrics.p99Ms] Measured p99 latency
   * @param {number} [metrics.throughputRps] Measured throughput RPS
   * @param {number} [metrics.errorRatePercent] Measured error rate
   * @param {number} [metrics.repairDurationSec] Measured average repair duration
   * @param {number} [metrics.memoryRssMb] Measured memory RSS
   * @returns {Object} Evaluation report
   */
  evaluatePerformanceGate(metrics = {}) {
    const findings = [];
    let status = 'PASS';

    // 1. Check p95 Latency
    if (typeof metrics.p95Ms === 'number') {
      const p95Baseline = this.baseline.apiLatencyP95Ms;
      const ratio = (metrics.p95Ms - p95Baseline) / p95Baseline;
      if (ratio > 0.4) {
        status = 'BLOCKED';
        findings.push(`p95 Latency (${metrics.p95Ms}ms) regressed by >40% over baseline (${p95Baseline}ms).`);
      } else if (ratio > 0.2) {
        if (status !== 'BLOCKED') status = 'WARNING';
        findings.push(`p95 Latency (${metrics.p95Ms}ms) elevated by >20% over baseline (${p95Baseline}ms).`);
      }
    }

    // 2. Check p99 Latency
    if (typeof metrics.p99Ms === 'number') {
      const p99Baseline = this.baseline.apiLatencyP99Ms;
      if (metrics.p99Ms > p99Baseline * 1.5) {
        status = 'BLOCKED';
        findings.push(`p99 Latency (${metrics.p99Ms}ms) exceeds severe threshold (${p99Baseline * 1.5}ms).`);
      }
    }

    // 3. Check Throughput
    if (typeof metrics.throughputRps === 'number') {
      const minRps = this.baseline.minThroughputRps;
      if (metrics.throughputRps < minRps * 0.5) {
        status = 'BLOCKED';
        findings.push(`Throughput (${metrics.throughputRps} RPS) dropped >50% below baseline (${minRps} RPS).`);
      } else if (metrics.throughputRps < minRps * 0.75) {
        if (status !== 'BLOCKED') status = 'WARNING';
        findings.push(`Throughput (${metrics.throughputRps} RPS) lower than baseline (${minRps} RPS).`);
      }
    }

    // 4. Check Error Rate
    if (typeof metrics.errorRatePercent === 'number') {
      if (metrics.errorRatePercent > this.tolerancePercent.errorRate) {
        status = 'BLOCKED';
        findings.push(`Error rate (${metrics.errorRatePercent}%) exceeds maximum tolerance (${this.tolerancePercent.errorRate}%).`);
      }
    }

    return {
      classification: 'MEASURED',
      status,
      passed: status === 'PASS',
      gateResult: status,
      findings,
      metrics,
      baseline: this.baseline,
      timestamp: new Date().toISOString()
    };
  }
}

const defaultPerformanceGateService = new PerformanceGateService();

module.exports = {
  PerformanceGateService,
  performanceGateService: defaultPerformanceGateService
};
