/**
 * APIFIX AI — Production Security & Deployment Quality Gates (Phase 23)
 * 
 * Classifies security and environment posture into BLOCKER, HIGH, MEDIUM, LOW, INFO.
 * Blocks cloud deployment if and only if mandatory production blockers exist.
 */

const { secretScanner } = require('./secretScanner');
const { productionConfigValidator } = require('../config/productionConfigValidator');

const SEVERITY = {
  BLOCKER: 'BLOCKER',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

class ProductionSecurityGates {
  /**
   * Evaluates full security posture for deployment approval.
   */
  evaluateSecurityGates(config = process.env) {
    const findings = [];
    const isProd = config.NODE_ENV === 'production';

    // Gate 1: Secret Scan in environment
    const jwt = config.JWT_SECRET || '';
    if (isProd) {
      if (!jwt || jwt.length < 32 || jwt.includes('default') || jwt.includes('secret_key_here')) {
        findings.push({
          gate: 'GATE_JWT_ENTROPY',
          severity: SEVERITY.BLOCKER,
          message: 'Production JWT_SECRET is missing, insecure, or shorter than 32 characters.'
        });
      }

      if (config.APIFIX_DEMO_MODE === 'true') {
        findings.push({
          gate: 'GATE_DEMO_MODE',
          severity: SEVERITY.BLOCKER,
          message: 'APIFIX_DEMO_MODE must be set to false in production deployment.'
        });
      }

      const cors = config.ALLOWED_ORIGINS || config.FRONTEND_URL || '';
      if (cors.includes('*')) {
        findings.push({
          gate: 'GATE_CORS_WILDCARD',
          severity: SEVERITY.BLOCKER,
          message: 'Wildcard CORS (*) is strictly forbidden in production.'
        });
      }

      if (config.APP_BASE_URL && config.APP_BASE_URL.startsWith('http://') && !config.APP_BASE_URL.includes('localhost')) {
        findings.push({
          gate: 'GATE_INSECURE_HTTP',
          severity: SEVERITY.HIGH,
          message: 'Production APP_BASE_URL should use HTTPS.'
        });
      }
    } else {
      findings.push({
        gate: 'GATE_ENV_DEV',
        severity: SEVERITY.INFO,
        message: 'Running in non-production environment mode.'
      });
    }

    const blockers = findings.filter(f => f.severity === SEVERITY.BLOCKER);
    const highs = findings.filter(f => f.severity === SEVERITY.HIGH);
    const warnings = findings.filter(f => f.severity === SEVERITY.MEDIUM || f.severity === SEVERITY.LOW || f.severity === SEVERITY.INFO);

    return {
      allowed: blockers.length === 0,
      status: blockers.length === 0 ? (highs.length === 0 ? 'PASSED' : 'PASSED_WITH_WARNINGS') : 'BLOCKED',
      blockerCount: blockers.length,
      highCount: highs.length,
      warningCount: warnings.length,
      blockers,
      warnings,
      evaluatedAt: new Date().toISOString()
    };
  }
}

const productionSecurityGates = new ProductionSecurityGates();

module.exports = {
  ProductionSecurityGates,
  productionSecurityGates,
  SEVERITY
};
