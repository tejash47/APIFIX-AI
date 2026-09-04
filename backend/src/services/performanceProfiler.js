/**
 * High-resolution performance profiler for measuring pipeline stages and identifying bottlenecks.
 */
class PerformanceProfiler {
  constructor(runId) {
    this.runId = runId;
    this.startTimeNs = process.hrtime.bigint();
    this.marks = new Map();
    this.stages = [];
  }

  /**
   * Starts timing a named stage
   * @param {string} stageName 
   */
  startStage(stageName) {
    this.marks.set(stageName, process.hrtime.bigint());
  }

  /**
   * Ends timing for a named stage and records its duration
   * @param {string} stageName 
   * @param {object} metadata 
   * @returns {number} Duration in milliseconds
   */
  endStage(stageName, metadata = {}) {
    const startNs = this.marks.get(stageName);
    if (!startNs) {
      return 0;
    }

    const endNs = process.hrtime.bigint();
    const durationMs = Number(endNs - startNs) / 1e6; // Convert ns to ms

    this.stages.push({
      stage: stageName,
      durationMs: Math.round(durationMs * 100) / 100,
      metadata
    });

    this.marks.delete(stageName);
    return durationMs;
  }

  /**
   * Returns complete profile report including total duration and top 3 bottlenecks.
   * @returns {object} Profile report
   */
  getReport() {
    const totalDurationMs = Math.round(Number(process.hrtime.bigint() - this.startTimeNs) / 1e6 * 100) / 100;

    // Identify top 3 bottlenecks by duration
    const sorted = [...this.stages].sort((a, b) => b.durationMs - a.durationMs);
    const topBottlenecks = sorted.slice(0, 3).map((item, rank) => ({
      rank: rank + 1,
      stage: item.stage,
      durationMs: item.durationMs,
      percentageOfTotal: totalDurationMs > 0 ? Math.round((item.durationMs / totalDurationMs) * 1000) / 10 : 0
    }));

    return {
      runId: this.runId,
      totalDurationMs,
      stages: this.stages,
      topBottlenecks
    };
  }
}

/**
 * Factory helper
 * @param {string} runId 
 * @returns {PerformanceProfiler}
 */
function createProfiler(runId) {
  return new PerformanceProfiler(runId);
}

module.exports = {
  PerformanceProfiler,
  createProfiler
};
