/**
 * APIFIX AI — Repair Pipeline SRE & MTTR Telemetry Tracker (Phase 16)
 * Measures stage durations across the full self-healing lifecycle and calculates
 * MTTD, MTTI, MTTR, MTTV, and End-to-End MTTR operational metrics.
 */

const observabilityEngine = require('./observabilityEngine');
const { ErrorCodes } = require('../config/errorTaxonomy');

class RepairTelemetryTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.activeRunStages = new Map(); // runId -> { stages: Map<stage, { start, end, durationMs, success }> }
    this.stageDurations = {
      DETECTED: [],
      INVESTIGATING: [],
      ROOT_CAUSE: [],
      PATCH: [],
      TESTING: [],
      VERIFIED: []
    };
    this.completedRuns = [];
    this.maxCompletedRuns = 100;
  }

  /**
   * Starts timing a specific lifecycle stage for a repair run
   * @param {string} runId
   * @param {string} stage - DETECTED, INVESTIGATING, ROOT_CAUSE, PATCH, TESTING, VERIFIED
   * @param {object} [meta]
   */
  startStage(runId, stage, meta = {}) {
    if (!this.activeRunStages.has(runId)) {
      this.activeRunStages.set(runId, {
        runId,
        workspaceId: meta.workspaceId || 'system',
        correlationId: meta.correlationId || null,
        startedAt: Date.now(),
        stages: new Map()
      });
    }

    const runData = this.activeRunStages.get(runId);
    runData.stages.set(stage, {
      stage,
      startTime: Date.now(),
      endTime: null,
      durationMs: null,
      status: 'IN_PROGRESS'
    });

    observabilityEngine.recordEvent({
      event: `repair_stage_${stage.toLowerCase()}_started`,
      category: 'REPAIR',
      stage,
      status: 'IN_PROGRESS',
      workspaceId: runData.workspaceId,
      correlationId: runData.correlationId,
      metadata: { runId, ...meta }
    });
  }

  /**
   * Completes a lifecycle stage for a repair run
   * @param {string} runId
   * @param {string} stage
   * @param {object} [meta]
   */
  completeStage(runId, stage, meta = {}) {
    const runData = this.activeRunStages.get(runId);
    if (!runData) return;

    const stageData = runData.stages.get(stage);
    const now = Date.now();
    const durationMs = meta.durationMs !== undefined
      ? meta.durationMs
      : (stageData?.startTime ? now - stageData.startTime : 0);

    if (stageData) {
      stageData.endTime = now;
      stageData.durationMs = durationMs;
      stageData.status = meta.success !== false ? 'SUCCESS' : 'FAILURE';
    }

    if (this.stageDurations[stage]) {
      this.stageDurations[stage].push(Math.round(durationMs));
      if (this.stageDurations[stage].length > 200) {
        this.stageDurations[stage].shift();
      }
    }

    observabilityEngine.recordEvent({
      event: `repair_stage_${stage.toLowerCase()}_completed`,
      category: 'REPAIR',
      stage,
      durationMs,
      status: meta.success !== false ? 'SUCCESS' : 'FAILURE',
      errorCode: meta.success === false ? (meta.errorCode || ErrorCodes.REPAIR_ERROR) : null,
      workspaceId: runData.workspaceId,
      correlationId: runData.correlationId,
      metadata: { runId, ...meta }
    });
  }

  /**
   * Finalizes run telemetry and records end-to-end MTTR metrics
   * @param {string} runId
   * @param {object} summary
   */
  finalizeRun(runId, summary = {}) {
    const runData = this.activeRunStages.get(runId);
    if (!runData) return;

    const totalDurationMs = Date.now() - runData.startedAt;
    const stageSummary = {};
    for (const [s, data] of runData.stages.entries()) {
      stageSummary[s] = data.durationMs;
    }

    const runRecord = {
      runId,
      workspaceId: runData.workspaceId,
      correlationId: runData.correlationId,
      status: summary.status || 'COMPLETED',
      totalDurationMs,
      stages: stageSummary,
      completedAt: new Date().toISOString()
    };

    this.completedRuns.unshift(runRecord);
    if (this.completedRuns.length > this.maxCompletedRuns) {
      this.completedRuns.pop();
    }

    this.activeRunStages.delete(runId);

    observabilityEngine.recordEvent({
      event: 'repair_run_finalized',
      category: 'REPAIR',
      durationMs: totalDurationMs,
      status: summary.status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
      workspaceId: runData.workspaceId,
      correlationId: runData.correlationId,
      metadata: { runId, totalDurationMs, stageSummary }
    });
  }

  _calculateAvg(arr) {
    if (!arr || arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  /**
   * Calculates Mean Time metrics across repair stages
   */
  getMttrMetrics() {
    const mttd = this._calculateAvg(this.stageDurations.DETECTED);
    const mtti = this._calculateAvg(this.stageDurations.INVESTIGATING);
    const mttr = this._calculateAvg(this.stageDurations.PATCH);
    const mttv = this._calculateAvg(this.stageDurations.TESTING) + this._calculateAvg(this.stageDurations.VERIFIED);

    const totalRuns = this.completedRuns.length;
    const totalDuration = this.completedRuns.reduce((acc, r) => acc + r.totalDurationMs, 0);
    const endToEndMttr = totalRuns > 0 ? Math.round(totalDuration / totalRuns) : (mttd + mtti + mttr + mttv);

    return {
      mttdMs: mttd,             // Mean Time to Detect
      mttiMs: mtti,             // Mean Time to Investigate
      mttrMs: mttr,             // Mean Time to Repair (Patch generation)
      mttvMs: mttv,             // Mean Time to Verify
      endToEndMttrMs: endToEndMttr,
      stageAverages: {
        detectedMs: mttd,
        investigatingMs: mtti,
        rootCauseMs: this._calculateAvg(this.stageDurations.ROOT_CAUSE),
        patchMs: mttr,
        testingMs: this._calculateAvg(this.stageDurations.TESTING),
        verifiedMs: this._calculateAvg(this.stageDurations.VERIFIED)
      },
      completedRunsCount: totalRuns
    };
  }
}

const repairTelemetryTracker = new RepairTelemetryTracker();

module.exports = repairTelemetryTracker;
