/**
 * APIFIX AI — Persistent Background Job System & Worker Recovery (Phase 22)
 * 
 * Provides durable job lifecycle management (QUEUED -> CLAIMED -> RUNNING -> SUCCEEDED / FAILED / RETRYING / DEAD_LETTER),
 * worker leases, heartbeat renewal, zombie job crash recovery, deduplication by payload fingerprint,
 * and retry safety controls.
 */

const crypto = require('crypto');
const logger = require('./logger');
const observabilityEngine = require('./observabilityEngine');
const { recordAuditEvent } = require('./auditLedgerService');

const JOB_STATUS = {
  QUEUED: 'QUEUED',
  CLAIMED: 'CLAIMED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
  DEAD_LETTER: 'DEAD_LETTER'
};

class JobQueueService {
  constructor() {
    this.jobs = new Map(); // jobId -> Job
    this.fingerprintIndex = new Map(); // fingerprint -> jobId (for active jobs)
    this.defaultLeaseDurationMs = 30000; // 30s
    this.stats = {
      enqueuedTotal: 0,
      claimedTotal: 0,
      succeededTotal: 0,
      failedTotal: 0,
      retriedTotal: 0,
      deadLetterTotal: 0,
      recoveredZombieTotal: 0,
      deduplicatedTotal: 0
    };
  }

  /**
   * Computes deterministic payload fingerprint (SHA-256).
   */
  _computeFingerprint(workspaceId, type, payload = {}) {
    const raw = `${workspaceId}:${type}:${JSON.stringify(payload)}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Enqueues a new background job with deduplication and idempotency.
   */
  async enqueueJob({
    workspaceId = 'default_ws',
    projectId = null,
    type = 'REPAIR_INVESTIGATION',
    payload = {},
    maxRetries = 3,
    correlationId = null,
    isIdempotent = true
  } = {}) {
    const fingerprint = this._computeFingerprint(workspaceId, type, payload);

    // Deduplication check: if an identical job is currently active, return existing job
    const activeExistingId = this.fingerprintIndex.get(fingerprint);
    if (activeExistingId) {
      const existing = this.jobs.get(activeExistingId);
      if (existing && (existing.status === JOB_STATUS.QUEUED || existing.status === JOB_STATUS.CLAIMED || existing.status === JOB_STATUS.RUNNING)) {
        this.stats.deduplicatedTotal++;
        logger.info('job_enqueue_deduplicated', {
          jobId: existing.jobId,
          fingerprint,
          type
        });
        return { job: existing, deduplicated: true };
      }
    }

    const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const job = {
      id: jobId,
      jobId,
      workspaceId,
      projectId,
      type,
      payload,
      payloadFingerprint: fingerprint,
      status: JOB_STATUS.QUEUED,
      createdAt: new Date().toISOString(),
      claimedAt: null,
      startedAt: null,
      completedAt: null,
      workerId: null,
      leaseExpiresAt: null,
      retryCount: 0,
      maxRetries: isIdempotent ? maxRetries : 0, // Non-idempotent operations are not automatically retried
      isIdempotent,
      correlationId: correlationId || `corr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      result: null,
      error: null
    };

    this.jobs.set(jobId, job);
    this.fingerprintIndex.set(fingerprint, jobId);
    this.stats.enqueuedTotal++;

    logger.info('job_enqueued', {
      jobId,
      type,
      workspaceId,
      isIdempotent,
      fingerprint
    });

    try {
      recordAuditEvent({
        workspaceId,
        eventType: 'JOB_ENQUEUED',
        actor: { type: 'SYSTEM', id: 'job_queue' },
        details: { jobId, type, isIdempotent, correlationId: job.correlationId }
      });
    } catch {
      // Ignore
    }

