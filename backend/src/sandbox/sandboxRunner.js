const { reproduceFailure } = require('../tools/controlledTools');

/**
 * Execute Verification Pipeline inside Isolated Sandbox Environment
 * Truthfully evaluates live HTTP probes and reports real execution metrics.
 */
async function runVerificationPipeline(filePath, options = {}) {
  console.log('[Sandbox Runner] Starting Verification Pipeline for:', filePath);
  const startTime = Date.now();

  const targetEndpoint = options.targetEndpoint || '/api/auth/login';
  const authToken = options.authToken || null;

  let unknownUserProbe = null;
  let validUserProbe = null;
  let liveProbeExecuted = false;
  let probeError = null;

  try {
    // Execute real HTTP reproduction probes against target service
    const results = await Promise.all([
      reproduceFailure(targetEndpoint, { email: 'nonexistent_verification_user@apifix.ai', password: 'testpassword' }, authToken),
      reproduceFailure(targetEndpoint, { email: 'alex@example.com', password: 'securepassword123' }, authToken)
    ]);
    unknownUserProbe = results[0];
    validUserProbe = results[1];
    liveProbeExecuted = true;
  } catch (err) {
    probeError = err.message;
    console.warn('[Sandbox Runner] Probe execution failed:', err.message);
  }

  const executionTimeMs = Date.now() - startTime;

  if (!liveProbeExecuted || !unknownUserProbe || !validUserProbe) {
    return {
      status: 'NOT_VERIFIED',
      verified: false,
      summary: `Live verification probe failed to connect: ${probeError || 'Target service unreachable'}`,
      results: {
        probesExecuted: false,
        error: probeError
      },
      metrics: {
        testsPassed: null,
        testsFailed: null,
        testSummary: 'Tests not executed',
        apiChecksPassed: 0,
        apiChecksFailed: 2,
        apiSummary: 'API verification not completed',
        executionTimeMs
      }
    };
  }

  // A fixed endpoint should return a controlled client status (400, 401, 404) for unfound user rather than 500 crash
  const invalidEmailPassed = unknownUserProbe.status_code !== 500 && (unknownUserProbe.status_code >= 400 && unknownUserProbe.status_code < 500);
  const validLoginPassed = validUserProbe.status_code >= 200 && validUserProbe.status_code < 300;
  const isApiVerified = invalidEmailPassed && validLoginPassed;

  const passedChecks = (invalidEmailPassed ? 1 : 0) + (validLoginPassed ? 1 : 0);

  return {
    status: isApiVerified ? 'VERIFIED' : 'NOT_VERIFIED',
    verified: isApiVerified,
    summary: isApiVerified
      ? 'Patch successfully verified via live HTTP probes. Controlled error returned on unhandled input; no 500 exceptions.'
      : 'Verification probes detected failing responses or unhandled exceptions.',
    results: {
      probesExecuted: true,
      unknownUserProbe: {
        status: unknownUserProbe.status_code,
        expected: '4xx (non-500)',
        pass: invalidEmailPassed,
        evidence: unknownUserProbe.evidence || []
      },
      validUserProbe: {
        status: validUserProbe.status_code,
        expected: '2xx',
        pass: validLoginPassed,
        evidence: validUserProbe.evidence || []
      }
    },
    metrics: {
      testsPassed: null,
      testsFailed: null,
      testSummary: 'Tests not executed',
      apiChecksPassed: passedChecks,
      apiChecksFailed: 2 - passedChecks,
      apiSummary: `${passedChecks}/2 live API probes passed`,
      executionTimeMs
    }
  };
}

module.exports = { runVerificationPipeline };

