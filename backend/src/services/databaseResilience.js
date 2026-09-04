/**
 * APIFIX AI — Database Resilience & Safe Transient Retry Wrapper (Phase 18)
 * Protects database interactions against transient network timeouts, connection resets,
 * and upstream Supabase hiccups with circuit breakers and bounded exponential retries.
 */

const { getCircuitBreaker } = require('./circuitBreaker');
const { isSupabaseConfigured } = require('../config/supabase');
const logger = require('./logger');

const DB_MAX_RETRIES = parseInt(process.env.DB_MAX_RETRIES || '2', 10);
const DB_BASE_RETRY_DELAY_MS = parseInt(process.env.DB_BASE_RETRY_DELAY_MS || '150', 10);

/**
 * Determines if an error is transient and safe for retry
 */
function isTransientDbError(err) {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = err.code || '';

  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    code === 'PGRST000' || // PostgREST connection error
    msg.includes('fetch failed') ||
    msg.includes('connection terminated') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504')
  );
}

/**
 * Executes a database operation with Circuit Breaker and safe bounded retry
 * @param {Function} queryFn - Asynchronous database query function
 * @param {object} [options] - { isIdempotent: boolean, fallbackFn: Function, maxRetries: number }
 * @returns {Promise<any>}
 */
async function executeResilientQuery(queryFn, options = {}) {
  const isIdempotent = options.isIdempotent !== false; // Default true (safe for reads)
  const maxRetries = options.maxRetries || DB_MAX_RETRIES;
  const fallbackFn = options.fallbackFn || null;

  const breaker = getCircuitBreaker('database:supabase', {
    failureThreshold: 5,
    cooldownMs: 20000,
    category: 'DATABASE'
  });

  return breaker.execute(async () => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await queryFn();
      } catch (err) {
        if (!isIdempotent || !isTransientDbError(err) || attempt >= maxRetries) {
          throw err;
        }

        attempt++;
        const delay = DB_BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 50);
        logger.warn('database_transient_retry', {
          attempt,
          delayMs: delay,
          reason: err.message
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }, fallbackFn);
}

module.exports = {
  executeResilientQuery,
  isTransientDbError,
  DB_MAX_RETRIES
};
