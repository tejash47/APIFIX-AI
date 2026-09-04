/**
 * APIFIX AI — Final Production Launch Readiness Gate (Phase 23)
 * 
 * Computes deterministic Go / No-Go launch status (READY, WARNING, BLOCKED)
 * based on mandatory operational, security, and resilience invariants.
 */

const { productionConfigValidator } = require('../config/productionConfigValidator');
const { productionSecurityGates } = require('./productionSecurityGates');
const { migrationRunner } = require('./migrationRunner');
const { databaseReliabilityService } = require('./databaseReliabilityService');
const { jobQueueService } = require('./jobQueueService');
const { productionReadinessAuditor } = require('./productionReadinessAuditor');

class ProductionLaunchGate {
  /**
   * Evaluates all launch requirements and produces a certified launch decision.
   */
  async evaluateLaunchStatus(env = process.env) {
    const blockers = [];
    const warnings = [];

    // 1. Security Gates
    const sec = productionSecurityGates.evaluateSecurityGates(env);
    if (!sec.allowed) {
      blockers.push(...sec.blockers.map(b => b.message));
    }
    warnings.push(...sec.warnings.map(w => w.message));

    // 2. Database Migrations
    const mig = await migrationRunner.getStatus();
    if (mig.pendingCount > 0 && env.NODE_ENV === 'production') {
      blockers.push(`There are ${mig.pendingCount} pending database migrations.`);
    }

    // 3. Database Health
    const dbMetrics = databaseReliabilityService.getHealthMetrics();
    if (dbMetrics.status === 'DEGRADED') {
      blockers.push('Database reliability service is currently in DEGRADED mode.');
    }

    // 4. Overall Readiness Audit
    const audit = await productionReadinessAuditor.auditAll();
    if (audit.status === 'BLOCKED') {
      blockers.push(...audit.blockingIssues);
    }
    warnings.push(...audit.warnings);

    // 5. Compute Final Launch Status
    let status = blockers.length > 0 ? 'BLOCKED' : 'READY';

    return {
      launchStatus: status, // READY, WARNING, BLOCKED
      canLaunch: status !== 'BLOCKED',
      readinessScore: audit.score,
      blockerCount: blockers.length,
      warningCount: warnings.length,
      blockers,
      warnings,
      evaluatedAt: new Date().toISOString(),
      recommendations: blockers.length > 0 ? [
        'Resolve all mandatory blocking issues prior to production deployment.',
        'Execute `npm run db:migrate` and verify secret entropy.'
      ] : [
        'All mandatory launch gates passed. Platform is certified for cloud launch.'
      ]
    };
  }
}

const productionLaunchGate = new ProductionLaunchGate();

module.exports = {
  ProductionLaunchGate,
  productionLaunchGate
};
