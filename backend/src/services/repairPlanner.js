/**
 * APIFIX V2 — Phase 10: Repair Plan Engine
 * 
 * Generates minimal, scoped repair plans before patch generation.
 * Enforces the core rule: MINIMAL SAFE PATCH > AGGRESSIVE REWRITE.
 */

/**
 * Creates a minimal structured repair plan based on evaluated hypotheses.
 * 
 * @param {Object} params
 * @param {string} params.targetFile - Target source file to modify
 * @param {string} params.rootCause - Selected root cause hypothesis
 * @param {string} params.strategy - Recommended repair strategy
 * @param {string} [params.problemSummary] - Brief problem description
 * @param {Array<string>} [params.avoidedFiles] - Files explicitly kept immutable
 * @returns {Object} Structured repair plan
 */
function createRepairPlan({ targetFile, rootCause, strategy, problemSummary = '', avoidedFiles = [] }) {
  const targetFiles = targetFile ? [targetFile] : [];
  const changesRequired = [];
  const changesAvoided = [
    'Refactoring unrelated architecture or middleware',
    'Modifying public API route signatures or status contracts',
    'Modifying database schema or migrations',
    'Adding heavy third-party npm dependencies'
  ];

  if (avoidedFiles.length > 0) {
    changesAvoided.push(...avoidedFiles.map(f => `Modifying file: ${f}`));
  }

  switch (strategy) {
    case 'INSERT_GUARD_CLAUSE':
      changesRequired.push(`Insert defensive guard clause in ${targetFile} to handle null or undefined input.`);
      break;
    case 'VALIDATE_CREDENTIALS_AND_GUARD':
      changesRequired.push(`Add user record existence check before credential evaluation in ${targetFile}.`);
      break;
    case 'SYNCHRONIZE_JWT_CONFIG':
      changesRequired.push(`Ensure JWT secret fallback or environment configuration in ${targetFile}.`);
      break;
    case 'ADD_INPUT_VALIDATION':
      changesRequired.push(`Add request parameter validation schema in ${targetFile}.`);
      break;
    default:
      changesRequired.push(`Apply targeted fix in ${targetFile} to resolve exception.`);
      break;
  }

  // Assess initial plan risk
  const isAuthFile = targetFile ? (targetFile.includes('auth') || targetFile.includes('security') || targetFile.includes('token')) : false;
  const riskLevel = isAuthFile ? 'MEDIUM' : 'LOW';

  return {
    targetFiles,
    problem: problemSummary || 'Runtime failure identified during endpoint execution.',
    rootCause: rootCause || 'Unhandled exception in source code.',
    strategy: strategy || 'APPLY_TARGETED_FIX',
    changesRequired,
    changesAvoided,
    riskLevel,
    rationale: `Minimal surgical patch in ${targetFile || 'source'} resolves root cause while preserving workspace stability.`
  };
}

module.exports = {
  createRepairPlan
};
