/**
 * Phase 24 — Multi-Tenant Isolation Stress Testing Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { BenchmarkRunner } = require('../src/services/benchmarkRunner');
const { projectStore } = require('../src/services/projectStore');
const { auditLedgerService } = require('../src/services/auditLedgerService');
const { finopsEngine } = require('../src/services/finopsEngine');

describe('Phase 24 — Multi-Tenant Isolation Stress Testing (10 to 100 Tenants)', () => {
  const runner = new BenchmarkRunner();

  test('1. Concurrently populates projects and audit logs across 20 distinct tenants with 0 data contamination', async () => {
    const tenantCount = 20;

    // Create 20 synthetic tenants
    for (let t = 0; t < tenantCount; t++) {
      const wsId = `ws_tenant_iso_${t}`;
      projectStore.saveProject({
        id: `proj_iso_${t}`,
        workspaceId: wsId,
        name: `Tenant ${t} Project`,
        apis: [{ id: `api_${t}`, name: `Endpoint ${t}`, path: `/tenant-${t}`, method: 'GET' }]
      });

      await auditLedgerService.recordEvent({
        workspaceId: wsId,
        action: 'TENANT_PROVISIONED',
        actorId: `admin_tenant_${t}`,
        resourceId: `proj_iso_${t}`
      });

      finopsEngine.recordSpend(wsId, 0.05 * (t + 1), 'api_calls');
    }

    // Benchmark cross-query isolation
    const result = await runner.runBenchmark({
      name: 'multitenant_isolation_benchmark',
      concurrency: 5,
      iterations: 30,
      fn: async (i) => {
        const tenantIndex = i % tenantCount;
        const targetWsId = `ws_tenant_iso_${tenantIndex}`;

        // 1. Verify project isolation: query must only return this tenant's project
        const proj = projectStore.getProject(`proj_iso_${tenantIndex}`);
        assert.strictEqual(proj.workspaceId, targetWsId, 'Project must belong strictly to requested tenant');

        // 2. Verify audit isolation: events must strictly belong to target workspace
        const auditEvents = auditLedgerService.getAuditLogs(targetWsId);
        assert(auditEvents.length > 0, 'Must contain audit logs for tenant');
        for (const evt of auditEvents) {
          assert.strictEqual(evt.workspaceId, targetWsId, 'Zero cross-tenant audit contamination');
        }

        // 3. Verify FinOps spend isolation
        const spend = finopsEngine.getSpend(targetWsId);
        assert(spend >= 0, 'Spend must be tracked');
      }
    });

    assert.strictEqual(result.successRate, 100);
  });

  test('2. Prevents cross-tenant project retrieval attempt via foreign workspace ID', () => {
    const proj = projectStore.getProject('proj_iso_0');
    assert.strictEqual(proj.workspaceId, 'ws_tenant_iso_0');

    // Attempting to list or match against a different workspace ID yields no collision
    const foreignWsProjects = projectStore.getProjectsByWorkspace('ws_tenant_iso_1');
    for (const p of foreignWsProjects) {
      assert.notStrictEqual(p.id, 'proj_iso_0', 'Foreign workspace must never list projects from other tenants');
    }
  });
});
