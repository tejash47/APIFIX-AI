/**
 * Phase 24 — Queue & Worker Scalability Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { jobQueueService } = require('../src/services/jobQueueService');

describe('Phase 24 — Queue & Worker Scalability Testing', () => {
  beforeEach(() => {
    jobQueueService.clearQueue();
  });

  test('1. Enqueues and drains 50 jobs across distributed workers with zero duplicate claims', async () => {
    const totalJobs = 50;
    const workerCount = 5;

    // 1. Enqueue 50 jobs
    for (let i = 0; i < totalJobs; i++) {
      await jobQueueService.enqueue({
        type: 'STRESS_REPAIR',
        workspaceId: `ws_scale_${i % 5}`,
        incidentId: `inc_${i}`,
        payload: { task: `Task ${i}` }
      });
    }

    assert.strictEqual(jobQueueService.getQueueDepth(), totalJobs);

    // 2. Concurrent workers claim and process jobs
    const claimedJobIds = new Set();
    let collisionCount = 0;
    let completedCount = 0;

    const worker = async (workerId) => {
      while (true) {
        const job = await jobQueueService.claimJob(`worker_${workerId}`);
        if (!job) break;

        if (claimedJobIds.has(job.id)) {
          collisionCount++;
        } else {
          claimedJobIds.add(job.id);
        }

        // Simulate micro work
        await new Promise(r => setImmediate(r));
        await jobQueueService.completeJob(job.id, { result: 'OK' });
        completedCount++;
      }
    };

    const workers = [];
    for (let w = 0; w < workerCount; w++) {
      workers.push(worker(w));
    }

    await Promise.all(workers);

    assert.strictEqual(collisionCount, 0, 'Zero duplicate claims allowed');
    assert.strictEqual(completedCount, totalJobs, 'All 50 jobs must be processed');
    assert.strictEqual(jobQueueService.getQueueDepth(), 0, 'Queue depth must be 0 after draining');
  });

  test('2. Dead-letter queue (DLQ) routing after maximum retries exceeded', async () => {
    const job = await jobQueueService.enqueue({
      type: 'FAILING_JOB',
      workspaceId: 'ws_dlq_test',
      incidentId: 'inc_fail_1',
      maxRetries: 1
    });

    // Attempt 1: Fail (retryCount becomes 1, status RETRYING)
    const claim1 = await jobQueueService.claimJob('worker_dlq');
    assert(claim1 !== null);
    await jobQueueService.failJob(claim1.id, 'worker_dlq', 'Failure attempt 1');

    // Attempt 2: Fail (retryCount >= maxRetries -> DEAD_LETTER)
    const claim2 = await jobQueueService.claimJob('worker_dlq');
    assert(claim2 !== null);
    await jobQueueService.failJob(claim2.id, 'worker_dlq', 'Failure attempt 2 (Final)');

    // Attempt 3: Queue should be empty (job is in DLQ)
    const claim3 = await jobQueueService.claimJob('worker_dlq');
    assert.strictEqual(claim3, null, 'Job must be moved to DLQ and not claimable');

    const dlqJobs = jobQueueService.getDeadLetterJobs();
    assert(dlqJobs.some(j => j.id === job.id), 'Job must be present in dead-letter list');
  });
});
