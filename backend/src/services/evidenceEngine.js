/**
 * APIFIX V2 — Phase 10: Evidence Engine
 * 
 * Collects, structures, sanitizes, and ranks diagnostic evidence for API failures.
 * Never sends raw unbounded repository dumps or exposes secrets.
 */

const path = require('path');
const fs = require('fs');
const { sanitizeSecrets, validateSafePath } = require('./securitySanitizer');

/**
 * Diagnostic Evidence Types
 */
const EvidenceType = {
  HTTP_STATUS_AND_BODY: 'HTTP_STATUS_AND_BODY',
  STACK_TRACE_FRAMES: 'STACK_TRACE_FRAMES',
  SOURCE_CONTEXT: 'SOURCE_CONTEXT',
  ROUTE_DEFINITION: 'ROUTE_DEFINITION',
  DEPENDENCY_METADATA: 'DEPENDENCY_METADATA',
  CONFIG_PRESENCE: 'CONFIG_PRESENCE',
  TEST_FAILURE_OUTPUT: 'TEST_FAILURE_OUTPUT',
  HISTORICAL_MEMORY_MATCH: 'HISTORICAL_MEMORY_MATCH'
};

/**
 * Collects and ranks structured evidence from reproduction and workspace data.
 * 
 * @param {Object} params
 * @param {string} params.workspacePath - Working copy workspace directory
 * @param {Object} params.probeResult - HTTP reproduction probe response
 * @param {Object} [params.parsedError] - Parsed stack trace info
 * @param {Object} [params.testResults] - Test execution results if any
 * @param {Object} [params.historicalMatch] - Similar incident from repair memory
 * @returns {Array<Object>} Sorted list of sanitized evidence items ranked by relevance (descending)
 */
