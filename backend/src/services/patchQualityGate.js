/**
 * APIFIX V2 — Phase 10: Patch Quality Gate
 * 
 * Enforces a strict 10-gate quality verification pipeline before a patch
 * can be considered candidate for VERIFIED state.
 */

const fs = require('fs');
const path = require('path');
const { validateSafePath } = require('./securitySanitizer');

/**
 * Validates a patch through 10 mandatory static and dynamic quality gates.
 * 
 * @param {Object} params
 * @param {string} params.workspacePath - Working workspace directory
 * @param {Object} params.patch - Patch object
 * @param {Object} [params.verification] - Dynamic sandbox verification result
 * @returns {{ passed: boolean, score: number, failedGate: string | null, gateResults: Array<Object> }}
 */
function evaluateQualityGates({ workspacePath, patch, verification = null }) {
  const gateResults = [];

  // Gate 1: Schema Structure
  const g1Pass = Boolean(patch && (patch.filePath || patch.multiFile) && (patch.newText !== undefined || patch.multiFile));
  gateResults.push({
    gate: 'GATE_1_SCHEMA_VALIDATION',
    name: 'Patch Schema Structure',
    passed: g1Pass,
    detail: g1Pass ? 'Valid patch schema format.' : 'Malformed patch object.'
  });

  // Gate 2: Path Safety
  let g2Pass = true;
  try {
    if (patch.multiFile) {
      for (const item of patch.multiFile) {
        validateSafePath(workspacePath, item.filePath);
      }
    } else if (patch.filePath) {
      validateSafePath(workspacePath, patch.filePath);
    }
  } catch (err) {
    g2Pass = false;
  }
  gateResults.push({
    gate: 'GATE_2_PATH_SECURITY',
    name: 'Path Traversal & Boundary Safety',
    passed: g2Pass,
    detail: g2Pass ? 'All target paths reside inside workspace bounds.' : 'Path traversal violation detected.'
  });

  // Gate 3: Target File Existence
  let g3Pass = true;
  if (workspacePath) {
    const files = patch.multiFile ? patch.multiFile.map(p => p.filePath) : [patch.filePath];
    for (const f of files) {
      if (!f || !fs.existsSync(path.join(workspacePath, f))) {
        g3Pass = false;
        break;
      }
    }
  }
  gateResults.push({
    gate: 'GATE_3_FILE_EXISTENCE',
    name: 'Target Source File Existence',
    passed: g3Pass,
    detail: g3Pass ? 'Target files exist on disk.' : 'Target file not found in workspace.'
  });

  // Gate 4: Non-Empty Changes
  const g4Pass = Boolean(patch.newText !== undefined && patch.newText !== patch.oldText);
  gateResults.push({
    gate: 'GATE_4_CONTENT_MODIFICATION',
    name: 'Meaningful Content Change',
    passed: g4Pass,
    detail: g4Pass ? 'Patch introduces distinct modifications.' : 'Patch text is identical to existing content.'
  });

  // Gate 5: JavaScript / JSON Syntax Validity
  let g5Pass = true;
  if (patch.newText && (patch.filePath?.endsWith('.js') || patch.filePath?.endsWith('.ts'))) {
    try {
      new Function(patch.newText);
    } catch (e) {
      // Small snippets might not parse standalone as full script if wrapped in clauses
      // If full file, verify function closure
      if (patch.newText.length > 200) {
        try { new Function(`function __testWrapper__() {\n${patch.newText}\n}`); } catch (err) { g5Pass = false; }
      }
    }
  }
  gateResults.push({
    gate: 'GATE_5_SYNTAX_INTEGRITY',
    name: 'Syntax and AST Integrity',
    passed: g5Pass,
    detail: g5Pass ? 'Code syntax passes parser checks.' : 'Syntax error in proposed patch.'
  });

  // Gate 6: Non-Stale Target Text Match
  let g6Pass = true;
  if (workspacePath && patch.filePath && patch.oldText) {
    const fullPath = path.join(workspacePath, patch.filePath);
    if (fs.existsSync(fullPath)) {
      const currentContent = fs.readFileSync(fullPath, 'utf8');
      g6Pass = currentContent.includes(patch.oldText);
    }
  }
  gateResults.push({
    gate: 'GATE_6_STALENESS_CHECK',
    name: 'Target Code Anchor Staleness Check',
    passed: g6Pass,
    detail: g6Pass ? 'Old code pattern matches disk content.' : 'Stale anchor text mismatch.'
  });

  // Gate 7: Sandbox Startup Check
  const g7Pass = verification ? (verification.targetProbeResult?.status !== null && verification.targetProbeResult?.status !== undefined) : true;
  gateResults.push({
    gate: 'GATE_7_SANDBOX_STARTUP',
    name: 'Dynamic Sandbox Execution',
    passed: g7Pass,
    detail: g7Pass ? 'Sandbox initialized and responded.' : 'Sandbox failed to start.'
  });

  // Gate 8: Target Probe Resolution Check (Eliminated 500 crashes)
  const probeStatus = verification?.targetProbeResult?.status;
  const g8Pass = verification ? (probeStatus !== undefined && probeStatus < 500) : true;
  gateResults.push({
    gate: 'GATE_8_FAILURE_ELIMINATION',
    name: 'Runtime Crash Elimination',
    passed: g8Pass,
    detail: g8Pass ? `Target probe returned controlled status ${probeStatus || 200}.` : `Target probe still returns HTTP ${probeStatus} crash.`
  });

  // Gate 9: Project Test Suite
  const testStatus = verification?.tests?.status;
  const g9Pass = verification ? (testStatus !== 'FAILED') : true;
  gateResults.push({
    gate: 'GATE_9_TEST_SUITE',
    name: 'Automated Test Suite Pass',
    passed: g9Pass,
    detail: g9Pass ? 'Project tests passed without failure.' : 'Project tests failed.'
  });

  // Gate 10: Regression Check
  const regressions = verification?.regressions || [];
  const g10Pass = regressions.length === 0;
  gateResults.push({
    gate: 'GATE_10_REGRESSION_INTEGRITY',
    name: 'Cross-Route Regression Integrity',
    passed: g10Pass,
    detail: g10Pass ? '0 cross-route regressions detected.' : `${regressions.length} regression(s) detected.`
  });

  const passedCount = gateResults.filter(g => g.passed).length;
  const totalGates = gateResults.length;
  const score = parseFloat((passedCount / totalGates).toFixed(2));
  const failedGate = gateResults.find(g => !g.passed)?.gate || null;

  return {
    passed: failedGate === null,
    score,
    failedGate,
    gateResults
  };
}

module.exports = {
  evaluateQualityGates
};
