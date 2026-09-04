/**
 * APIFIX V2 — Phase 10: Regression Intelligence
 * 
 * Compares BEFORE and AFTER system metrics across endpoints and test suites
 * to detect subtle regressions, status code changes, or broken contracts.
 */

/**
 * Analyzes telemetry before and after patch application for regressions.
 * 
 * @param {Object} params
 * @param {Object} [params.beforeTelemetry] - Pre-patch probe and test telemetry
 * @param {Object} [params.afterTelemetry] - Post-patch probe and test telemetry
 * @param {Array<Object>} [params.endpointProbes] - Cross-endpoint probe results
 * @returns {{ hasRegressions: boolean, regressions: Array<Object>, summary: string }}
 */
function analyzeRegressions({ beforeTelemetry = {}, afterTelemetry = {}, endpointProbes = [] }) {
  const regressions = [];

  // 1. Check for newly failing automated tests
  const beforeTests = beforeTelemetry.tests || {};
  const afterTests = afterTelemetry.tests || {};

  if (afterTests.failed > 0 && afterTests.failed > (beforeTests.failed || 0)) {
    regressions.push({
      type: 'TEST_REGRESSION',
      severity: 'HIGH',
      message: `Automated test suite introduced ${afterTests.failed - (beforeTests.failed || 0)} newly failing test(s).`,
      details: afterTests.summary || 'Test suite failure'
    });
  }

  // 2. Check for unexpected status code regressions on sibling endpoints
  for (const probe of endpointProbes) {
    if (probe.isTarget) continue; // Target endpoint is expected to change behavior

    if (probe.status >= 500) {
      regressions.push({
        type: 'ENDPOINT_CRASH_REGRESSION',
        severity: 'CRITICAL',
        message: `Sibling endpoint ${probe.method} ${probe.path} crashed with HTTP ${probe.status}.`,
        details: probe.error || probe.responseBody
      });
    } else if (probe.status === 404 && probe.expectedStatus && probe.expectedStatus !== 404) {
      regressions.push({
        type: 'ROUTE_NOT_FOUND_REGRESSION',
        severity: 'HIGH',
        message: `Sibling route ${probe.method} ${probe.path} is no longer reachable (HTTP 404).`
      });
    }
  }

  const hasRegressions = regressions.length > 0;
  const summary = hasRegressions
    ? `Detected ${regressions.length} regression(s): ${regressions.map(r => r.message).join(' ')}`
    : 'All non-target endpoints and regression tests maintained full operational integrity.';

  return {
    hasRegressions,
    regressions,
    summary
  };
}

module.exports = {
  analyzeRegressions
};
