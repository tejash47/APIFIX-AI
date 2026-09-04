/**
 * APIFIX AI — Resource Profiler & Leak Detector (Phase 24)
 * 
 * Provides memory profiling (RSS, Heap, External), event loop lag measurement,
 * CPU utilization tracking, and automated memory leak regression detection.
 */

const os = require('os');
const { performance } = require('perf_hooks');

class ResourceProfiler {
  constructor() {
    this.snapshots = [];
  }

  /**
   * Capture a single point-in-time resource snapshot.
   */
  takeSnapshot(label = 'snapshot') {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();

    const snapshot = {
      label,
      timestamp: Date.now(),
      uptimeSeconds: Math.round(uptime),
      memory: {
        rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
        heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
        heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
        externalMb: Number((mem.external / (1024 * 1024)).toFixed(2)),
        arrayBuffersMb: Number(((mem.arrayBuffers || 0) / (1024 * 1024)).toFixed(2))
      },
      cpuRaw: cpu
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Measure event loop lag asynchronously.
   * 
   * @param {number} [iterations=5] Sample iterations
   * @returns {Promise<Object>} Lag metrics
   */
  async measureEventLoopLag(iterations = 5) {
    const lags = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await new Promise((resolve) => setImmediate(resolve));
      const elapsed = performance.now() - start;
      lags.push(elapsed);
    }

    const avgLag = lags.reduce((a, b) => a + b, 0) / lags.length;
    const maxLag = Math.max(...lags);
    const minLag = Math.min(...lags);

    return {
      classification: 'MEASURED',
      samples: lags.length,
      avgLagMs: Number(avgLag.toFixed(3)),
      minLagMs: Number(minLag.toFixed(3)),
      maxLagMs: Number(maxLag.toFixed(3)),
      health: maxLag < 50 ? 'HEALTHY' : maxLag < 150 ? 'DEGRADED' : 'CRITICAL_LAG'
    };
  }

  /**
   * Analyze snapshots to detect persistent memory leaks or runaway resource growth.
   * 
   * @param {number} [thresholdDeltaMb=50] Heap growth threshold considered a potential leak
   * @returns {Object} Leak diagnosis report
   */
  detectMemoryLeaks(thresholdDeltaMb = 50) {
    if (this.snapshots.length < 2) {
      return {
        status: 'INSUFFICIENT_DATA',
        message: 'At least 2 snapshots are required to evaluate memory growth.',
        snapshotsCount: this.snapshots.length,
        hasLeak: false
      };
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    const heapDeltaMb = Number((last.memory.heapUsedMb - first.memory.heapUsedMb).toFixed(2));
    const rssDeltaMb = Number((last.memory.rssMb - first.memory.rssMb).toFixed(2));

    const hasLeak = heapDeltaMb > thresholdDeltaMb;

    return {
      classification: 'MEASURED',
      status: hasLeak ? 'LEAK_SUSPECTED' : 'HEALTHY',
      hasLeak,
      heapDeltaMb,
      rssDeltaMb,
      firstSnapshot: {
        label: first.label,
        heapUsedMb: first.memory.heapUsedMb,
        rssMb: first.memory.rssMb
      },
      lastSnapshot: {
        label: last.label,
        heapUsedMb: last.memory.heapUsedMb,
        rssMb: last.memory.rssMb
      },
      recommendation: hasLeak
        ? 'Investigate unreleased event listeners, dangling closures, or unbounded in-memory caches.'
        : 'Memory footprint is stable within normal garbage collection operating thresholds.'
    };
  }

  /**
   * Get current resource summary.
   */
  getCurrentProfile() {
    const mem = process.memoryUsage();
    return {
      classification: 'MEASURED',
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        cpus: os.cpus().length,
        freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024))
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
        heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
        heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
        externalMb: Number((mem.external / (1024 * 1024)).toFixed(2))
      }
    };
  }

  clear() {
    this.snapshots = [];
  }
}

const defaultResourceProfiler = new ResourceProfiler();

module.exports = {
  ResourceProfiler,
  resourceProfiler: defaultResourceProfiler
};
