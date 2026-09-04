const http = require('http');

const PROBE_TIMEOUT_MS = parseInt(process.env.PROBE_TIMEOUT_MS || '5000', 10);
const MAX_BODY_CAPTURE_BYTES = 4096; // 4 KB max body snapshot

/**
 * Performs a real HTTP request against the locally running child process.
 * @param {string} method 
 * @param {string} urlString 
 * @param {object|null} payload 
 * @param {string|null} authToken 
 * @returns {Promise<object>}
 */
function makeHttpRequest(method, urlString, payload = null, authToken = null) {
  return new Promise((resolve) => {
    const url = new URL(urlString);
    const startTime = Date.now();

    const headers = {
      'User-Agent': 'APIFIX-Reliability-Probe/2.0',
      'Accept': 'application/json, text/plain, */*'
    };

    let bodyData = null;
    if (payload && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      bodyData = typeof payload === 'string' ? payload : JSON.stringify(payload);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers,
      timeout: PROBE_TIMEOUT_MS
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        if (rawData.length < MAX_BODY_CAPTURE_BYTES) {
          rawData += chunk.toString();
        }
      });

      res.on('end', () => {
        const responseTimeMs = Date.now() - startTime;
        let parsedBody = rawData;
        try {
          parsedBody = JSON.parse(rawData);
        } catch (e) {}

        resolve({
          success: true,
          httpStatus: res.statusCode,
          responseTimeMs,
          headers: {
            'content-type': res.headers['content-type'] || 'unknown'
          },
          body: parsedBody,
          rawBody: rawData
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: `Request timed out after ${PROBE_TIMEOUT_MS}ms`,
        category: 'TIMEOUT',
        responseTimeMs: Date.now() - startTime
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        category: err.code === 'ECONNREFUSED' ? 'CONNECTION_REFUSED' : 'NETWORK_ERROR',
        responseTimeMs: Date.now() - startTime
      });
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

/**
 * Classifies an HTTP probe result into an actionable finding category.
 * @param {object} probeResult 
 * @param {string} stderr 
 */
function classifyResult(probeResult, stderr = '') {
  if (!probeResult.success) {
    return {
      category: probeResult.category || 'UNKNOWN',
      severity: 'CRITICAL',
      isFailure: true,
      reason: probeResult.error
    };
  }

  const code = probeResult.httpStatus;

  if (code >= 500) {
    const isException = /TypeError|ReferenceError|SyntaxError|UnhandledPromise|Cannot read/i.test(
      stderr + (typeof probeResult.body === 'string' ? probeResult.body : JSON.stringify(probeResult.body))
    );
    return {
      category: isException ? 'RUNTIME_EXCEPTION' : 'HTTP_5XX',
      severity: 'CRITICAL',
      isFailure: true,
      reason: `HTTP ${code} Internal Server Error`
    };
  }

  if (code === 404) {
    return {
      category: 'ROUTE_NOT_FOUND',
      severity: 'MEDIUM',
      isFailure: true,
      reason: 'HTTP 404 Route Not Found'
    };
  }

  if (code === 401 || code === 403) {
    return {
      category: 'AUTH_REQUIRED',
      severity: 'INFO',
      isFailure: false,
      reason: 'Endpoint requires authentication'
    };
  }

  if (code >= 400 && code < 500) {
    return {
      category: 'HTTP_4XX',
      severity: 'LOW',
      isFailure: false, // Controlled client-side response
      reason: `HTTP ${code} Client Response`
    };
  }

  return {
    category: 'HEALTHY',
    severity: 'NONE',
    isFailure: false,
    reason: `HTTP ${code} OK`
  };
}

/**
 * Probes all discovered endpoints against the locally running process.
 * @param {Array<object>} endpoints - Discovered endpoints
 * @param {number} port - Allocated child process port
 * @param {string|null} authToken - Optional user auth token
 * @param {string} stderrLogs - Current stderr output from process
 * @param {Function} onProbeStep - Optional callback per probe
 * @returns {Promise<object>}
 */
async function probeProjectEndpoints(endpoints, port, authToken = null, stderrLogs = '', onProbeStep = () => {}) {
  const results = [];
  let healthyCount = 0;
  let failedCount = 0;
  let authRequiredCount = 0;

  for (const ep of endpoints) {
    // Check if auth required without credentials
    if (ep.authRequired && !authToken) {
      const blockedResult = {
        endpointId: ep.id,
        method: ep.method,
        path: ep.path,
        sourceFile: ep.sourceFile,
        sourceLine: ep.sourceLine,
        status: 'BLOCKED — AUTH REQUIRED',
        category: 'AUTH_REQUIRED',
        severity: 'INFO',
        httpStatus: null,
        responseTimeMs: 0,
        isFailure: false,
        evidence: {
          message: 'Endpoint requires authentication credentials. No test token provided.',
          sourceFile: ep.sourceFile,
          sourceLine: ep.sourceLine
        }
      };
      authRequiredCount++;
      results.push(blockedResult);
      onProbeStep(blockedResult);
      continue;
    }

    // Perform live HTTP probe
    const targetUrl = `http://127.0.0.1:${port}${ep.path}`;
    const probeRes = await makeHttpRequest(ep.method, targetUrl, ep.suggestedPayload, authToken);
    const classification = classifyResult(probeRes, stderrLogs);

    if (classification.isFailure) {
      failedCount++;
    } else if (classification.category === 'AUTH_REQUIRED') {
      authRequiredCount++;
    } else {
      healthyCount++;
    }

    const finding = {
      endpointId: ep.id,
      method: ep.method,
      path: ep.path,
      sourceFile: ep.sourceFile,
      sourceLine: ep.sourceLine,
      status: classification.isFailure ? 'FAILED' : (classification.category === 'AUTH_REQUIRED' ? 'BLOCKED — AUTH REQUIRED' : 'HEALTHY'),
      category: classification.category,
      severity: classification.severity,
      httpStatus: probeRes.httpStatus || null,
      responseTimeMs: probeRes.responseTimeMs || 0,
      isFailure: classification.isFailure,
      evidence: {
        method: ep.method,
        targetUrl,
        payload: ep.suggestedPayload,
        responseStatus: probeRes.httpStatus,
        responseHeaders: probeRes.headers,
        responseBody: probeRes.body,
        error: probeRes.error || classification.reason,
        sourceFile: ep.sourceFile,
        sourceLine: ep.sourceLine,
        stderrSnippet: stderrLogs ? stderrLogs.slice(-2000) : ''
      }
    };

    results.push(finding);
    onProbeStep(finding);
  }

  return {
    totalDiscovered: endpoints.length,
    totalProbed: results.filter(r => r.category !== 'AUTH_REQUIRED' || r.httpStatus !== null).length,
    healthyCount,
    failedCount,
    authRequiredCount,
    results
  };
}

/**
 * Concurrently probes multiple endpoints in parallel for fast regression testing.
 * @param {Array<object>} endpoints 
 * @param {number} port 
 * @param {string|null} authToken 
 * @param {string} stderrLogs 
 */
async function probeProjectEndpointsParallel(endpoints, port, authToken = null, stderrLogs = '') {
  const probePromises = endpoints.map(async (ep) => {
    if (ep.authRequired && !authToken) {
      return {
        endpointId: ep.id,
        method: ep.method,
        path: ep.path,
        sourceFile: ep.sourceFile,
        sourceLine: ep.sourceLine,
        status: 'BLOCKED — AUTH REQUIRED',
        category: 'AUTH_REQUIRED',
        severity: 'INFO',
        httpStatus: null,
        responseTimeMs: 0,
        isFailure: false
      };
    }

    const targetUrl = `http://127.0.0.1:${port}${ep.path}`;
    const probeRes = await makeHttpRequest(ep.method, targetUrl, ep.suggestedPayload, authToken);
    const classification = classifyResult(probeRes, stderrLogs);

    return {
      endpointId: ep.id,
      method: ep.method,
      path: ep.path,
      sourceFile: ep.sourceFile,
      sourceLine: ep.sourceLine,
      status: classification.isFailure ? 'FAILED' : (classification.category === 'AUTH_REQUIRED' ? 'BLOCKED — AUTH REQUIRED' : 'HEALTHY'),
      category: classification.category,
      severity: classification.severity,
      httpStatus: probeRes.httpStatus || null,
      responseTimeMs: probeRes.responseTimeMs || 0,
      isFailure: classification.isFailure,
      evidence: {
        method: ep.method,
        targetUrl,
        responseStatus: probeRes.httpStatus,
        responseBody: probeRes.body,
        error: probeRes.error || classification.reason
      }
    };
  });

  const results = await Promise.all(probePromises);
  const failedCount = results.filter(r => r.isFailure).length;
  const healthyCount = results.filter(r => !r.isFailure && r.category !== 'AUTH_REQUIRED').length;
  const authRequiredCount = results.filter(r => r.category === 'AUTH_REQUIRED').length;

  return {
    totalDiscovered: endpoints.length,
    totalProbed: results.filter(r => r.category !== 'AUTH_REQUIRED' || r.httpStatus !== null).length,
    healthyCount,
    failedCount,
    authRequiredCount,
    results
  };
}

module.exports = {
  makeHttpRequest,
  classifyResult,
  probeProjectEndpoints,
  probeProjectEndpointsParallel
};
