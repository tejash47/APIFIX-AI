/**
 * APIFIX AI — SLO & Error Budget Engine (Phase 16)
 * Calculates service level objectives, uptime availability, latency compliance,
 * repair success rates, and remaining error budgets with workspace scoping.
 */

const observabilityEngine = require('./observabilityEngine');

class SloEngine {
  constructor() {
    this.workspaceTargets = new Map();
    this.defaultTargets = {
      availabilityTargetPercent: 99.9,
      latencyTargetMs: 250,
      latencyCompliancePercent: 95.0,
      repairSuccessTargetPercent: 90.0,
      webhookProcessingTargetMs: 500
    };
  }

  /**
   * Sets custom SLO targets for a workspace
   * @param {string} workspaceId
   * @param {object} targets
   */
  setWorkspaceTargets(workspaceId, targets = {}) {
    const merged = {
      ...this.defaultTargets,
      ...(this.workspaceTargets.get(workspaceId) || {}),
      ...targets
    };
    this.workspaceTargets.set(workspaceId, merged);
    return merged;
  }

  /**
   * Gets active SLO targets for a workspace
   * @param {string} [workspaceId]
   */
  getTargets(workspaceId) {
    if (workspaceId && this.workspaceTargets.has(workspaceId)) {
      return this.workspaceTargets.get(workspaceId);
    }
    return { ...this.defaultTargets };
  }

  /**
   * Calculates real-time SLO compliance and error budgets
   * @param {string} [workspaceId]
   */
  calculateSloStatus(workspaceId) {
    const targets = this.getTargets(workspaceId);
    const operational = observabilityEngine.getOperationalSummary(workspaceId);
    const latencyMetrics = operational.latencies;

    // 1. Availability calculation
    const totalRequests = operational.counters.totalEvents || 0;
    const errorCount = operational.counters.errors || 0;
    const successfulRequests = Math.max(0, totalRequests - errorCount);

    const actualAvailability = totalRequests > 0
      ? Number(((successfulRequests / totalRequests) * 100).toFixed(2))
      : 100.0;

    // Error budget calculation
    // Allowed failure rate = (100 - target)
    // Actual failure rate = (100 - actual)
    const allowedFailureRate = Math.max(0.01, 100 - targets.availabilityTargetPercent);
    const actualFailureRate = Math.max(0, 100 - actualAvailability);
    const errorBudgetBurnedPercent = Number(((actualFailureRate / allowedFailureRate) * 100).toFixed(1));
    const errorBudgetRemainingPercent = Math.max(0, Math.min(100, Number((100 - errorBudgetBurnedPercent).toFixed(1))));

    // 2. Latency compliance calculation
    const httpSamples = observabilityEngine.latencies.http || [];
    const underTargetCount = httpSamples.filter(ms => ms <= targets.latencyTargetMs).length;
    const actualLatencyCompliance = httpSamples.length > 0
      ? Number(((underTargetCount / httpSamples.length) * 100).toFixed(1))
      : 100.0;

    // 3. Autonomous Repair Success calculation
    const repairsStarted = operational.counters.repairsStarted || 0;
    const repairsVerified = operational.counters.repairsVerified || 0;
    const actualRepairSuccessRate = repairsStarted > 0
      ? Number(((repairsVerified / repairsStarted) * 100).toFixed(1))
      : 100.0;

    // 4. Overall status determination
    let overallStatus = 'COMPLIANT';
    if (errorBudgetRemainingPercent <= 0 || actualAvailability < targets.availabilityTargetPercent) {
      overallStatus = 'BREACHED';
    } else if (errorBudgetRemainingPercent < 30 || actualLatencyCompliance < targets.latencyCompliancePercent) {
      overallStatus = 'AT_RISK';
    }

    return {
      workspaceId: workspaceId || 'global',
      overallStatus,
      timestamp: new Date().toISOString(),
      objectives: {
        availability: {
          targetPercent: targets.availabilityTargetPercent,
          actualPercent: actualAvailability,
          errorBudgetRemainingPercent,
          errorBudgetBurnedPercent,
          status: actualAvailability >= targets.availabilityTargetPercent ? 'MET' : 'MISSED'
        },
        latency: {
          targetThresholdMs: targets.latencyTargetMs,
          complianceTargetPercent: targets.latencyCompliancePercent,
          actualCompliancePercent: actualLatencyCompliance,
          p95ActualMs: latencyMetrics.http?.p95Ms || 0,
          status: actualLatencyCompliance >= targets.latencyCompliancePercent ? 'MET' : 'MISSED'
        },
        repairSuccess: {
          targetPercent: targets.repairSuccessTargetPercent,
          actualPercent: actualRepairSuccessRate,
          repairsStarted,
          repairsVerified,
          status: actualRepairSuccessRate >= targets.repairSuccessTargetPercent ? 'MET' : 'MISSED'
        }
      }
    };
  }
}

const sloEngine = new SloEngine();

module.exports = sloEngine;
