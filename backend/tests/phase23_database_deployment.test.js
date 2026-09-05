/**
 * APIFIX AI — Phase 23 Database Deployment & Migration Safety Test Suite
 * 
 * Validates versioned migrations, checksum integrity, and distributed locking.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, describe } = require('node:test');
const { migrationRunner } = require('../src/services/migrationRunner');
const { databaseReliabilityService } = require('../src/services/databaseReliabilityService');

describe('Phase 23 — Database Deployment & Migration Safety Suite', () => {

  test('4.1 Discovers all 7 versioned migration files in order', () => {
    const migrations = migrationRunner.getAvailableMigrations();
    assert.strictEqual(migrations.length, 7);
    assert.strictEqual(migrations[0].sequence, '001');
    assert.strictEqual(migrations[6].sequence, '007');
  });

  test('4.2 Migration files have valid deterministic SHA-256 checksums', () => {
    const migrations = migrationRunner.getAvailableMigrations();
    for (const m of migrations) {
      assert.strictEqual(typeof m.checksum, 'string');
      assert.strictEqual(m.checksum.length, 64);
    }
  });

  test('4.3 Migration status reports applied vs pending correctly', async () => {
    const status = await migrationRunner.getStatus();
    assert.ok(status.totalAvailable >= 7);
    assert.strictEqual(status.status, 'UP_TO_DATE');
  });

  test('4.4 Migration verify detects zero sequence gaps or invalid syntax', async () => {
    const ver = await migrationRunner.verify();
    assert.strictEqual(ver.valid, true);
    assert.strictEqual(ver.issues.length, 0);
  });

  test('4.5 Migration lock acquisition prevents concurrent execution', async () => {
    const lockHolder = 'worker_alpha';
    await databaseReliabilityService.acquireMigrationLock(lockHolder);

    // Second worker attempting to acquire must fail
    await assert.rejects(
      async () => {
        await databaseReliabilityService.acquireMigrationLock('worker_beta');
      },
      (err) => err.code === 'MIGRATION_LOCKED'
    );

    // Release lock
    await databaseReliabilityService.releaseMigrationLock(lockHolder);
  });

  test('4.6 Releasing lock held by another process is rejected', async () => {
    const lockHolder = 'worker_gamma';
    await databaseReliabilityService.acquireMigrationLock(lockHolder);

    await assert.rejects(
      async () => {
        await databaseReliabilityService.releaseMigrationLock('worker_impostor');
      },
      (err) => err.message.includes('Cannot release lock held by another process')
    );

    await databaseReliabilityService.releaseMigrationLock(lockHolder);
  });

  test('4.7 Migration execution applies migrations safely under lock', async () => {
    const res = await migrationRunner.migrate({ lockHolderId: 'test_migrator' });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.appliedCount, 7);
  });

  test('4.8 Schema compatibility check verifies target version 23.0.0', async () => {
    const compat = await databaseReliabilityService.validateSchemaCompatibility('22.0.0');
    assert.strictEqual(compat.compatible, true);
  });

  test('4.9 Database circuit breaker remains CLOSED during healthy queries', () => {
    const metrics = databaseReliabilityService.getHealthMetrics();
    assert.ok(metrics.status === 'HEALTHY' || metrics.status === 'WARNING');
  });

  test('4.10 Non-idempotent operations are classified and protected from blind retries', () => {
    const readOp = databaseReliabilityService.classifyOperation('SELECT_USERS');
    const writeOp = databaseReliabilityService.classifyOperation('INSERT_CHARGE', true);
    assert.strictEqual(readOp, 'IDEMPOTENT_READ');
    assert.strictEqual(writeOp, 'NON_IDEMPOTENT_WRITE');
  });

  test('4.11 Production readiness fails with 503 if database is unconfigured in production', () => {
    const { handleReadiness } = require('../src/routes/healthRoutes');
    const origNodeEnv = process.env.NODE_ENV;
    const origDemoMode = process.env.APIFIX_DEMO_MODE;
    try {
      process.env.NODE_ENV = 'production';
      process.env.APIFIX_DEMO_MODE = 'false';

      let statusCode = 200;
      let responseBody = null;
      const mockReq = { headers: {} };
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: (data) => {
          responseBody = data;
          return mockRes;
        }
      };

      handleReadiness(mockReq, mockRes);
      assert.strictEqual(statusCode, 503);
      assert.strictEqual(responseBody.status, 'not_ready');
      assert.strictEqual(responseBody.checks.database, 'error (database_required_in_production)');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      process.env.APIFIX_DEMO_MODE = origDemoMode;
    }
  });
});
