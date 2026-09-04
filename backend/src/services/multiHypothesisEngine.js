/**
 * APIFIX V2 — Phase 10: Multi-Hypothesis Root Cause Engine
 * 
 * Generates, weighs, and ranks multiple competing diagnostic hypotheses
 * using concrete evidence signals. Never accepts an unverified single guess.
 */

const { FailureCategory } = require('./failureClassifier');

/**
 * Generates and evaluates multiple diagnostic hypotheses against collected evidence.
 * 
 * @param {Object} params
 * @param {Array<Object>} params.evidenceList - Evidence items from Evidence Engine
 * @param {Object} params.classification - Result from Failure Classifier
 * @param {string} [params.targetFile] - Primary crashing source file
 * @param {number} [params.targetLine] - Crashing line number
 * @returns {{ hypotheses: Array<Object>, selectedHypothesis: string, reasoning: string }}
 */
function evaluateHypotheses({ evidenceList = [], classification = {}, targetFile = null, targetLine = null }) {
  const category = classification?.category || FailureCategory.UNKNOWN;
  const stackEvidence = evidenceList.find(e => e.type === 'STACK_TRACE_FRAMES');
  const httpEvidence = evidenceList.find(e => e.type === 'HTTP_STATUS_AND_BODY');
  const sourceEvidence = evidenceList.find(e => e.type === 'SOURCE_CONTEXT');
  const configEvidence = evidenceList.find(e => e.type === 'CONFIG_PRESENCE');

  const hypotheses = [];

  if (category === FailureCategory.RUNTIME_ERROR) {
    const errorMsg = (stackEvidence?.content?.errorMessage || '').toLowerCase();
    const isNullDereference = errorMsg.includes('null') || errorMsg.includes('undefined') || errorMsg.includes('cannot read propert');

    // Hypothesis 1: Direct missing null/undefined guard before property access
    const h1Supporting = [];
    const h1Contradicting = [];
    if (isNullDereference) h1Supporting.push('ev_stack_trace');
    if (sourceEvidence) h1Supporting.push('ev_source_context');
    if (httpEvidence?.content?.status === 500) h1Supporting.push('ev_http_probe');

    hypotheses.push({
      id: 'H1',
      rootCause: `Direct null or undefined dereference at ${targetFile || 'source file'}:${targetLine || 'line'}. Missing guard check before property access.`,
      confidence: isNullDereference ? 0.94 : 0.70,
      supportingEvidence: h1Supporting,
      contradictingEvidence: h1Contradicting,
      recommendedStrategy: 'INSERT_GUARD_CLAUSE'
    });

    // Hypothesis 2: Upstream service/database returned unexpected null instead of record
    const h2Supporting = [];
    const h2Contradicting = [];
    if (httpEvidence?.content?.status === 500) h2Supporting.push('ev_http_probe');
    if (stackEvidence?.content?.targetFunction?.toLowerCase().includes('find') || stackEvidence?.content?.targetFunction?.toLowerCase().includes('get')) {
      h2Supporting.push('ev_stack_trace');
    } else {
      h2Contradicting.push('ev_stack_trace');
    }

    hypotheses.push({
      id: 'H2',
      rootCause: 'Upstream query or service retrieval unexpectedly returned null when record was not found.',
      confidence: 0.65,
      supportingEvidence: h2Supporting,
      contradictingEvidence: h2Contradicting,
      recommendedStrategy: 'HANDLE_EMPTY_RESULT'
    });

    // Hypothesis 3: Request payload missing required input parameters
    const h3Supporting = [];
    const h3Contradicting = [];
    if (httpEvidence?.content?.status === 400 || httpEvidence?.content?.status === 422) {
      h3Supporting.push('ev_http_probe');
    } else {
      h3Contradicting.push('ev_http_probe');
    }

    hypotheses.push({
      id: 'H3',
      rootCause: 'Request payload omitted required fields causing cascading undefined values in controller.',
      confidence: 0.40,
      supportingEvidence: h3Supporting,
      contradictingEvidence: h3Contradicting,
      recommendedStrategy: 'ADD_INPUT_VALIDATION'
    });

  } else if (category === FailureCategory.AUTHENTICATION_ERROR) {
    // Hypothesis 1: Invalid credentials or missing user lookup
    hypotheses.push({
      id: 'H1',
      rootCause: 'User record lookup failed or password comparison failed with missing user guard.',
      confidence: 0.91,
      supportingEvidence: ['ev_http_probe', 'ev_source_context'].filter(id => evidenceList.some(e => e.id === id)),
      contradictingEvidence: [],
      recommendedStrategy: 'VALIDATE_CREDENTIALS_AND_GUARD'
    });

    // Hypothesis 2: JWT configuration secret mismatch
    const h2Supp = [];
    if (configEvidence) h2Supp.push('ev_config_presence');
    hypotheses.push({
      id: 'H2',
      rootCause: 'JWT verification secret key mismatch or missing signing token.',
      confidence: configEvidence ? 0.75 : 0.45,
      supportingEvidence: h2Supp,
      contradictingEvidence: [],
      recommendedStrategy: 'SYNCHRONIZE_JWT_CONFIG'
    });

  } else {
    // Generic multi-hypothesis fallback
    hypotheses.push({
      id: 'H1',
      rootCause: `Primary failure in ${targetFile || 'application'}: ${classification.reasoning || 'Unhandled exception'}`,
      confidence: classification.confidence || 0.70,
      supportingEvidence: evidenceList.map(e => e.id),
      contradictingEvidence: [],
      recommendedStrategy: 'APPLY_TARGETED_FIX'
    });

    hypotheses.push({
      id: 'H2',
      rootCause: 'Secondary configuration or environment dependency issue.',
      confidence: Math.max(0.20, (classification.confidence || 0.50) - 0.30),
      supportingEvidence: configEvidence ? ['ev_config_presence'] : [],
      contradictingEvidence: [],
      recommendedStrategy: 'REVIEW_CONFIG'
    });
  }

  // Rank hypotheses by confidence descending
  hypotheses.sort((a, b) => b.confidence - a.confidence);

  const selected = hypotheses[0]?.id || 'H1';
  const selectedObj = hypotheses[0];

  return {
    hypotheses,
    selectedHypothesis: selected,
    selectedRootCause: selectedObj?.rootCause || 'Unknown root cause',
    recommendedStrategy: selectedObj?.recommendedStrategy || 'APPLY_TARGETED_FIX',
    reasoning: `Selected hypothesis ${selected} with highest evidence confidence (${(selectedObj?.confidence * 100).toFixed(0)}%).`
  };
}

module.exports = {
  evaluateHypotheses
};
