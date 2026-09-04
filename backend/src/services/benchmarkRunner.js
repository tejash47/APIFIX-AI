/**
 * APIFIX AI — Performance Benchmark Framework (Phase 24)
 * 
 * Provides repeatable, precise benchmarking with accurate percentile metrics (p50, p90, p95, p99),
 * throughput (RPS), memory/CPU profiling, and strict measurement classification.
 */

const os = require('os');
const { performance } = require('perf_hooks');

class BenchmarkRunner {
  constructor() {
    this.results = [];
  }

  /**
   * Run a benchmark workload with specified concurrency and iterations.
   * 
   * @param {Object} config
   * @param {string} config.name Benchmark name
   * @param {Function} config.fn Asynchronous task function (iteration, workerId) => Promise<any>
   * @param {number} [config.concurrency=10] Concurrent workers
   * @param {number} [config.iterations=100] Total executions
   * @param {number} [config.warmupIterations=10] Warmup runs (not included in metrics)
   * @param {Object} [config.metadata={}] Additional contextual metadata
   * @returns {Promise<Object>} Benchmark result
   */
  async runBenchmark({
    name,
    fn,
    concurrency = 10,
    iterations = 100,
    warmupIterations = 5,
    metadata = {}
  }) {
    if (!name || typeof fn !== 'function') {
      throw new Error('Benchmark requires a valid name and task function.');
    }

    // Warmup phase to stabilize JIT optimization
    for (let w = 0; w < warmupIterations; w++) {
      try {
        await fn(w, 0);
      } catch {
        // Ignore warmup errors
      }
    }

    const latencies = [];
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const memBefore = process.memoryUsage();
    const cpuBefore = process.cpuUsage();
    const startTime = performance.now();

    let currentIndex = 0;

    const worker = async (workerId) => {
      while (true) {
        const i = currentIndex++;
        if (i >= iterations) break;

        const reqStart = performance.now();
        try {
          await fn(i, workerId);
          const reqDuration = performance.now() - reqStart;
          latencies.push(reqDuration);
          successCount++;
        } catch (err) {
          const reqDuration = performance.now() - reqStart;
          latencies.push(reqDuration);
          errorCount++;
          if (errors.length < 5) {
            errors.push(err.message || String(err));
          }
        }
      }
    };

    // Execute concurrently across worker pool
    const workers = [];
    const activeConcurrency = Math.min(concurrency, iterations);
    for (let w = 0; w < activeConcurrency; w++) {
      workers.push(worker(w));
    }

    await Promise.all(workers);

    const totalDurationMs = performance.now() - startTime;
    const cpuAfter = process.cpuUsage(cpuBefore);
    const memAfter = process.memoryUsage();

    // Calculate statistical percentiles
    latencies.sort((a, b) => a - b);
    const totalRequests = latencies.length;

    const getPercentile = (p) => {
      if (latencies.length === 0) return 0;
      const index = Math.ceil((p / 100) * latencies.length) - 1;
      return Number(latencies[Math.max(0, Math.min(index, latencies.length - 1))].toFixed(2));
    };

    const sum = latencies.reduce((acc, val) => acc + val, 0);
    const avgLatency = totalRequests > 0 ? Number((sum / totalRequests).toFixed(2)) : 0;
    const minLatency = latencies.length > 0 ? Number(latencies[0].toFixed(2)) : 0;
    const maxLatency = latencies.length > 0 ? Number(latencies[latencies.length - 1].toFixed(2)) : 0;
    const throughputRps = totalDurationMs > 0 ? Number(((totalRequests / (totalDurationMs / 1000))).toFixed(2)) : 0;

    const cpuPercent = totalDurationMs > 0 
      ? Number((((cpuAfter.user + cpuAfter.system) / 1000) / totalDurationMs * 100).toFixed(2))
      : 0;

    const result = {
      testName: name,
      classification: 'MEASURED',
      environment: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024))
      },
      concurrency: activeConcurrency,
      totalRequests,
      successCount,
      errorCount,
      successRate: totalRequests > 0 ? Number(((successCount / totalRequests) * 100).toFixed(2)) : 0,
      errorRate: totalRequests > 0 ? Number(((errorCount / totalRequests) * 100).toFixed(2)) : 0,
      durationMs: Number(totalDurationMs.toFixed(2)),
      throughputRps,
      latency: {
        minMs: minLatency,
        avgMs: avgLatency,
        p50Ms: getPercentile(50),
        p90Ms: getPercentile(90),
        p95Ms: getPercentile(95),
        p99Ms: getPercentile(99),
        maxMs: maxLatency
      },
      resources: {
        cpuUsagePercent: cpuPercent,
        memoryRssMb: Math.round(memAfter.rss / (1024 * 1024)),
        memoryHeapUsedMb: Math.round(memAfter.heapUsed / (1024 * 1024)),
        memoryDeltaMb: Math.round((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024))
      },
      errors: errors.length > 0 ? errors : undefined,
      metadata,
      timestamp: new Date().toISOString()
    };

    this.results.push(result);
    return result;
  }

  /**
   * Format results as human-readable string summary.
   */
  formatSummary(result) {
    return [
      `\n======================================================`,
      ` BENCHMARK: ${result.testName} [${result.classification}]`,
      `======================================================`,
      ` Concurrency:   ${result.concurrency} workers`,
      ` Total Runs:     ${result.totalRequests} reqs (${result.successCount} passed, ${result.errorCount} failed)`,
      ` Success Rate:   ${result.successRate}%`,
      ` Duration:       ${result.durationMs} ms`,
      ` Throughput:     ${result.throughputRps} RPS`,
      ` Latency (p50):  ${result.latency.p50Ms} ms`,
      ` Latency (p95):  ${result.latency.p95Ms} ms`,
      ` Latency (p99):  ${result.latency.p99Ms} ms`,
      ` Latency (max):  ${result.latency.maxMs} ms`,
      ` CPU / Mem RSS:  ${result.resources.cpuUsagePercent}% | ${result.resources.memoryRssMb} MB`,
      `======================================================\n`
    ].join('\n');
  }

  getResults() {
    return [...this.results];
  }

  clear() {
    this.results = [];
  }
}

const defaultBenchmarkRunner = new BenchmarkRunner();

module.exports = {
  BenchmarkRunner,
  benchmarkRunner: defaultBenchmarkRunner
};
