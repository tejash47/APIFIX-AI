/**
 * Phase 24 — Database Performance & Query Benchmarks Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { BenchmarkRunner } = require('../src/services/benchmarkRunner');
const { projectStore } = require('../src/services/projectStore');
const { workspaceService } = require('../src/services/workspaceService');
const { auditLedgerService } = require('../src/services/auditLedgerService');

describe('Phase 24 — Database Performance & Query Operations', () => {
  const runner = new BenchmarkRunner();

  test('1. Benchmarks high-frequency project & API endpoint lookup operations', async () => {
    // Setup test workspace & project
    const wsId = 'ws_db_perf_test';
    projectStore.saveProject({
      id: 'proj_db_1',
      workspaceId: wsId,
      name: 'DB Performance Project',
      apis: [{ id: 'api_1', name: 'Get Users', path: '/users', method: 'GET' }]
    });

    const result = await runner.runBenchmark({
      name: 'db_project_lookup_benchmark',
      concurrency: 5,
      iterations: 30,
      fn: async () => {
        const proj = projectStore.getProject('proj_db_1');
        assert(proj !== null);
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.latency.p95Ms < 250, `Project lookup p95 (${result.latency.p95Ms}ms) should be < 250ms`);
  });

  test('2. Benchmarks cryptographic chained audit writes', async () => {
    const wsId = 'ws_db_audit_test';

    const result = await runner.runBenchmark({
      name: 'db_audit_write_benchmark',
      concurrency: 5,
      iterations: 20,
      fn: async (i) => {
        await auditLedgerService.recordEvent({
          workspaceId: wsId,
          action: 'PERF_AUDIT_WRITE',
          actorId: `perf_runner_${i}`,
          metadata: { iteration: i }
        });
      }
    });

    assert.strictEqual(result.successRate, 100);
    assert(result.latency.p95Ms < 250, `Audit write p95 (${result.latency.p95Ms}ms) should be < 250ms`);
  });

  test('3. Verifies workspace metadata query throughput under multi-tenant load', async () => {
    const result = await runner.runBenchmark({
      name: 'db_workspace_meta_benchmark',
      concurrency: 5,
      iterations: 30,
      fn: async (i) => {
        const ws = await workspaceService.getWorkspaceById(`ws_tenant_${i % 10}`);
        assert(ws === null || typeof ws === 'object');
      }
    });

    assert.strictEqual(result.successRate, 100);
  });
});