    return { job, deduplicated: false };
  }

  /**
   * Claims the next available QUEUED or RETRYING job for a worker with a timed lease.
   */
  async claimJob(workerId, leaseDurationMs = this.defaultLeaseDurationMs, filter = {}) {
    const now = Date.now();

    for (const job of this.jobs.values()) {
      if (filter.workspaceId && job.workspaceId !== filter.workspaceId) continue;
      if (filter.type && job.type !== filter.type) continue;
      if (job.status === JOB_STATUS.QUEUED || job.status === JOB_STATUS.RETRYING) {
        job.status = JOB_STATUS.CLAIMED;
        job.workerId = workerId;
        job.claimedAt = new Date().toISOString();
        job.leaseExpiresAt = new Date(now + leaseDurationMs).toISOString();

        this.stats.claimedTotal++;
        logger.info('job_claimed', {
          jobId: job.jobId,
          workerId,
          leaseExpiresAt: job.leaseExpiresAt
        });
        return job;
      }
    }

    return null;
  }

  /**
   * Starts job execution after claiming.
   */
  async startJob(jobId, workerId) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.workerId !== workerId) throw new Error(`Worker lease mismatch for job ${jobId}`);

    job.status = JOB_STATUS.RUNNING;
    job.startedAt = new Date().toISOString();

    logger.info('job_running', { jobId, workerId });
    return job;
  }

  /**
   * Renews the active lease heartbeat for a long-running job.
   */
  async renewLease(jobId, workerId, extendMs = this.defaultLeaseDurationMs) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.workerId !== workerId) throw new Error(`Worker lease mismatch for job ${jobId}`);
    if (job.status !== JOB_STATUS.CLAIMED && job.status !== JOB_STATUS.RUNNING) {
      throw new Error(`Cannot renew lease for job in state: ${job.status}`);
    }

    job.leaseExpiresAt = new Date(Date.now() + extendMs).toISOString();
    return { success: true, leaseExpiresAt: job.leaseExpiresAt };
  }

  /**
   * Marks a job as SUCCEEDED.
   */
  async completeJob(jobId, workerId, result = {}) {
    if (typeof workerId === 'object' && workerId !== null) {
      result = workerId;
      workerId = undefined;
    }

    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (workerId && job.workerId && job.workerId !== workerId) {
      throw new Error(`Worker mismatch for job ${jobId}`);
    }

    const actualWorkerId = workerId || job.workerId || 'system_worker';

    job.status = JOB_STATUS.SUCCEEDED;
    job.completedAt = new Date().toISOString();
    job.result = result;
    job.leaseExpiresAt = null;

    this.fingerprintIndex.delete(job.payloadFingerprint);
    this.stats.succeededTotal++;

    logger.info('job_succeeded', { jobId, workerId: actualWorkerId });

    try {
      recordAuditEvent({
        workspaceId: job.workspaceId,
        eventType: 'JOB_SUCCEEDED',
        actor: { type: 'WORKER', id: actualWorkerId },
        details: { jobId, type: job.type }
      });
    } catch {
      // Ignore
    }

    return job;
  }

  /**
   * Handles job failure with retry classification.
   */
  async failJob(jobId, workerId, error = {}, isTransient = true) {
    if (typeof workerId !== 'string') {
      isTransient = typeof error === 'boolean' ? error : true;
      error = workerId || {};
      workerId = undefined;
    }

    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const actualWorkerId = workerId || job.workerId || 'system_worker';

    const errorDetails = {
      message: typeof error === 'string' ? error : (error.message || String(error)),
      code: error.code || 'JOB_EXECUTION_ERROR',
      timestamp: new Date().toISOString()
    };

    job.error = errorDetails;

    // Retry classification: only retry if transient, idempotent, and retryCount < maxRetries
    const canRetry = isTransient && job.isIdempotent && job.retryCount < job.maxRetries;

    if (canRetry) {
      job.retryCount++;
      job.status = JOB_STATUS.RETRYING;
      job.workerId = null;
      job.leaseExpiresAt = null;
      this.stats.retriedTotal++;
      logger.warn('job_retrying', {
        jobId,
        retryCount: job.retryCount,
        maxRetries: job.maxRetries,
        error: errorDetails.message
      });
    } else {
      job.completedAt = new Date().toISOString();
      job.leaseExpiresAt = null;
      this.fingerprintIndex.delete(job.payloadFingerprint);

      if (job.retryCount >= job.maxRetries && job.maxRetries > 0) {
        job.status = JOB_STATUS.DEAD_LETTER;
        this.stats.deadLetterTotal++;
        logger.error('job_dead_lettered', { jobId, retries: job.retryCount, error: errorDetails });
      } else {
        job.status = JOB_STATUS.FAILED;
        this.stats.failedTotal++;
        logger.error('job_failed_permanently', { jobId, error: errorDetails });
      }

      try {
        recordAuditEvent({
          workspaceId: job.workspaceId,
          eventType: job.status === JOB_STATUS.DEAD_LETTER ? 'JOB_DEAD_LETTERED' : 'JOB_FAILED',
          actor: { type: 'WORKER', id: workerId },
          details: { jobId, type: job.type, error: errorDetails }
        });
      } catch {
        // Ignore
      }
    }

    return job;
  }

  /**
   * Scans and recovers abandoned/zombie jobs whose worker lease has expired (simulated process crash).
   */
  async recoverAbandonedJobs() {
    const now = Date.now();
    const recovered = [];

    for (const job of this.jobs.values()) {
      if ((job.status === JOB_STATUS.CLAIMED || job.status === JOB_STATUS.RUNNING) && job.leaseExpiresAt) {
        const leaseTime = new Date(job.leaseExpiresAt).getTime();
        if (now > leaseTime) {
          logger.warn('zombie_job_lease_expired_recovering', {
            jobId: job.jobId,
            workerId: job.workerId,
            leaseExpiresAt: job.leaseExpiresAt
          });

          if (job.isIdempotent && job.retryCount < job.maxRetries) {
            job.retryCount++;
            job.status = JOB_STATUS.RETRYING;
            job.workerId = null;
            job.leaseExpiresAt = null;
            this.stats.retriedTotal++;
          } else {
            job.status = JOB_STATUS.DEAD_LETTER;
            job.completedAt = new Date().toISOString();
            job.leaseExpiresAt = null;
            this.fingerprintIndex.delete(job.payloadFingerprint);
            this.stats.deadLetterTotal++;
          }

          this.stats.recoveredZombieTotal++;
          recovered.push(job.jobId);
        }
      }
    }

    return { recoveredCount: recovered.length, recoveredJobIds: recovered };
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  listJobs(filter = {}) {
    let list = Array.from(this.jobs.values());
    if (filter.workspaceId) list = list.filter(j => j.workspaceId === filter.workspaceId);
    if (filter.status) list = list.filter(j => j.status === filter.status);
    if (filter.type) list = list.filter(j => j.type === filter.type);
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getQueueTelemetry() {
    const counts = {
      queued: 0,
      claimed: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      retrying: 0,
      deadLetter: 0
    };

    for (const job of this.jobs.values()) {
      const s = job.status.toLowerCase();
      if (counts[s] !== undefined) counts[s]++;
      if (job.status === JOB_STATUS.DEAD_LETTER) counts.deadLetter++;
    }

    return {
      queueDepth: counts.queued + counts.retrying,
      activeProcessing: counts.claimed + counts.running,
      statusCounts: counts,
      stats: this.stats,
      totalTracked: this.jobs.size,
      totalEnqueued: this.stats.enqueuedTotal,
      timestamp: new Date().toISOString()
    };
  }

  getQueueStats() {
    return this.getQueueTelemetry();
  }

  async enqueue(opts = {}) {
    const res = await this.enqueueJob(opts);
    return res.job;
  }

  getQueueDepth() {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === JOB_STATUS.QUEUED || job.status === JOB_STATUS.RETRYING) {
        count++;
      }
    }
    return count;
  }

  getDeadLetterJobs() {
    const dlq = [];
    for (const job of this.jobs.values()) {
      if (job.status === JOB_STATUS.DEAD_LETTER) {
        dlq.push(job);
      }
    }
    return dlq;
  }

  async reapExpiredLeases() {
    return this.recoverAbandonedJobs();
  }

  clearQueue() {
    this.jobs.clear();
    this.fingerprintIndex.clear();
  }
}

const jobQueueService = new JobQueueService();

module.exports = {
  jobQueueService,
  JOB_STATUS
};
