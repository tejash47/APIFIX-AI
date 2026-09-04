/**
 * APIFIX V2 — Phase 10: Derived Repair Confidence Calculator
 * 
 * Computes an evidence-based repair confidence score and categorical level.
 * Derived mathematically from concrete verification signals, not arbitrary guesses.
 * Never overrides an actual verification failure.
 */

/**
 * Calculates evidence-driven repair confidence score.
 * 
 * @param {Object} params
 * @param {number} [params.rcaConfidence=0.85] - Root cause hypothesis confidence (0.0 - 1.0)
 * @param {number} [params.qualityGateScore=1.0] - Patch quality gate score (0.0 - 1.0)
 * @param {boolean} [params.verificationPassed=false] - Live dynamic sandbox verification result
 * @param {boolean} [params.hasRegressions=false] - Whether regressions were detected
 * @param {string} [params.riskLevel='LOW'] - Patch risk level ('LOW' | 'MEDIUM' | 'HIGH')
 * @returns {{ confidence: number, level: 'LOW' | 'MEDIUM' | 'HIGH', reasons: Array<string> }}
 */
function calculateRepairConfidence({
  rcaConfidence = 0.85,
  qualityGateScore = 1.0,
  verificationPassed = false,
  hasRegressions = false,
  riskLevel = 'LOW'
}) {
  const reasons = [];

  // Verification Failure Hard-Cap
  if (!verificationPassed) {
    return {
      confidence: 0.15,
      level: 'LOW',
      reasons: [
        'Sandbox verification failed: runtime crash or test failures persisted after patch application.'
      ]
    };
  }

  // Regression Failure Hard-Cap
  if (hasRegressions) {
    return {
      confidence: 0.35,
      level: 'LOW',
      reasons: [
        'Cross-route regressions detected: patch resolved target failure but broke sibling endpoints or tests.'
      ]
    };
  }

  // Weightings:
  // - RCA Confidence: 25%
  // - Quality Gate Score: 25%
  // - Sandbox Verification: 35%
  // - Regression Integrity: 15%
  const rcaWeight = 0.25;
  const gateWeight = 0.25;
  const verifyWeight = 0.35;
  const regressionWeight = 0.15;

  let rawScore = (rcaConfidence * rcaWeight)
    + (qualityGateScore * gateWeight)
    + (1.0 * verifyWeight)
    + (1.0 * regressionWeight);

  // Risk Penalty
  let riskPenalty = 0.0;
  if (riskLevel === 'HIGH') {
    riskPenalty = 0.08;
    reasons.push('High-complexity patch risk penalty applied (-8%).');
  } else if (riskLevel === 'MEDIUM') {
    riskPenalty = 0.03;
    reasons.push('Moderate patch risk penalty applied (-3%).');
  } else {
    reasons.push('Low patch risk score (minimal surgical surface area).');
  }

  const finalConfidence = Math.min(0.99, Math.max(0.10, parseFloat((rawScore - riskPenalty).toFixed(2))));

  reasons.unshift(`Root cause hypothesis supported by direct evidence (${(rcaConfidence * 100).toFixed(0)}%).`);
  reasons.unshift(`All patch quality gates evaluated (${(qualityGateScore * 100).toFixed(0)}% pass).`);
  reasons.unshift('Live sandbox verification confirmed: runtime crash eliminated.');
  reasons.unshift('0 cross-route regressions detected.');

  let level = 'LOW';
  if (finalConfidence >= 0.85) {
    level = 'HIGH';
  } else if (finalConfidence >= 0.60) {
    level = 'MEDIUM';
  }

  return {
    confidence: finalConfidence,
    level,
    reasons
  };
}

module.exports = {
  calculateRepairConfidence
};
