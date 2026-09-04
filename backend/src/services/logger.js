/**
 * APIFIX V2 — Production Structured JSON Logger
 * Formats all application logs as structured JSON with contextual tracing and automatic secret scrubbing.
 */

const { sanitizeSecrets } = require('./securitySanitizer');

const LogLevels = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LOG_LEVEL = LogLevels[(process.env.LOG_LEVEL || 'INFO').toUpperCase()] ?? LogLevels.INFO;
const SERVICE_NAME = 'apifix-backend';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

/**
 * Emits a structured JSON log entry to stdout or stderr.
 * @param {string} level - DEBUG, INFO, WARN, ERROR
 * @param {string} event - Short event identifier
 * @param {object} meta - Context metadata (runId, requestId, durationMs, error, etc.)
 */
function log(level, event, meta = {}) {
  const levelNum = LogLevels[level] ?? LogLevels.INFO;
  if (levelNum < CURRENT_LOG_LEVEL) return;

  // Sanitize any metadata to prevent accidental secret leakage
  const safeMeta = sanitizeSecrets(meta || {});

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    event,
    ...safeMeta
  };

  // If duration is present, format as integer milliseconds
  if (typeof logEntry.durationMs === 'number') {
    logEntry.durationMs = Math.round(logEntry.durationMs);
  }

  const jsonString = JSON.stringify(logEntry);

  if (level === 'ERROR') {
    console.error(jsonString);
  } else if (level === 'WARN') {
    console.warn(jsonString);
  } else {
    console.log(jsonString);
  }

  return logEntry;
}

const logger = {
  debug: (event, meta) => log('DEBUG', event, meta),
  info: (event, meta) => log('INFO', event, meta),
  warn: (event, meta) => log('WARN', event, meta),
  error: (event, meta) => log('ERROR', event, meta),
  log
};

module.exports = logger;
