const path = require('path');
const fs = require('fs');

/**
 * Patterns of sensitive secrets that must NEVER appear in logs, responses, or artifacts
 */
/**
 * Patterns of sensitive secrets that must NEVER appear in logs, responses, or artifacts
 */
const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{15,}/g,                          // GitHub Personal Access Token
  /github_pat_[a-zA-Z0-9_]{20,}/g,                   // Fine-grained GitHub PAT
  /gsk_[a-zA-Z0-9]{30,}/g,                          // Groq API Key
  /sk-ant-api[a-zA-Z0-9\-_]{30,}/g,                  // Anthropic API Key
  /sk-proj-[a-zA-Z0-9\-_]{30,}/g,                    // OpenAI Project Key
  /sk-[a-zA-Z0-9\-_]{30,}/g,                         // OpenAI API Key
  /sk_live_[a-zA-Z0-9]{20,}/g,                       // Stripe Live Secret Key
  /sk_test_[a-zA-Z0-9]{20,}/g,                       // Stripe Test Secret Key
  /rk_live_[a-zA-Z0-9]{20,}/g,                       // Stripe Restricted Live Key
  /rk_test_[a-zA-Z0-9]{20,}/g,                       // Stripe Restricted Test Key
  /whsec_[a-zA-Z0-9]{20,}/g,                         // Stripe Webhook Secret
  /sbp_[a-zA-Z0-9]{30,}/g,                          // Supabase Service Token
  /eyJ[a-zA-Z0-9_\-]{20,}\.eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}/g, // JWT Tokens
  /Bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi,              // Bearer Authorization Header values
  /postgres(?:ql)?:\/\/[^:]+:([^@]+)@/gi,           // Postgres DB Connection Strings with passwords
  /mongodb(?:\+srv)?:\/\/[^:]+:([^@]+)@/gi          // Mongo DB Connection Strings with passwords
];

/**
 * Redacts known secrets and dynamic environment variables from a string or object.
 * @param {string|object|any} input 
 * @returns {string|object|any} Sanitized output with secrets replaced with [REDACTED]
 */
function sanitizeSecrets(input) {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    let sanitized = input;

    // 1. Dynamic environment variables redaction
    const envVarsToRedact = [
      process.env.GROQ_API_KEY,
      process.env.ANTHROPIC_API_KEY,
      process.env.OPENAI_API_KEY,
      process.env.GITHUB_TOKEN,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.SUPABASE_ANON_KEY,
      process.env.STRIPE_SECRET_KEY,
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.INBOUND_WEBHOOK_SECRET,
      process.env.JWT_SECRET
    ].filter(val => val && typeof val === 'string' && val.trim().length > 6);

    for (const secret of envVarsToRedact) {
      sanitized = sanitized.split(secret).join('[REDACTED_SECRET]');
    }

    // 2. Regex pattern matching redaction
    for (const pattern of SECRET_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_CREDENTIAL]');
    }

    return sanitized;
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeSecrets);
  }

  if (typeof input === 'object') {
    const sanitizedObj = {};
    for (const [key, value] of Object.entries(input)) {
      // Redact sensitive object keys completely
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey.includes('credential')
      ) {
        if (typeof value === 'string' && value.length > 0) {
          sanitizedObj[key] = '[REDACTED]';
          continue;
        }
      }
      sanitizedObj[key] = sanitizeSecrets(value);
    }
    return sanitizedObj;
  }

  return input;
}

/**
 * Validates that a file path resolves strictly within the target workspace directory.
 * Prevents directory traversal attacks (e.g. `../../etc/passwd`, `/root`, `C:\Windows`).
 * @param {string} baseDir - Base root workspace directory (absolute path)
 * @param {string} targetRelPath - Relative path requested
 * @throws {Error} if path escapes baseDir or contains illegal sequences
 * @returns {string} Absolute resolved safe path
 */
function validateSafePath(baseDir, targetRelPath) {
  if (!baseDir || typeof baseDir !== 'string') {
    throw new Error('Security Violation: Invalid workspace base directory.');
  }

  if (!targetRelPath || typeof targetRelPath !== 'string') {
    throw new Error('Security Violation: File path is required.');
  }

  // Reject null-byte injection
  if (targetRelPath.includes('\0') || targetRelPath.includes('%00')) {
    throw new Error('Security Violation: Null byte detected in file path.');
  }

  // Reject URL-encoded path traversal sequences
  const decodedPath = decodeURIComponent(targetRelPath);
  if (decodedPath.includes('..') && (decodedPath.includes('/') || decodedPath.includes('\\'))) {
    if (decodedPath.split(/[/\\]/).includes('..')) {
      throw new Error(`Security Violation: Path traversal sequence detected in "${targetRelPath}".`);
    }
  }

  // Reject absolute paths or Windows drive paths (e.g., C:\ or D:) or UNC network shares
  if (path.isAbsolute(targetRelPath) || /^[a-zA-Z]:/i.test(targetRelPath) || /^\\\\/.test(targetRelPath)) {
    throw new Error(`Security Violation: Absolute or device path "${targetRelPath}" is forbidden.`);
  }

  // Normalize path
  const normalizedRel = path.normalize(targetRelPath).replace(/^[\\\/]+/, '');

  // Check for traversal segments
  if (normalizedRel === '..' || normalizedRel.startsWith('..' + path.sep) || normalizedRel.startsWith('../') || normalizedRel.split(/[/\\]/).includes('..')) {
    throw new Error(`Security Violation: Path traversal sequence detected in "${targetRelPath}".`);
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, normalizedRel);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`Security Violation: Path "${targetRelPath}" escapes workspace directory.`);
  }

  return resolvedTarget;
}

/**
 * Sanitized logging helper that prevents accidental console secret leaks
 */
const safeLogger = {
  log: (...args) => console.log(...args.map(sanitizeSecrets)),
  info: (...args) => console.info(...args.map(sanitizeSecrets)),
  warn: (...args) => console.warn(...args.map(sanitizeSecrets)),
  error: (...args) => console.error(...args.map(sanitizeSecrets))
};

module.exports = {
  sanitizeSecrets,
  sanitizeObject: sanitizeSecrets,
  validateSafePath,
  safeLogger
};
