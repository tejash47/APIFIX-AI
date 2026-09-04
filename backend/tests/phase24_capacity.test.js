/**
 * Phase 24 — Capacity Planning & Resource Sizing Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { CapacityPlanningService } = require('../src/services/capacityPlanningService');

describe('Phase 24 — Capacity Planning & Resource Sizing Engine', () => {
  const service = new CapacityPlanningService();

  test('1. Calculates worker pool sizing and database connections based on workload inputs', () => {
    const plan = service.calculateCapacity({
      requestsPerSec: 100,
      concurrentRepairs: 20,
      avgRepairDurationSec: 4.0,
      aiCallsPerRepair: 2,
      dbOpsPerRepair: 10
    });

    assert.strictEqual(plan.capacity.classification, 'ESTIMATED');
    assert.strictEqual(plan.projections.classification, 'PROJECTED');
    assert(plan.capacity.recommendedWorkers >= 2, 'Must recommend at least 2 workers');
    assert(plan.capacity.recommendedDbPoolSize >= 15, 'Must recommend adequate DB pool');
    assert(plan.capacity.recommendedApiInstances >= 1);
    assert(plan.projections.estimatedTotalMonthlyCostUsd > 0);
  });

  test('2. Adapts capacity recommendations under high-throughput burst conditions', () => {
    const highLoadPlan = service.calculateCapacity({
      requestsPerSec: 2500,
      concurrentRepairs: 100,
      avgRepairDurationSec: 3.0
    });

    assert(highLoadPlan.capacity.recommendedApiInstances >= 3, 'Must recommend multi-node API cluster for 2500 RPS');
    assert(highLoadPlan.capacity.recommendedWorkers >= 5, 'Must scale worker count for 100 concurrent repairs');
    assert(highLoadPlan.projections.totalMonthlyRequests > 1000000);
  });
});
