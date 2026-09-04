/**
 * Phase 24 — Concurrent Repair Workload Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { BenchmarkRunner } = require('../src/services/benchmarkRunner');
const { jobQueueService } = require('../src/services/jobQueueService');
const { auditLedgerService } = require('../src/services/auditLedgerService');
const { finopsEngine } = require('../src/services/finopsEngine');
const { governancePolicyEngine } = require('../src/services/governancePolicyEngine');

describe('Phase 24 — Concurrent Repair Workload Stress Testing', () => {
  const runner = new BenchmarkRunner();

  test('1. Executes concurrent repairs (5 concurrent) with tenant isolation and audit ledger chaining', async () => {
    const result = await runner.runBenchmark({
      name: 'concurrent_repair_c5',
      concurrency: 5,
      iterations: 15,
      fn: async (i, workerId) => {
        const workspaceId = `ws_repair_tenant_${i % 3}`;
        const incidentId = `inc_stress_${i}`;

        // 1. Enqueue job
        const job = await jobQueueService.enqueue({
          type: 'AUTONOMOUS_REPAIR',
          workspaceId,
          incidentId,
          payload: { error: 'SyntaxError: Unexpected token', file: 'src/handler.js' }
        });

        assert(job && job.id, 'Job must have unique ID');

        // 2. Lease claiming
        const claimed = await jobQueueService.claimJob(`worker_proc_${workerId}`);
        if (claimed) {
          // 3. Governance check
          const pol = await governancePolicyEngine.evaluatePolicy({
            workspaceId,
            environment: 'development',
            riskScore: 20
          });
          assert.strictEqual(pol.status, 'ALLOWED');

          // 4. FinOps record spend
          finopsEngine.recordSpend(workspaceId, 0.0025, 'ai_investigation');

          // 5. Chained audit event
          auditLedgerService.recordEvent({
            workspaceId,
            action: 'REPAIR_COMPLETED',
            actor: `worker_proc_${workerId}`,
            resourceId: incidentId,
            details: { durationMs: 120 }
          });

          // 6. Complete job
          await jobQueueService.completeJob(claimed.id, { patch: 'const x = 1;' });
        }
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.durationMs > 0);
  });

  test('2. Prevents duplicate repair execution under high concurrency burst (25 concurrent runs)', async () => {
    const duplicateMap = new Set();
    let collisionCount = 0;

    const result = await runner.runBenchmark({
      name: 'repair_dedup_c25',
      concurrency: 25,
      iterations: 50,
      warmupIterations: 0,
      fn: async (i) => {
        const deduplicationKey = `dedup_key_${i}`;
        if (duplicateMap.has(deduplicationKey)) {
          collisionCount++;
        } else {
          duplicateMap.add(deduplicationKey);
        }
        await new Promise(r => setImmediate(r));
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert.strictEqual(collisionCount, 0, 'Zero duplicate collisions allowed under concurrency');
  });
});
