/**
 * APIFIX AI — Request Backpressure & Concurrency Control Middleware (Phase 18)
 * Protects backend services against sudden traffic surges, resource exhaustion,
 * and unbounded queuing by rejecting or queuing excess requests with standard Retry-After headers.
 */

const observabilityEngine = require('../services/observabilityEngine');
const logger = require('../services/logger');

class RequestBackpressureManager {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 25;
    this.maxQueueDepth = options.maxQueueDepth || 50;
    this.queueTimeoutMs = options.queueTimeoutMs || 10000; // 10s
    this.currentInFlight = 0;
    this.queue = [];
    this.totalRejectedCount = 0;
  }

  /**
   * Returns current load statistics
   */
  getStats() {
    return {
      currentInFlight: this.currentInFlight,
      maxConcurrent: this.maxConcurrent,
      queuedRequests: this.queue.length,
      maxQueueDepth: this.maxQueueDepth,
      totalRejectedCount: this.totalRejectedCount
    };
  }

  /**
   * Resets in-flight and queue counters
   */
  reset() {
    this.currentInFlight = 0;
    this.queue = [];
    this.totalRejectedCount = 0;
  }

  /**
   * Express middleware handler
   */
  middleware() {
    return (req, res, next) => {
      // 1. If capacity is immediately available, proceed
      if (this.currentInFlight < this.maxConcurrent) {
        this.currentInFlight++;

        const release = () => {
          this.currentInFlight--;
          this.drainQueue();
        };

        res.on('finish', release);
        res.on('close', release);
        return next();
      }

      // 2. If queue is full, reject immediately with HTTP 429
      if (this.queue.length >= this.maxQueueDepth) {
        this.totalRejectedCount++;
        const retryAfter = 10;

        logger.warn('request_backpressure_rejected', {
          path: req.originalUrl || req.url,
          inFlight: this.currentInFlight,
          queueDepth: this.queue.length
        });

        observabilityEngine.recordEvent({
          event: 'request_backpressure_rejected',
          category: 'PERFORMANCE',
          stage: 'BACKPRESSURE',
          status: 'FAILURE',
          metadata: {
            path: req.originalUrl || req.url,
            currentInFlight: this.currentInFlight,
            queueDepth: this.queue.length,
            retryAfter
          }
        });

        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: {
            code: 'REQUEST_BACKPRESSURE_EXCEEDED',
            message: 'Server capacity is temporarily saturated. Please retry with exponential backoff.',
            retryAfterSeconds: retryAfter,
            requestId: req.id || req.requestId || 'req_backpressure'
          }
        });
      }

      // 3. Queue request with timeout
      let timeoutTimer = null;
      const queuedItem = {
        req,
        res,
        next,
        execute: () => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          this.currentInFlight++;

          const release = () => {
            this.currentInFlight--;
            this.drainQueue();
          };

          res.on('finish', release);
          res.on('close', release);
          next();
        }
      };

      timeoutTimer = setTimeout(() => {
        const index = this.queue.indexOf(queuedItem);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.totalRejectedCount++;

          res.setHeader('Retry-After', '10');
          res.status(503).json({
            error: {
              code: 'QUEUE_TIMEOUT_EXCEEDED',
              message: 'Request waited in server backpressure queue for too long.',
              retryAfterSeconds: 10,
              requestId: req.id || req.requestId || 'req_queue_timeout'
            }
          });
        }
      }, this.queueTimeoutMs);

      this.queue.push(queuedItem);
    };
  }

  drainQueue() {
    if (this.queue.length > 0 && this.currentInFlight < this.maxConcurrent) {
      const nextItem = this.queue.shift();
      if (nextItem) {
        nextItem.execute();
      }
    }
  }
}

const defaultBackpressureManager = new RequestBackpressureManager({
  maxConcurrent: 25,
  maxQueueDepth: 50,
  queueTimeoutMs: 10000
});

module.exports = {
  RequestBackpressureManager,
  defaultBackpressureManager,
  requestBackpressureMiddleware: defaultBackpressureManager.middleware()
};
