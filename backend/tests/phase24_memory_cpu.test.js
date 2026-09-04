/**
 * Phase 24 — Memory & CPU Profiling Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const { ResourceProfiler } = require('../src/services/resourceProfiler');

describe('Phase 24 — Resource Profiling & Memory Leak Detection', () => {
  let profiler;

  beforeEach(() => {
    profiler = new ResourceProfiler();
  });

  test('1. Takes accurate memory snapshot and captures current process profile', () => {
    const snap = profiler.takeSnapshot('baseline_start');
    assert(snap.memory.heapUsedMb > 0, 'Heap used must be positive');
    assert(snap.memory.rssMb > 0, 'RSS must be positive');

    const current = profiler.getCurrentProfile();
    assert.strictEqual(current.classification, 'MEASURED');
    assert(current.process.uptimeSeconds >= 0);
  });

  test('2. Accurately measures event loop lag asynchronously', async () => {
    const lagResult = await profiler.measureEventLoopLag(5);
    assert.strictEqual(lagResult.classification, 'MEASURED');
    assert.strictEqual(lagResult.samples, 5);
    assert(lagResult.avgLagMs >= 0);
    assert(lagResult.maxLagMs >= lagResult.minLagMs);
    assert(['HEALTHY', 'DEGRADED', 'CRITICAL_LAG'].includes(lagResult.health));
  });

  test('3. Detects stable memory profile across simulated workloads with zero leaks', () => {
    // Snapshot 1: Start
    profiler.takeSnapshot('start');

    // Simulate normal memory activity
    const bufferArray = [];
    for (let i = 0; i < 1000; i++) {
      bufferArray.push({ i, val: `entry_${i}` });
    }
    bufferArray.length = 0; // Release memory

    // Snapshot 2: Finish
    profiler.takeSnapshot('finish');

    const leakReport = profiler.detectMemoryLeaks(50);
    assert.strictEqual(leakReport.status, 'HEALTHY');
    assert.strictEqual(leakReport.hasLeak, false);
  });
});
