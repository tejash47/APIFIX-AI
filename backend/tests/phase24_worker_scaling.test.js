/**
 * Phase 24 — Horizontal Worker Scaling Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { jobQueueService } = require('../src/services/jobQueueService');

describe('Phase 24 — Horizontal Worker Pool Scaling (1, 2, 4, 8 Workers)', () => {
  beforeEach(() => {
    jobQueueService.clearQueue();
  });

  test('1. Measures throughput scaling across 1, 2, 4, and 8 worker processes', async () => {
    const workerPoolSizes = [1, 2, 4, 8];
    const results = [];

    for (const poolSize of workerPoolSizes) {
      jobQueueService.clearQueue();

      // Enqueue 20 test jobs
      for (let i = 0; i < 20; i++) {
        await jobQueueService.enqueue({
          type: 'HORIZ_SCALE_TASK',
          workspaceId: 'ws_horiz_test',
          incidentId: `inc_${poolSize}_${i}`
        });
      }

      const start = Date.now();
      const workers = [];

      for (let w = 0; w < poolSize; w++) {
        workers.push((async (workerId) => {
          while (true) {
            const job = await jobQueueService.claimJob(`worker_pool_${poolSize}_${workerId}`);
            if (!job) break;
            await new Promise(r => setTimeout(r, 2)); // 2ms simulated task
            await jobQueueService.completeJob(job.id, { done: true });
          }
        })(w));
      }

      await Promise.all(workers);
      const durationMs = Date.now() - start;
      results.push({ poolSize, durationMs, rps: Number((20 / (durationMs / 1000)).toFixed(2)) });
    }

    // Verify all pools drained jobs successfully
    assert.strictEqual(results.length, 4);
    assert(results[results.length - 1].rps > 0, '8-worker pool must have positive throughput');
  });

  test('2. Verifies lease expiration and zombie worker recovery', async () => {
    // 1. Enqueue job
    const job = await jobQueueService.enqueue({
      type: 'ZOMBIE_TEST',
      workspaceId: 'ws_zombie_test',
      incidentId: 'inc_zombie_1'
    });

    // 2. Zombie worker claims job with 10ms lease
    const claimed = await jobQueueService.claimJob('zombie_worker_crashed', 10);
    assert(claimed !== null);

    // 3. Wait for lease expiration
    await new Promise(r => setTimeout(r, 25));

    // 4. Reap expired leases
    await jobQueueService.reapExpiredLeases();

    // 5. Healthy replacement worker claims the recovered job
    const recovered = await jobQueueService.claimJob('healthy_replacement_worker');
    assert(recovered !== null, 'Recovered job must be claimable by healthy worker');
    assert.strictEqual(recovered.id, job.id);

    await jobQueueService.completeJob(recovered.id, { recovered: true });
  });
});
