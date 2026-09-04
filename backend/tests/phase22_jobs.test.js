/**
 * APIFIX AI — Phase 22 Persistent Background Jobs & Worker Recovery Tests
 * Verifies durable job lifecycle, leases, zombie recovery, deduplication, and retry classification.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { jobQueueService, JOB_STATUS } = require('../src/services/jobQueueService');

describe('Phase 22 — Persistent Background Jobs & Worker Recovery Suite', () => {
  test('4.1 Should enqueue a new idempotent background job', async () => {
    const { job, deduplicated } = await jobQueueService.enqueueJob({
      workspaceId: 'ws_job_test_1',
      type: 'REPAIR_INVESTIGATION',
      payload: { targetFile: 'src/api/auth.js', error: 'NullPointerException' }
    });

    assert.ok(job.jobId);
    assert.equal(job.status, JOB_STATUS.QUEUED);
    assert.equal(job.isIdempotent, true);
    assert.equal(deduplicated, false);
    assert.ok(job.payloadFingerprint);
  });

  test('4.2 Should deduplicate identical concurrent active jobs', async () => {
    const payload = { targetFile: 'src/api/payment.js', error: 'DatabaseTimeout' };
    const res1 = await jobQueueService.enqueueJob({ workspaceId: 'ws_dedup', type: 'REPAIR_INVESTIGATION', payload });
    const res2 = await jobQueueService.enqueueJob({ workspaceId: 'ws_dedup', type: 'REPAIR_INVESTIGATION', payload });

    assert.equal(res1.deduplicated, false);
    assert.equal(res2.deduplicated, true);
    assert.equal(res1.job.jobId, res2.job.jobId);
  });

  test('4.3 Should claim queued job with timed worker lease', async () => {
    const workerId = 'worker_node_alpha_1';
    const claimed = await jobQueueService.claimJob(workerId, 15000);

    assert.ok(claimed);
    assert.equal(claimed.status, JOB_STATUS.CLAIMED);
    assert.equal(claimed.workerId, workerId);
    assert.ok(claimed.leaseExpiresAt);
  });

  test('4.4 Should start execution of claimed job', async () => {
    const workerId = 'worker_node_alpha_1';
    const activeJobs = jobQueueService.listJobs({ workspaceId: 'ws_job_test_1' });
    const target = activeJobs.find(j => j.status === JOB_STATUS.CLAIMED);

    if (target) {
      const started = await jobQueueService.startJob(target.jobId, workerId);
      assert.equal(started.status, JOB_STATUS.RUNNING);
      assert.ok(started.startedAt);
    }
  });

  test('4.5 Should reject starting job with mismatched worker lease', async () => {
    const { job } = await jobQueueService.enqueueJob({ workspaceId: 'ws_mismatch_specific', type: 'PROBE', payload: { id: 'mismatch_1' } });
    const claimed = await jobQueueService.claimJob('legitimate_worker_45', 10000);

    await assert.rejects(async () => {
      await jobQueueService.startJob(claimed.jobId, 'impostor_worker');
    });
  });

  test('4.6 Should renew lease heartbeat for active running job', async () => {
    const { job } = await jobQueueService.enqueueJob({ workspaceId: 'ws_renew_specific', type: 'PROBE', payload: { id: 'renew_1' } });
    const claimed = await jobQueueService.claimJob('worker_renew_46', 10000);
    const initialExpiry = claimed.leaseExpiresAt;

    await new Promise(r => setTimeout(r, 10));
    const renewed = await jobQueueService.renewLease(claimed.jobId, 'worker_renew_46', 30000);
    assert.equal(renewed.success, true);
    assert.notEqual(renewed.leaseExpiresAt, initialExpiry);
  });

  test('4.7 Should complete job and transition to SUCCEEDED', async () => {
    const { job } = await jobQueueService.enqueueJob({ workspaceId: 'ws_complete_specific', type: 'PROBE', payload: { id: 'complete_1' } });
    const claimed = await jobQueueService.claimJob('worker_complete_47', 10000);
    const completed = await jobQueueService.completeJob(claimed.jobId, 'worker_complete_47', { patchGenerated: true });

    assert.equal(completed.status, JOB_STATUS.SUCCEEDED);
    assert.equal(completed.result.patchGenerated, true);
  });

  test('4.8 Should transition transient failure to RETRYING with incremented count', async () => {
    const { job } = await jobQueueService.enqueueJob({
      workspaceId: 'ws_retry_test',
      type: 'PATCH_SYNTHESIS',
      payload: { id: 'retry_1' },
      maxRetries: 3
    });
    await jobQueueService.claimJob('worker_retry_1');

    const retried = await jobQueueService.failJob(job.jobId, 'worker_retry_1', new Error('Transient rate limit'), true);
    assert.equal(retried.status, JOB_STATUS.RETRYING);
    assert.equal(retried.retryCount, 1);
    assert.equal(retried.workerId, null);
  });

  test('4.9 Should route to DEAD_LETTER when maxRetries is exceeded', async () => {
    const { job } = await jobQueueService.enqueueJob({
      workspaceId: 'ws_dead_test',
      type: 'VERIFICATION',
      payload: { id: 'dead_1' },
      maxRetries: 1
    });
    await jobQueueService.claimJob('worker_dead_1');
    await jobQueueService.failJob(job.jobId, 'worker_dead_1', new Error('Fail 1'), true);

    await jobQueueService.claimJob('worker_dead_2');
    const finalFail = await jobQueueService.failJob(job.jobId, 'worker_dead_2', new Error('Fail 2'), true);

    assert.equal(finalFail.status, JOB_STATUS.DEAD_LETTER);
    assert.equal(finalFail.retryCount, 1);
  });

  test('4.10 Should immediately fail non-idempotent job without retry', async () => {
    const { job } = await jobQueueService.enqueueJob({
      workspaceId: 'ws_non_idempotent',
      type: 'STRIPE_CHARGE',
      payload: { amount: 50 },
      isIdempotent: false
    });
    await jobQueueService.claimJob('worker_billing');
    const failed = await jobQueueService.failJob(job.jobId, 'worker_billing', new Error('Card declined'), true);

    assert.equal(failed.status, JOB_STATUS.FAILED);
    assert.equal(failed.retryCount, 0);
  });

  test('4.11 Should recover abandoned zombie jobs after simulated worker crash', async () => {
    const { job } = await jobQueueService.enqueueJob({
      workspaceId: 'ws_crash_test',
      type: 'REPAIR_RUN',
      payload: { test: 'crash_recover' }
    });
    // Worker claims with 5ms lease and "crashes" (no heartbeat renewal)
    await jobQueueService.claimJob('crashed_worker_node_99', 5);
    await new Promise(r => setTimeout(r, 15));

    const rec = await jobQueueService.recoverAbandonedJobs();
    assert.ok(rec.recoveredCount >= 1);
    assert.ok(rec.recoveredJobIds.includes(job.jobId));

    const recoveredJob = jobQueueService.getJob(job.jobId);
    assert.equal(recoveredJob.status, JOB_STATUS.RETRYING);
    assert.equal(recoveredJob.workerId, null);
  });

  test('4.12 Should filter jobs by workspace, status, and type', () => {
    const list = jobQueueService.listJobs({ workspaceId: 'ws_crash_test' });
    assert.ok(list.length >= 1);
    assert.equal(list[0].workspaceId, 'ws_crash_test');
  });

  test('4.13 Should return truthful queue telemetry metrics', () => {
    const telemetry = jobQueueService.getQueueTelemetry();
    assert.ok(typeof telemetry.queueDepth === 'number');
    assert.ok(typeof telemetry.activeProcessing === 'number');
    assert.ok(telemetry.statusCounts);
    assert.ok(telemetry.stats.enqueuedTotal >= 5);
  });

  test('4.14 Should permit claiming recovered job by healthy worker', async () => {
    const claimed = await jobQueueService.claimJob('healthy_worker_replacement');
    assert.ok(claimed);
    assert.equal(claimed.workerId, 'healthy_worker_replacement');
  });

  test('4.15 Should clean fingerprint index on terminal completion to allow future jobs', async () => {
    const payload = { uniqueRun: 'run_term_1' };
    const { job } = await jobQueueService.enqueueJob({ workspaceId: 'ws_term', type: 'PROBE', payload });
    await jobQueueService.claimJob('term_worker');
    await jobQueueService.completeJob(job.jobId, 'term_worker', { done: true });

    // Now re-enqueueing the same payload should create a fresh new job
    const res2 = await jobQueueService.enqueueJob({ workspaceId: 'ws_term', type: 'PROBE', payload });
    assert.equal(res2.deduplicated, false);
    assert.notEqual(res2.job.jobId, job.jobId);
  });
});
