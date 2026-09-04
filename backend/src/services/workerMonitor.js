/**
 * APIFIX AI — Background Worker & Job Monitor (Phase 16)
 * Observes asynchronous job queues, run concurrency, execution durations,
 * zombie prevention, and worker resource utilization.
 */

const observabilityEngine = require('./observabilityEngine');

class WorkerMonitor {
  constructor() {
    this.reset();
  }

  reset() {
    this.jobs = new Map(); // jobId -> jobMeta
    this.completedHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Registers a newly started background job
   * @param {string} jobId
   * @param {object} meta
   */
  startJob(jobId, meta = {}) {
    const jobMeta = {
      jobId,
      workspaceId: meta.workspaceId || 'system',
      type: meta.type || 'REPAIR_RUN',
      status: 'RUNNING',
      startedAt: Date.now(),
      correlationId: meta.correlationId || null,
      metadata: meta.metadata || {}
    };

    this.jobs.set(jobId, jobMeta);

    observabilityEngine.recordEvent({
      event: 'worker_job_started',
      category: 'WORKER',
      stage: 'RUNNING',
      status: 'SUCCESS',
      workspaceId: jobMeta.workspaceId,
      correlationId: jobMeta.correlationId,
      metadata: { jobId, type: jobMeta.type }
    });

    return jobMeta;
  }

  /**
   * Completes a background job
   * @param {string} jobId
   * @param {string} status - COMPLETED, FAILED, CANCELLED
   * @param {object} [resultMeta]
   */
  finishJob(jobId, status = 'COMPLETED', resultMeta = {}) {
    const job = this.jobs.get(jobId);
    const now = Date.now();
    const durationMs = job ? now - job.startedAt : (resultMeta.durationMs || 0);

    const record = {
      jobId,
      workspaceId: job?.workspaceId || resultMeta.workspaceId || 'system',
      type: job?.type || resultMeta.type || 'REPAIR_RUN',
      status,
      durationMs,
      startedAt: job?.startedAt ? new Date(job.startedAt).toISOString() : new Date().toISOString(),
      finishedAt: new Date(now).toISOString(),
      error: resultMeta.error || null
    };

    this.completedHistory.unshift(record);
    if (this.completedHistory.length > this.maxHistory) {
      this.completedHistory.pop();
    }

    this.jobs.delete(jobId);

    observabilityEngine.recordEvent({
      event: `worker_job_${status.toLowerCase()}`,
      category: 'WORKER',
      stage: status,
      durationMs,
      status: status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
      workspaceId: record.workspaceId,
      correlationId: job?.correlationId,
      metadata: { jobId, durationMs, error: record.error }
    });

    return record;
  }

  /**
   * Scans for stale/zombie jobs that have exceeded the timeout threshold
   * @param {number} maxAgeMs - Default: 15 minutes (900,000ms)
   */
  cleanupStaleJobs(maxAgeMs = 15 * 60 * 1000) {
    const now = Date.now();
    const cleaned = [];

    for (const [jobId, job] of this.jobs.entries()) {
      if (now - job.startedAt >= maxAgeMs) {
        this.finishJob(jobId, 'TIMED_OUT', { error: 'Job timed out and was cleaned up by worker monitor.' });
        cleaned.push(jobId);
      }
    }

    return cleaned;
  }

  /**
   * Returns worker concurrency, active job summary, and history stats
   */
  getWorkerTelemetry() {
    const activeList = Array.from(this.jobs.values()).map(j => ({
      jobId: j.jobId,
      workspaceId: j.workspaceId,
      type: j.type,
      status: j.status,
      runningDurationMs: Date.now() - j.startedAt
    }));

    const totalFinished = this.completedHistory.length;
    const failedCount = this.completedHistory.filter(j => j.status === 'FAILED').length;
    const completedCount = this.completedHistory.filter(j => j.status === 'COMPLETED').length;
    const cancelledCount = this.completedHistory.filter(j => j.status === 'CANCELLED' || j.status === 'TIMED_OUT').length;

    const avgDuration = totalFinished > 0
      ? Math.round(this.completedHistory.reduce((a, b) => a + b.durationMs, 0) / totalFinished)
      : 0;

    return {
      activeWorkersCount: this.jobs.size,
      activeJobs: activeList,
      metrics: {
        totalProcessed: totalFinished,
        completedCount,
        failedCount,
        cancelledCount,
        avgDurationMs: avgDuration
      },
      recentJobs: this.completedHistory.slice(0, 10)
    };
  }
}

const workerMonitor = new WorkerMonitor();

module.exports = workerMonitor;
