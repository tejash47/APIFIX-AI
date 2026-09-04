/**
 * APIFIX AI — Standardized Operational Error Taxonomy (Phase 16)
 * Machine-readable operational error categories, severity classifications, and error normalization.
 */

const ErrorCodes = {
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_TIMEOUT: 'AI_TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  GITHUB_ERROR: 'GITHUB_ERROR',
  STRIPE_ERROR: 'STRIPE_ERROR',
  WEBHOOK_ERROR: 'WEBHOOK_ERROR',
  SANDBOX_ERROR: 'SANDBOX_ERROR',
  REPAIR_ERROR: 'REPAIR_ERROR',
  VERIFICATION_ERROR: 'VERIFICATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

const ErrorSeverity = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

/**
 * Maps operational error codes to default severity levels
 */
const DEFAULT_SEVERITIES = {
  [ErrorCodes.AUTHENTICATION_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCodes.AUTHORIZATION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCodes.VALIDATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCodes.AI_PROVIDER_ERROR]: ErrorSeverity.HIGH,
  [ErrorCodes.AI_TIMEOUT]: ErrorSeverity.HIGH,
  [ErrorCodes.RATE_LIMITED]: ErrorSeverity.MEDIUM,
  [ErrorCodes.DATABASE_ERROR]: ErrorSeverity.CRITICAL,
  [ErrorCodes.GITHUB_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCodes.STRIPE_ERROR]: ErrorSeverity.HIGH,
  [ErrorCodes.WEBHOOK_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCodes.SANDBOX_ERROR]: ErrorSeverity.HIGH,
  [ErrorCodes.REPAIR_ERROR]: ErrorSeverity.HIGH,
  [ErrorCodes.VERIFICATION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCodes.NETWORK_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCodes.INTERNAL_ERROR]: ErrorSeverity.CRITICAL
};

/**
 * Classifies an HTTP status code or raw Error into a standardized operational error object
 * @param {number|Error} statusOrError 
 * @param {Error|object} [optionalError] 
 * @returns {{ code: string, severity: string, message: string }}
 */
function classifyOperationalError(statusOrError, optionalError) {
  let statusCode = typeof statusOrError === 'number' ? statusOrError : (statusOrError?.statusCode || statusOrError?.status || 500);
  let err = typeof statusOrError === 'object' ? statusOrError : optionalError;
  let code = err?.code || null;
  let message = err?.message || (typeof statusOrError === 'string' ? statusOrError : 'An unexpected operational error occurred.');

  // If code is already recognized and not generic INTERNAL_ERROR, use it
  if (code && ErrorCodes[code] && code !== ErrorCodes.INTERNAL_ERROR) {
    return {
      code,
      severity: err?.severity || DEFAULT_SEVERITIES[code] || ErrorSeverity.HIGH,
      message
    };
  }

  // Infer from status code and message patterns
  const lowerMsg = (message || '').toLowerCase();

  if (statusCode === 401 || lowerMsg.includes('unauthorized') || lowerMsg.includes('jwt') || lowerMsg.includes('token')) {
    code = ErrorCodes.AUTHENTICATION_ERROR;
  } else if (statusCode === 403 || lowerMsg.includes('forbidden') || lowerMsg.includes('permission')) {
    code = ErrorCodes.AUTHORIZATION_ERROR;
  } else if (statusCode === 400 || statusCode === 422 || lowerMsg.includes('validation') || lowerMsg.includes('invalid')) {
    code = ErrorCodes.VALIDATION_ERROR;
  } else if (statusCode === 429 || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
    code = ErrorCodes.RATE_LIMITED;
  } else if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('econnreset')) {
    code = lowerMsg.includes('ai') || lowerMsg.includes('groq') || lowerMsg.includes('claude') || lowerMsg.includes('gpt')
      ? ErrorCodes.AI_TIMEOUT
      : ErrorCodes.NETWORK_ERROR;
  } else if (lowerMsg.includes('supabase') || lowerMsg.includes('postgres') || lowerMsg.includes('database')) {
    code = ErrorCodes.DATABASE_ERROR;
  } else if (lowerMsg.includes('github') || lowerMsg.includes('octokit') || lowerMsg.includes('git')) {
    code = ErrorCodes.GITHUB_ERROR;
  } else if (lowerMsg.includes('stripe') || lowerMsg.includes('invoice') || lowerMsg.includes('credit')) {
    code = ErrorCodes.STRIPE_ERROR;
  } else if (lowerMsg.includes('webhook') || lowerMsg.includes('signature')) {
    code = ErrorCodes.WEBHOOK_ERROR;
  } else if (lowerMsg.includes('sandbox') || lowerMsg.includes('docker') || lowerMsg.includes('port')) {
    code = ErrorCodes.SANDBOX_ERROR;
  } else if (lowerMsg.includes('verification') || lowerMsg.includes('regression')) {
    code = ErrorCodes.VERIFICATION_ERROR;
  } else if (lowerMsg.includes('patch') || lowerMsg.includes('ast') || lowerMsg.includes('repair')) {
    code = ErrorCodes.REPAIR_ERROR;
  } else if (lowerMsg.includes('groq') || lowerMsg.includes('anthropic') || lowerMsg.includes('openai') || lowerMsg.includes('llm')) {
    code = ErrorCodes.AI_PROVIDER_ERROR;
  } else {
    code = ErrorCodes.INTERNAL_ERROR;
  }

  return {
    code,
    severity: DEFAULT_SEVERITIES[code] || ErrorSeverity.HIGH,
    message
  };
}

module.exports = {
  ErrorCodes,
  ErrorSeverity,
  DEFAULT_SEVERITIES,
  classifyOperationalError
};