function collectEvidence({ workspacePath, probeResult = {}, parsedError = {}, testResults = null, historicalMatch = null }) {
  const evidenceList = [];

  // 1. HTTP Probe Evidence
  if (probeResult && (probeResult.status || probeResult.error)) {
    const status = probeResult.status || 0;
    const is5xx = status >= 500;
    const relevance = is5xx ? 0.92 : (status >= 400 ? 0.85 : 0.50);

    evidenceList.push({
      id: 'ev_http_probe',
      type: EvidenceType.HTTP_STATUS_AND_BODY,
      source: `${probeResult.method || 'POST'} ${probeResult.url || '/api'}`,
      relevance,
      content: sanitizeSecrets({
        status: probeResult.status,
        statusText: probeResult.statusText,
        responseBody: probeResult.responseBody,
        error: probeResult.error,
        responseTimeMs: probeResult.responseTimeMs
      }),
      reason: is5xx
        ? `Server returned HTTP ${status} runtime crash during live probe.`
        : `Endpoint returned HTTP ${status} with potential logic or auth failure.`
    });
  }

  // 2. Stack Trace Frames Evidence
  if (parsedError && (parsedError.errorType || parsedError.message || parsedError.topFrame)) {
    evidenceList.push({
      id: 'ev_stack_trace',
      type: EvidenceType.STACK_TRACE_FRAMES,
      source: parsedError.topFrame?.file || 'Runtime Process Stderr',
      relevance: 0.95,
      content: sanitizeSecrets({
        errorType: parsedError.errorType || 'RuntimeError',
        errorMessage: parsedError.message || 'Unknown runtime error',
        targetFile: parsedError.topFrame?.file || null,
        targetLine: parsedError.topFrame?.line || null,
        targetFunction: parsedError.topFrame?.function || null,
        stackFrames: (parsedError.stackFrames || []).slice(0, 5)
      }),
      reason: `Direct exception location identified in stack trace at ${parsedError.topFrame?.file || 'unknown'}:${parsedError.topFrame?.line || '?'}`
    });
  }

  // 3. Source Code Context Evidence
  if (workspacePath && parsedError?.topFrame?.file) {
    const targetRelPath = parsedError.topFrame.file;
    const targetLine = parsedError.topFrame.line || 1;

    try {
      validateSafePath(workspacePath, targetRelPath);
      const fullPath = path.join(workspacePath, targetRelPath);

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const lines = fileContent.split(/\r?\n/);
        
        // Bounded window: 10 lines before and after
        const start = Math.max(0, targetLine - 10);
        const end = Math.min(lines.length, targetLine + 10);
        const snippetLines = lines.slice(start, end).map((line, idx) => {
          const lineNum = start + idx + 1;
          const marker = lineNum === targetLine ? ' >> ' : '    ';
          return `${marker}${String(lineNum).padStart(4, ' ')} | ${line}`;
        });

        evidenceList.push({
          id: 'ev_source_context',
          type: EvidenceType.SOURCE_CONTEXT,
          source: targetRelPath,
          relevance: 0.90,
          content: sanitizeSecrets({
            file: targetRelPath,
            targetLine,
            snippet: snippetLines.join('\n'),
            totalLines: lines.length
          }),
          reason: `Target source context around failing line ${targetLine} in ${targetRelPath}`
        });
      }
    } catch (err) {
      // Path traversal or missing file gracefully caught
    }
  }

  // 4. Dependency & Framework Manifest Evidence
  if (workspacePath) {
    const pkgPath = path.join(workspacePath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        evidenceList.push({
          id: 'ev_dependency_manifest',
          type: EvidenceType.DEPENDENCY_METADATA,
          source: 'package.json',
          relevance: 0.45,
          content: sanitizeSecrets({
            name: pkg.name || 'unnamed-project',
            dependencies: Object.keys(pkg.dependencies || {}),
            scripts: Object.keys(pkg.scripts || {})
          }),
          reason: 'Identified Node.js runtime dependencies and npm entry scripts.'
        });
      } catch (e) {}
    }
  }

  // 5. Config / Environment Presence Evidence (Sanitized Keys Only)
  if (workspacePath) {
    const envPresence = {
      hasEnvExample: fs.existsSync(path.join(workspacePath, '.env.example')),
      hasEnv: fs.existsSync(path.join(workspacePath, '.env')),
      declaredKeys: []
    };

    if (envPresence.hasEnvExample) {
      try {
        const lines = fs.readFileSync(path.join(workspacePath, '.env.example'), 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const match = line.match(/^([A-Z0-9_]+)=/i);
          if (match) {
            envPresence.declaredKeys.push(match[1]);
          }
        }
      } catch (e) {}
    }

    if (envPresence.declaredKeys.length > 0) {
      evidenceList.push({
        id: 'ev_config_presence',
        type: EvidenceType.CONFIG_PRESENCE,
        source: '.env.example',
        relevance: 0.40,
        content: sanitizeSecrets(envPresence),
        reason: 'Detected required environment variable keys from template configuration.'
      });
    }
  }

  // 6. Test Failure Evidence if available
  if (testResults && testResults.failed > 0) {
    evidenceList.push({
      id: 'ev_test_failure',
      type: EvidenceType.TEST_FAILURE_OUTPUT,
      source: testResults.framework || 'test runner',
      relevance: 0.78,
      content: sanitizeSecrets({
        passed: testResults.passed,
        failed: testResults.failed,
        summary: testResults.summary
      }),
      reason: `Automated test suite reports ${testResults.failed} failing assertion(s).`
    });
  }

  // 7. Historical Repair Memory Evidence if matched
  if (historicalMatch && historicalMatch.similarity > 0.6) {
    evidenceList.push({
      id: 'ev_historical_memory',
      type: EvidenceType.HISTORICAL_MEMORY_MATCH,
      source: 'RepairMemory',
      relevance: 0.70 * historicalMatch.similarity,
      content: sanitizeSecrets({
        failureType: historicalMatch.failureType,
        rootCausePattern: historicalMatch.rootCausePattern,
        repairStrategy: historicalMatch.repairStrategy,
        similarity: historicalMatch.similarity
      }),
      reason: `Similar historical incident matched with ${(historicalMatch.similarity * 100).toFixed(0)}% pattern similarity.`
    });
  }

  // Sort by relevance score in descending order
  evidenceList.sort((a, b) => b.relevance - a.relevance);

  return evidenceList;
}

module.exports = {
  EvidenceType,
  collectEvidence
};
