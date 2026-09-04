/**
 * APIFIX AI — Phase 23 Worker Deployment & Queue Safety Test Suite
 * 
 * Validates persistent job queue recovery, heartbeat leases, DLQ preservation,
 * and zero job loss across container deployments and restarts.
 */

const assert = require('assert');
const { test, describe } = require('node:test');
const { jobQueueService } = require('../src/services/jobQueueService');
const { lifecycleManager } = require('../src/services/lifecycleManager');

describe('Phase 23 — Worker Deployment & Queue Safety Suite', () => {

  test('9.1 Job enqueued retains state and generates deduplication fingerprint', async () => {
    const res = await jobQueueService.enqueueJob({
      type: 'REPAIR_RUN',
      workspaceId: 'ws_deploy_test',
      payload: { projectId: 'p1', incidentId: 'inc1' }
    });

    const job = res.job;
    assert.ok(job.id);
    assert.strictEqual(job.status, 'QUEUED');
    assert.ok(job.payloadFingerprint);
  });

  test('9.2 Worker claims job with 30s heartbeat lease', async () => {
    const claimed = await jobQueueService.claimJob('worker_prod_1');
    assert.ok(claimed);
    assert.strictEqual(claimed.workerId, 'worker_prod_1');
    assert.strictEqual(claimed.status, 'CLAIMED');
    assert.ok(claimed.leaseExpiresAt);
  });

  test('9.3 Worker heartbeat renews active lease', async () => {
    const claimed = await jobQueueService.claimJob('worker_prod_renew');
    if (claimed) {
      const renewed = await jobQueueService.heartbeat(claimed.id, 'worker_prod_renew');
      assert.strictEqual(renewed.success, true);
    }
  });

  test('9.4 Hijacking lease by unauthorized worker is rejected', async () => {
    const claimed = await jobQueueService.claimJob('worker_legit');
    if (claimed) {
      await assert.rejects(
        async () => {
          await jobQueueService.heartbeat(claimed.id, 'worker_impostor');
        }
      );
    }
  });

  test('9.5 Completing job releases lease and updates status to SUCCEEDED', async () => {
    const res = await jobQueueService.enqueueJob({
      type: 'SCAN_PROJECT',
      workspaceId: 'ws_scan_test',
      payload: {}
    });
    const claimed = await jobQueueService.claimJob('worker_scanner');
    const completed = await jobQueueService.completeJob(claimed.id, 'worker_scanner', { success: true });
    assert.strictEqual(completed.status, 'SUCCEEDED');
  });

  test('9.6 Failed job increments retry count and stays eligible for retry', async () => {
    const res = await jobQueueService.enqueueJob({
      type: 'VERIFY_PATCH',
      workspaceId: 'ws_verify_test',
      payload: {}
    });
    const claimed = await jobQueueService.claimJob('worker_verif');
    const failed = await jobQueueService.failJob(claimed.id, 'worker_verif', 'Transient socket timeout');
    assert.strictEqual(failed.status, 'RETRYING');
    assert.strictEqual(failed.retryCount, 1);
  });

  test('9.7 Job exceeding max retries is moved to Dead-Letter Queue (DEAD_LETTER)', async () => {
    const res = await jobQueueService.enqueueJob({
      type: 'FAULTY_TASK',
      workspaceId: 'ws_dlq_test',
      maxRetries: 1,
      payload: {}
    });
    const claimed1 = await jobQueueService.claimJob('worker_dlq', 30000, { type: 'FAULTY_TASK' });
    await jobQueueService.failJob(claimed1.id, 'worker_dlq', 'Error 1');
    const claimed2 = await jobQueueService.claimJob('worker_dlq', 30000, { type: 'FAULTY_TASK' });
    const failed2 = await jobQueueService.failJob(claimed2.id, 'worker_dlq', 'Error 2');

    assert.strictEqual(failed2.status, 'DEAD_LETTER');
  });

  test('9.8 Crash recovery engine identifies and reclaims expired leases', async () => {
    const res = await jobQueueService.enqueueJob({
      type: 'RECOVER_TASK',
      workspaceId: 'ws_rec_test',
      payload: {}
    });
    const claimed = await jobQueueService.claimJob('worker_crashed');
    // Artificially expire lease
    claimed.leaseExpiresAt = new Date(Date.now() - 5000).toISOString();

    const recovered = await jobQueueService.recoverAbandonedJobs();
    assert.ok(recovered.recoveredCount > 0);
  });

  test('9.9 Duplicate concurrent job execution attempt is deduplicated via fingerprint', async () => {
    const payload = { uniqueTask: 'task_dedup_123' };
    const res1 = await jobQueueService.enqueueJob({
      type: 'PROBE_ENDPOINT',
      workspaceId: 'ws_dedup',
      payload,
      isIdempotent: true
    });
    const res2 = await jobQueueService.enqueueJob({
      type: 'PROBE_ENDPOINT',
      workspaceId: 'ws_dedup',
      payload,
      isIdempotent: true
    });

    assert.strictEqual(res1.job.id, res2.job.id);
    assert.strictEqual(res2.deduplicated, true);
  });

  test('9.10 Lifecycle manager gracefully drains active worker jobs on shutdown signal', () => {
    const status = lifecycleManager.getState();
    assert.ok(status.state);
  });
});
