/**
 * APIFIX AI — Phase 22 Database Resilience & Migration Safety Tests
 * Verifies retry classification, zero blind retries for non-idempotent mutations,
 * query timeouts, migration locks, schema compatibility, and graceful degradation.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { databaseReliabilityService, OPERATION_TYPES } = require('../src/services/databaseReliabilityService');

describe('Phase 22 — Database Resilience & Migration Safety Suite', () => {
  test('3.1 Should accurately classify idempotent reads vs non-idempotent writes', () => {
    assert.equal(databaseReliabilityService.classifyOperation('SELECT * FROM projects'), OPERATION_TYPES.IDEMPOTENT_READ);
    assert.equal(databaseReliabilityService.classifyOperation('GET_INCIDENTS'), OPERATION_TYPES.IDEMPOTENT_READ);
    assert.equal(databaseReliabilityService.classifyOperation('INSERT INTO runs', true, false), OPERATION_TYPES.NON_IDEMPOTENT_WRITE);
    assert.equal(databaseReliabilityService.classifyOperation('CHARGE_CREDITS', true, false), OPERATION_TYPES.NON_IDEMPOTENT_WRITE);
    assert.equal(databaseReliabilityService.classifyOperation('UPSERT_SETTING', true, true), OPERATION_TYPES.IDEMPOTENT_WRITE);
  });

  test('3.2 Should execute idempotent query successfully and record latency', async () => {
    const result = await databaseReliabilityService.executeQuery(async () => {
      return [{ id: 'proj_1', name: 'api-gateway' }];
    }, { name: 'SELECT_PROJECTS', isMutation: false });

    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'api-gateway');
  });

  test('3.3 Should retry transient failure on idempotent query with backoff', async () => {
    let attempts = 0;
    const result = await databaseReliabilityService.executeQuery(async () => {
      attempts++;
      if (attempts < 2) throw new Error('Temporary network glitch');
      return { success: true };
    }, { name: 'SELECT_HEALTH', isMutation: false });

    assert.equal(result.success, true);
    assert.equal(attempts, 2);
  });

  test('3.4 Should NEVER retry non-idempotent mutation on failure (Zero Blind Retries)', async () => {
    let attempts = 0;
    await assert.rejects(async () => {
      await databaseReliabilityService.executeQuery(async () => {
        attempts++;
        throw new Error('Database transaction conflict');
      }, { name: 'CHARGE_BILLING', isMutation: true, hasIdempotencyKey: false });
    });

    assert.equal(attempts, 1, 'Non-idempotent mutation must fail immediately without retry');
  });

  test('3.5 Should enforce query timeout when execution exceeds limit', async () => {
    await assert.rejects(async () => {
      await databaseReliabilityService.executeQuery(async () => {
        await new Promise(r => setTimeout(r, 200));
      }, { name: 'SLOW_QUERY', timeoutMs: 50 });
    }, {
      code: 'DB_TIMEOUT'
    });
  });

  test('3.6 Should acquire and release migration lock preventing concurrent runs', async () => {
    const lockHolder = 'deploy_process_101';
    const acquired = await databaseReliabilityService.acquireMigrationLock(lockHolder);
    assert.equal(acquired.success, true);

    // Attempt concurrent lock from another process
    await assert.rejects(async () => {
      await databaseReliabilityService.acquireMigrationLock('deploy_process_102');
    }, {
      code: 'MIGRATION_LOCKED'
    });

    // Release lock
    const released = await databaseReliabilityService.releaseMigrationLock(lockHolder);
    assert.equal(released.success, true);
  });

  test('3.7 Should reject releasing migration lock by non-owner process', async () => {
    await databaseReliabilityService.acquireMigrationLock('owner_process');
    await assert.rejects(async () => {
      await databaseReliabilityService.releaseMigrationLock('intruder_process');
    });
    await databaseReliabilityService.releaseMigrationLock('owner_process');
  });

  test('3.8 Should validate schema compatibility and applied migrations list', async () => {
    const res = await databaseReliabilityService.validateSchemaCompatibility('22.0.0');
    assert.equal(res.compatible, true);
    assert.ok(res.appliedMigrationsCount >= 6);
    assert.ok(res.migrations.some(m => m.version === '22.0.0'));
  });

  test('3.9 Should generate comprehensive database health metrics', () => {
    const m = databaseReliabilityService.getHealthMetrics();
    assert.ok(m.status);
    assert.ok(m.totalQueries >= 1);
    assert.ok(m.latency);
    assert.ok(typeof m.latency.p50Ms === 'number');
    assert.ok(typeof m.latency.p95Ms === 'number');
  });

  test('3.10 Should maintain graceful in-memory degraded mode information', () => {
    const m = databaseReliabilityService.getHealthMetrics();
    assert.ok(m.migrationLock !== undefined);
    assert.ok(m.nonIdempotentRejections >= 1);
  });
});
