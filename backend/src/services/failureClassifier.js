/**
 * APIFIX V2 — Phase 10: Standardized Failure Classifier
 * 
 * Classifies runtime failures into a standardized 15-category failure taxonomy
 * based on concrete evidence without guessing.
 */

const FailureCategory = {
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  ROUTING_ERROR: 'ROUTING_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  BUSINESS_LOGIC_ERROR: 'BUSINESS_LOGIC_ERROR',
  RESPONSE_FORMAT_ERROR: 'RESPONSE_FORMAT_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Classifies an incident using collected evidence.
 * 
 * @param {Array<Object>} evidenceList - List of evidence items from Evidence Engine
 * @returns {{ category: string, confidence: number, evidenceIds: Array<string>, reasoning: string }}
 */
function classifyFailure(evidenceList = []) {
  if (!Array.isArray(evidenceList) || evidenceList.length === 0) {
    return {
      category: FailureCategory.UNKNOWN,
      confidence: 0.0,
      evidenceIds: [],
      reasoning: 'Insufficient evidence collected to determine failure category.'
    };
  }

  // Extract relevant evidence contents
  const httpEvidence = evidenceList.find(e => e.type === 'HTTP_STATUS_AND_BODY');
  const stackEvidence = evidenceList.find(e => e.type === 'STACK_TRACE_FRAMES');
  const configEvidence = evidenceList.find(e => e.type === 'CONFIG_PRESENCE');
  const testEvidence = evidenceList.find(e => e.type === 'TEST_FAILURE_OUTPUT');

  const httpStatus = httpEvidence?.content?.status || 0;
  const errorType = (stackEvidence?.content?.errorType || '').toLowerCase();
  const errorMessage = (stackEvidence?.content?.errorMessage || '').toLowerCase();
  const responseBody = JSON.stringify(httpEvidence?.content?.responseBody || '').toLowerCase();
  const rawError = (httpEvidence?.content?.error || '').toLowerCase();

  const combinedText = `${errorType} ${errorMessage} ${responseBody} ${rawError}`;
  const matchedEvidenceIds = [];

  if (httpEvidence) matchedEvidenceIds.push(httpEvidence.id);
  if (stackEvidence) matchedEvidenceIds.push(stackEvidence.id);

  // 1. TIMEOUT
  if (httpStatus === 504 || combinedText.includes('timeout') || combinedText.includes('etimedout') || combinedText.includes('esockettimedout')) {
    return {
      category: FailureCategory.TIMEOUT,
      confidence: 0.95,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Request exceeded execution timeout threshold or socket timed out.'
    };
  }

  // 2. SYNTAX ERROR
  if (errorType.includes('syntaxerror') || combinedText.includes('unexpected token') || combinedText.includes('parsing error')) {
    return {
      category: FailureCategory.SYNTAX_ERROR,
      confidence: 0.98,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Source code contains invalid JavaScript/TypeScript syntax or malformed tokens.'
    };
  }

  // 3. DEPENDENCY ERROR
  if (combinedText.includes('cannot find module') || combinedText.includes('err_module_not_found') || combinedText.includes('module_not_found')) {
    return {
      category: FailureCategory.DEPENDENCY_ERROR,
      confidence: 0.96,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Required npm package or internal module is missing or cannot be resolved.'
    };
  }

  // 4. CONFIGURATION ERROR
  if (combinedText.includes('jwt_secret is not set') || combinedText.includes('missing environment variable') || combinedText.includes('invalid configuration') || (configEvidence && combinedText.includes('secret_missing'))) {
    if (configEvidence) matchedEvidenceIds.push(configEvidence.id);
    return {
      category: FailureCategory.CONFIGURATION_ERROR,
      confidence: 0.90,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Required environment variables or service configuration parameters are missing or invalid.'
    };
  }

  // 5. DATABASE ERROR
  if (combinedText.includes('postgres') || combinedText.includes('prisma') || combinedText.includes('sequelize') || combinedText.includes('mongoose') || combinedText.includes('sql') || combinedText.includes('econnrefused 5432') || combinedText.includes('econnrefused 27017')) {
    return {
      category: FailureCategory.DATABASE_ERROR,
      confidence: 0.92,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Database query execution, connection pool, or ORM validation failure.'
    };
  }

  // 6. ROUTING ERROR
  if (httpStatus === 404 || combinedText.includes('cannot get') || combinedText.includes('cannot post') || combinedText.includes('route not found') || combinedText.includes('endpoint not found')) {
    return {
      category: FailureCategory.ROUTING_ERROR,
      confidence: 0.90,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Requested route path or HTTP method is not registered in application router.'
    };
  }

  // 7. AUTHENTICATION ERROR
  if (httpStatus === 401 || combinedText.includes('unauthorized') || combinedText.includes('invalid token') || combinedText.includes('jwt expired') || combinedText.includes('invalid credentials') || combinedText.includes('missing authorization header')) {
    return {
      category: FailureCategory.AUTHENTICATION_ERROR,
      confidence: 0.94,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Client failed authentication credentials, token verification, or credentials check.'
    };
  }

  // 8. AUTHORIZATION ERROR
  if (httpStatus === 403 || combinedText.includes('forbidden') || combinedText.includes('insufficient permissions') || combinedText.includes('access denied')) {
    return {
      category: FailureCategory.AUTHORIZATION_ERROR,
      confidence: 0.92,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Authenticated user lacks required role, permission, or scope for resource.'
    };
  }

  // 9. VALIDATION ERROR
  if (httpStatus === 400 || httpStatus === 422 || combinedText.includes('validation error') || combinedText.includes('invalid request body') || combinedText.includes('is required')) {
    return {
      category: FailureCategory.VALIDATION_ERROR,
      confidence: 0.88,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Request payload failed schema validation or required parameter constraints.'
    };
  }

  // 10. NETWORK / CONNECTION ERROR
  if (combinedText.includes('econnrefused') || combinedText.includes('enotfound') || combinedText.includes('socket hang up') || httpStatus === 502 || httpStatus === 503) {
    return {
      category: FailureCategory.NETWORK_ERROR,
      confidence: 0.89,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Downstream network service connection refused or host unreachable.'
    };
  }

  // 11. RUNTIME ERROR (TypeErrors, Null pointer, unhandled exceptions)
  if (errorType.includes('typeerror') || errorType.includes('referenceerror') || errorType.includes('rangeerror') || combinedText.includes('cannot read propert') || combinedText.includes('null') || combinedText.includes('undefined') || httpStatus === 500) {
    return {
      category: FailureCategory.RUNTIME_ERROR,
      confidence: 0.95,
      evidenceIds: matchedEvidenceIds,
      reasoning: errorType.includes('typeerror')
        ? 'Runtime TypeError: unhandled property dereference on null or undefined value.'
        : 'Unhandled runtime exception thrown during request lifecycle.'
    };
  }

  // 12. BUSINESS LOGIC / RESPONSE FORMAT
  if (combinedText.includes('invalid format') || combinedText.includes('unexpected response format')) {
    return {
      category: FailureCategory.RESPONSE_FORMAT_ERROR,
      confidence: 0.75,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Response schema violates expected contract.'
    };
  }

  if (testEvidence) {
    matchedEvidenceIds.push(testEvidence.id);
    return {
      category: FailureCategory.BUSINESS_LOGIC_ERROR,
      confidence: 0.70,
      evidenceIds: matchedEvidenceIds,
      reasoning: 'Automated test assertions failed without unhandled runtime crash.'
    };
  }

  return {
    category: FailureCategory.UNKNOWN,
    confidence: 0.30,
    evidenceIds: matchedEvidenceIds,
    reasoning: 'Failure pattern does not match recognized diagnostic signatures.'
  };
}

module.exports = {
  FailureCategory,
  classifyFailure
};
