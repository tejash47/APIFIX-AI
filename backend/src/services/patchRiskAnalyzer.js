/**
 * APIFIX V2 — Phase 10: Patch Risk Analysis
 * 
 * Computes a quantitative risk score and categorical risk level for proposed patches.
 * High-risk patches require stronger verification gates.
 */

/**
 * Evaluates the risk profile of a proposed patch before application.
 * 
 * @param {Object} params
 * @param {Object} params.patch - Proposed patch object { filePath, oldText, newText, multiFile }
 * @param {Object} [params.plan] - Repair plan object
 * @param {number} [params.rcaConfidence] - Root cause analysis confidence (0.0 - 1.0)
 * @returns {{ riskLevel: 'LOW' | 'MEDIUM' | 'HIGH', score: number, reasons: Array<string> }}
 */
function analyzePatchRisk({ patch = {}, plan = {}, rcaConfidence = 0.85 }) {
  let score = 0.05; // Baseline minimum risk
  const reasons = [];

  const files = patch.multiFile ? patch.multiFile.map(p => p.filePath) : [patch.filePath || ''];
  const fileCount = files.length;

  // 1. File Count Impact
  if (fileCount > 3) {
    score += 0.35;
    reasons.push(`High file count: ${fileCount} files modified simultaneously.`);
  } else if (fileCount > 1) {
    score += 0.15;
    reasons.push(`Multi-file patch: ${fileCount} files modified.`);
  } else {
    reasons.push('Single file modification (minimal surface area).');
  }

  // 2. Lines of Code Changed Impact
  const oldLines = (patch.oldText || '').split(/\r?\n/).length;
  const newLines = (patch.newText || '').split(/\r?\n/).length;
  const deltaLines = Math.abs(newLines - oldLines) + newLines;

  if (deltaLines > 50) {
    score += 0.30;
    reasons.push(`Large line diff: ~${deltaLines} lines changed.`);
  } else if (deltaLines > 15) {
    score += 0.12;
    reasons.push(`Moderate line diff: ~${deltaLines} lines changed.`);
  } else {
    score += 0.04;
    reasons.push(`Surgical line diff: ~${deltaLines} lines modified.`);
  }

  // 3. Critical Component Impact
  const isAuth = files.some(f => /auth|token|session|jwt|password|credential/i.test(f));
  const isDb = files.some(f => /db|database|schema|migration|prisma|model/i.test(f));
  const isConfig = files.some(f => /config|env|package\.json/i.test(f));

  if (isAuth) {
    score += 0.12;
    reasons.push('Authentication or security-sensitive component touched.');
  }

  if (isDb) {
    score += 0.18;
    reasons.push('Database or data persistence layer touched.');
  }

  if (isConfig) {
    score += 0.15;
    reasons.push('System configuration or package manifest modified.');
  }

  // 4. Root Cause Confidence Discount
  if (rcaConfidence >= 0.90) {
    score = Math.max(0.05, score - 0.08);
    reasons.push(`High RCA confidence (${(rcaConfidence * 100).toFixed(0)}%) reduces uncertainty.`);
  } else if (rcaConfidence < 0.60) {
    score += 0.15;
    reasons.push(`Low RCA confidence (${(rcaConfidence * 100).toFixed(0)}%) increases patch risk.`);
  }

  // Bound score between 0.01 and 0.99
  const finalScore = Math.min(0.99, Math.max(0.05, parseFloat(score.toFixed(2))));

  let riskLevel = 'LOW';
  if (finalScore >= 0.55) {
    riskLevel = 'HIGH';
  } else if (finalScore >= 0.25) {
    riskLevel = 'MEDIUM';
  }

  return {
    riskLevel,
    score: finalScore,
    reasons
  };
}

module.exports = {
  analyzePatchRisk
};
