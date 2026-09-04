/**
 * APIFIX V2 — Internal Production Metrics Collector
 * Collects runtime operational metrics, latencies, error counts, and resource usage.
 */

class MetricsRegistry {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = Date.now();
    this.counters = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      cancelledRuns: 0,
      aiRequests: 0,
      aiProviderFailures: 0,
      githubImports: 0,
      githubPrsCreated: 0,
      patchValidationFailures: 0,
      regressionTestFailures: 0,
      rateLimitEvents: 0
    };

    this.durations = {
      repairTotalMs: [],
      aiRequestsMs: [],
      githubOperationsMs: [],
      sandboxExecutionsMs: []
    };
  }

  increment(metricName, value = 1) {
    if (this.counters[metricName] !== undefined) {
      this.counters[metricName] += value;
    }
  }

  recordDuration(category, durationMs) {
    if (this.durations[category] && typeof durationMs === 'number' && durationMs >= 0) {
      this.durations[category].push(Math.round(durationMs));
      // Keep last 100 observations to bound memory
      if (this.durations[category].length > 100) {
        this.durations[category].shift();
      }
    }
  }

  _calculateAvg(arr) {
    if (!arr || arr.length === 0) return 0;
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / arr.length);
  }

  getSummary() {
    const memUsage = process.memoryUsage();

    return {
      service: 'apifix-backend',
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      runs: {
        total: this.counters.totalRuns,
        successful: this.counters.successfulRuns,
        failed: this.counters.failedRuns,
        cancelled: this.counters.cancelledRuns,
        successRate: this.counters.totalRuns > 0
          ? `${Math.round((this.counters.successfulRuns / this.counters.totalRuns) * 100)}%`
          : 'N/A',
        avgRepairDurationMs: this._calculateAvg(this.durations.repairTotalMs)
      },
      ai: {
        totalRequests: this.counters.aiRequests,
        failures: this.counters.aiProviderFailures,
        avgLatencyMs: this._calculateAvg(this.durations.aiRequestsMs)
      },
      github: {
        totalImports: this.counters.githubImports,
        prsCreated: this.counters.githubPrsCreated,
        avgOperationDurationMs: this._calculateAvg(this.durations.githubOperationsMs)
      },
      sandbox: {
        patchValidationFailures: this.counters.patchValidationFailures,
        regressionFailures: this.counters.regressionTestFailures,
        avgExecutionDurationMs: this._calculateAvg(this.durations.sandboxExecutionsMs)
      },
      security: {
        rateLimitEvents: this.counters.rateLimitEvents
      },
      process: {
        nodeVersion: process.version,
        memoryRssMb: Math.round(memUsage.rss / (1024 * 1024)),
        memoryHeapUsedMb: Math.round(memUsage.heapUsed / (1024 * 1024))
      }
    };
  }
}

const metrics = new MetricsRegistry();

module.exports = metrics;
