/**
 * APIFIX AI — Reusable Circuit Breaker Subsystem (Phase 18)
 * Implements fault tolerance, fail-fast protection, cooldown windows,
 * and half-open trial recovery for external dependencies.
 * 
 * States:
 * - CLOSED: Normal operation. Requests flow through. Failures are counted.
 * - OPEN: Tripped due to failure threshold. Requests fail fast without hitting upstream.
 * - HALF_OPEN: Cooldown expired. Trial requests test if upstream service has recovered.
 */

const observabilityEngine = require('./observabilityEngine');
const logger = require('./logger');
const { sanitizeSecrets } = require('./securitySanitizer');

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.cooldownMs = options.cooldownMs || 30000; // 30 seconds
    this.halfOpenMaxTrials = options.halfOpenMaxTrials || 2;
    this.timeoutMs = options.timeoutMs || 15000; // 15 seconds
    this.category = options.category || 'EXTERNAL_SERVICE';

    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.openedAt = null;
    this.lastFailureError = null;
    this.totalTrippedCount = 0;
  }

  /**
   * Returns the current state, dynamically evaluating if OPEN state has cooled down
   */
  getState() {
    if (this.state === CircuitState.OPEN) {
      const elapsed = Date.now() - (this.openedAt || 0);
      if (elapsed >= this.cooldownMs) {
        this.transitionTo(CircuitState.HALF_OPEN, 'Cooldown period elapsed. Commencing trial requests.');
      }
    }
    return this.state;
  }

  /**
   * Transitions the circuit breaker to a new state and records structured telemetry
   */
  transitionTo(newState, reason = '') {
    const previousState = this.state;
    if (previousState === newState) return;

    this.state = newState;
    const sanitizedReason = sanitizeSecrets(reason);

    if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now();
      this.totalTrippedCount++;
      this.consecutiveSuccesses = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses = 0;
      this.consecutiveFailures = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.openedAt = null;
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
      this.lastFailureError = null;
    }

    logger.warn('circuit_breaker_state_change', {
      circuitBreaker: this.name,
      from: previousState,
      to: newState,
      reason: sanitizedReason
    });

    observabilityEngine.recordEvent({
      event: `circuit_breaker_${newState.toLowerCase()}`,
      category: this.category,
      stage: 'CIRCUIT_BREAKER',
      status: newState === CircuitState.CLOSED ? 'SUCCESS' : 'FAILURE',
      metadata: {
        circuitBreaker: this.name,
        fromState: previousState,
        toState: newState,
        reason: sanitizedReason,
        consecutiveFailures: this.consecutiveFailures,
        totalTrippedCount: this.totalTrippedCount
      }
    });
  }

  /**
   * Executes an asynchronous operation through the circuit breaker
   * @param {Function} fn - Asynchronous function to execute
   * @param {Function} [fallbackFn] - Optional fallback function if circuit is open or execution fails
   * @returns {Promise<any>}
   */
  async execute(fn, fallbackFn = null) {
    const currentState = this.getState();

    // 1. If circuit is OPEN, fail fast
    if (currentState === CircuitState.OPEN) {
      const remainingCooldown = Math.max(0, this.cooldownMs - (Date.now() - this.openedAt));
      const err = new Error(
        `CIRCUIT_BREAKER_OPEN: [${this.name}] is OPEN. Requests blocked to prevent upstream flood. Cooldown: ${Math.round(remainingCooldown / 1000)}s remaining.`
      );
      err.code = 'CIRCUIT_BREAKER_OPEN';
      err.circuitName = this.name;
      err.retryAfterSeconds = Math.ceil(remainingCooldown / 1000);

      if (typeof fallbackFn === 'function') {
        return fallbackFn(err);
      }
      throw err;
    }

    // 2. Execute with bounded timeout
    let timer = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(`CIRCUIT_TIMEOUT: [${this.name}] execution exceeded timeout threshold of ${this.timeoutMs}ms.`);
          timeoutErr.code = 'CIRCUIT_TIMEOUT';
          reject(timeoutErr);
        }, this.timeoutMs);
      });

      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timer);

      this.recordSuccess();
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      this.recordFailure(err);

      if (typeof fallbackFn === 'function') {
        return fallbackFn(err);
      }
      throw err;
    }
  }

  /**
   * Records a successful execution
   */
  recordSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.halfOpenMaxTrials) {
        this.transitionTo(CircuitState.CLOSED, `Successfully passed ${this.consecutiveSuccesses} half-open trial requests.`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Records a failed execution
   */
  recordFailure(err) {
    this.lastFailureError = sanitizeSecrets(err?.message || String(err));

    if (this.state === CircuitState.HALF_OPEN) {
      // In half-open, any single failure immediately trips back to OPEN
      this.transitionTo(CircuitState.OPEN, `Trial request failed in HALF_OPEN state: ${this.lastFailureError}`);
    } else if (this.state === CircuitState.CLOSED) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN, `Consecutive failure threshold (${this.failureThreshold}) exceeded. Last error: ${this.lastFailureError}`);
      }
    }
  }

  /**
   * Manually resets circuit breaker to CLOSED
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.openedAt = null;
    this.lastFailureError = null;
  }

  /**
   * Returns diagnostic status snapshot
   */
  getStatus() {
    return {
      name: this.name,
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      failureThreshold: this.failureThreshold,
      cooldownMs: this.cooldownMs,
      totalTrippedCount: this.totalTrippedCount,
      lastFailureError: this.lastFailureError,
      openedAt: this.openedAt ? new Date(this.openedAt).toISOString() : null
    };
  }
}

/**
 * Global Circuit Breaker Registry
 */
const circuitRegistry = new Map();

function getCircuitBreaker(name, options = {}) {
  let breaker = circuitRegistry.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, options);
    circuitRegistry.set(name, breaker);
  }
  return breaker;
}

function getAllCircuitBreakersStatus() {
  const statusMap = {};
  for (const [name, breaker] of circuitRegistry.entries()) {
    statusMap[name] = breaker.getStatus();
  }
  return statusMap;
}

function resetAllCircuitBreakers() {
  for (const breaker of circuitRegistry.values()) {
    breaker.reset();
  }
}

module.exports = {
  CircuitState,
  CircuitBreaker,
  getCircuitBreaker,
  getAllCircuitBreakersStatus,
  resetAllCircuitBreakers,
  _circuitRegistry: circuitRegistry
};
