/**
 * APIFIX V2 — Production Graceful Shutdown Supervisor
 * Handles SIGTERM / SIGINT, stops HTTP ingress, kills sandbox child processes, releases locks, and exits cleanly.
 */

const logger = require('./logger');
const { lifecycleManager } = require('./lifecycleManager');

const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '15000', 10);
let isShuttingDown = false;

/**
 * Initializes graceful shutdown hooks on process signals.
 * @param {import('http').Server} server - Active Express HTTP server instance
 */
function registerGracefulShutdown(server) {
  const handleSignal = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info('shutdown_signal_received', {
      signal,
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
      message: 'Starting graceful shutdown. Draining requests, stopping workers, flushing telemetry...'
    });

    // Enforce maximum shutdown time
    const forceExitTimer = setTimeout(() => {
      logger.error('shutdown_timeout_exceeded', {
        message: 'Shutdown exceeded maximum timeout limit. Forcing process exit.'
      });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await lifecycleManager.executeShutdownSequence(signal);
      logger.info('shutdown_complete', { message: 'APIFIX backend exited cleanly.' });
      process.exit(0);
    } catch (err) {
      logger.error('shutdown_error', { error: err.message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}

function getShutdownStatus() {
  return isShuttingDown || lifecycleManager.isShuttingDown;
}

module.exports = {
  registerGracefulShutdown,
  getShutdownStatus,
  lifecycleManager
};

