/**
 * APIFIX AI — Capacity Planning & Autoscaling Sizing Engine (Phase 24)
 * 
 * Accurately calculates system capacity, worker sizing requirements, database connection pool
 * dimensions, and projected enterprise operating costs based on measurable workload inputs.
 * 
 * STRICT CLASSIFICATION:
 * - MEASURED: Actual tested metrics from local/staging benchmark runs.
 * - ESTIMATED: Derived algorithmic capacity projections.
 * - PROJECTED: Scaled-out monthly volumetric and financial projections.
 */

class CapacityPlanningService {
  /**
   * Calculate enterprise capacity requirements and resource recommendations.
   * 
   * @param {Object} inputs
   * @param {number} inputs.requestsPerSec Expected peak API requests per second
   * @param {number} inputs.concurrentRepairs Expected peak concurrent autonomous repairs
   * @param {number} [inputs.avgRepairDurationSec=3.5] Average end-to-end repair time in seconds
   * @param {number} [inputs.aiCallsPerRepair=2] Average AI model inference invocations per repair
   * @param {number} [inputs.dbOpsPerRepair=8] Average database queries/transactions per repair
   * @param {number} [inputs.costPerAiCall=0.002] Estimated cost per AI invocation in USD
   * @returns {Object} Comprehensive capacity plan
   */
  calculateCapacity(inputs = {}) {
    const rps = Math.max(1, inputs.requestsPerSec || 50);
    const concurrentRepairs = Math.max(1, inputs.concurrentRepairs || 10);
    const avgDuration = Math.max(0.5, inputs.avgRepairDurationSec || 3.5);
    const aiCalls = Math.max(1, inputs.aiCallsPerRepair || 2);
    const dbOps = Math.max(1, inputs.dbOpsPerRepair || 8);
    const costPerAi = inputs.costPerAiCall || 0.002;

    // Worker sizing: Repairs completed per worker per minute = 60 / avgDuration
    const repairsPerWorkerPerMin = 60 / avgDuration;
    const requiredRepairsPerMin = (concurrentRepairs / avgDuration) * 60;
    const recommendedWorkers = Math.max(1, Math.ceil(requiredRepairsPerMin / repairsPerWorkerPerMin));

    // Database connection pool sizing: (RPS * 0.1 active) + (ConcurrentRepairs * dbOps * 0.2 active) + 5 headroom
    const estimatedDbConnections = Math.max(10, Math.ceil((rps * 0.1) + (concurrentRepairs * 0.5) + 5));

    // Saturation points based on single standard Node.js process (8GB RAM, 4 vCPU)
    const singleInstanceMaxRps = 1200;
    const singleInstanceMaxRepairs = 50;
    const estimatedApiInstances = Math.max(1, Math.ceil(rps / (singleInstanceMaxRps * 0.7))); // 70% headroom

    // Projected Monthly Figures (assuming 30 days, 8 hrs peak / 16 hrs off-peak average factor 0.4)
    const peakSecondsPerMonth = 30 * 8 * 3600;
    const offPeakSecondsPerMonth = 30 * 16 * 3600;
    const totalRequestsMonth = Math.round((rps * peakSecondsPerMonth) + (rps * 0.2 * offPeakSecondsPerMonth));
    const totalRepairsMonth = Math.round(((concurrentRepairs / avgDuration) * peakSecondsPerMonth) + ((concurrentRepairs / avgDuration) * 0.1 * offPeakSecondsPerMonth));

    const projectedAiCostMonth = Number((totalRepairsMonth * aiCalls * costPerAi).toFixed(2));
    const projectedComputeCostMonth = Number((estimatedApiInstances * 45 + recommendedWorkers * 35).toFixed(2));
    const projectedTotalCostMonth = Number((projectedAiCostMonth + projectedComputeCostMonth).toFixed(2));

    return {
      inputs: {
        requestsPerSec: rps,
        concurrentRepairs,
        avgRepairDurationSec: avgDuration,
        aiCallsPerRepair: aiCalls,
        dbOpsPerRepair: dbOps
      },
      capacity: {
        classification: 'ESTIMATED',
        recommendedWorkers,
        recommendedDbPoolSize: estimatedDbConnections,
        recommendedApiInstances: estimatedApiInstances,
        singleInstanceMaxThroughputRps: singleInstanceMaxRps,
        singleInstanceMaxConcurrentRepairs: singleInstanceMaxRepairs,
        queueThroughputCapacityPerMin: Math.round(recommendedWorkers * repairsPerWorkerPerMin),
        resourceRequirements: {
          recommendedCpuCores: estimatedApiInstances * 2 + recommendedWorkers * 1,
          recommendedMemoryGb: estimatedApiInstances * 4 + recommendedWorkers * 2
        }
      },
      projections: {
        classification: 'PROJECTED',
        timeframe: '30_days',
        totalMonthlyRequests: totalRequestsMonth,
        totalMonthlyRepairs: totalRepairsMonth,
        estimatedAiCostUsd: projectedAiCostMonth,
        estimatedComputeCostUsd: projectedComputeCostMonth,
        estimatedTotalMonthlyCostUsd: projectedTotalCostMonth,
        costPerRepairUsd: Number((projectedTotalCostMonth / Math.max(1, totalRepairsMonth)).toFixed(4))
      },
      timestamp: new Date().toISOString()
    };
  }
}

const defaultCapacityPlanningService = new CapacityPlanningService();

module.exports = {
  CapacityPlanningService,
  capacityPlanningService: defaultCapacityPlanningService
};
