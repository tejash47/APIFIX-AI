/**
 * APIFIX AI — AI Provider Observability & SRE Tracker (Phase 16)
 * Real-time performance tracking, error rate analysis, latency percentiles,
 * and zero-prompt-secret logging for LLM providers (Groq, Anthropic, OpenAI).
 */

const observabilityEngine = require('./observabilityEngine');
const { ErrorCodes } = require('../config/errorTaxonomy');

class AiProviderObserver {
  constructor() {
    this.reset();
  }

  reset() {
    this.providers = {
      groq: this._initProviderStats('groq'),
      anthropic: this._initProviderStats('anthropic'),
      openai: this._initProviderStats('openai')
    };
  }

  _initProviderStats(name) {
    return {
      name,
      requests: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      rateLimits: 0,
      fallbacks: 0,
      lastLatencyMs: 0,
      latencies: [],
      lastError: null,
      lastActiveAt: null
    };
  }

  /**
   * Records an AI invocation outcome with sanitized metadata.
   * @param {object} params
   */
  recordAiCall({
    provider = 'groq',
    model = 'default',
    durationMs = 0,
    success = true,
    error = null,
    isTimeout = false,
    isRateLimit = false,
    correlationId,
    workspaceId
  }) {
    const pKey = (provider || 'groq').toLowerCase();
    if (!this.providers[pKey]) {
      this.providers[pKey] = this._initProviderStats(pKey);
    }

    const stats = this.providers[pKey];
    stats.requests++;
    stats.lastActiveAt = new Date().toISOString();
    stats.lastLatencyMs = Math.round(durationMs);

    if (durationMs > 0) {
      stats.latencies.push(Math.round(durationMs));
      if (stats.latencies.length > 200) {
        stats.latencies.shift();
      }
    }

    let errorCode = null;

    if (success) {
      stats.successes++;
    } else {
      stats.failures++;
      if (isTimeout) {
        stats.timeouts++;
        errorCode = ErrorCodes.AI_TIMEOUT;
      } else if (isRateLimit) {
        stats.rateLimits++;
        errorCode = ErrorCodes.RATE_LIMITED;
      } else {
        errorCode = ErrorCodes.AI_PROVIDER_ERROR;
      }
      stats.lastError = error?.message || 'AI provider request failed.';
    }

    // Record in Centralized Observability Engine
    observabilityEngine.recordEvent({
      event: success ? 'ai_inference_completed' : 'ai_inference_failed',
      category: 'AI',
      stage: 'INFERENCE',
      durationMs,
      status: success ? 'SUCCESS' : 'FAILURE',
      errorCode,
      severity: isTimeout || stats.failures > 3 ? 'HIGH' : (success ? 'INFO' : 'MEDIUM'),
      provider: pKey,
      workspaceId: workspaceId || 'system',
      correlationId,
      metadata: {
        model,
        isTimeout,
        isRateLimit
      }
    });
  }

  /**
   * Records provider latency outcome
   */
  recordLatency(provider, durationMs, success = true, error = null) {
    const isTimeout = error && (String(error).includes('AI_TIMEOUT') || String(error).includes('timed out'));
    const isRateLimit = error && (String(error).includes('429') || String(error).includes('Rate limit'));
    return this.recordAiCall({
      provider,
      durationMs,
      success,
      error,
      isTimeout,
      isRateLimit
    });
  }

  /**
   * Records a provider fallback event (e.g. primary provider failed, falling back to secondary)
   */
  recordFallback({ fromProvider, toProvider, reason, correlationId, workspaceId }) {
    const fromKey = (fromProvider || '').toLowerCase();
    if (this.providers[fromKey]) {
      this.providers[fromKey].fallbacks++;
    }

    observabilityEngine.recordEvent({
      event: 'ai_provider_fallback',
      category: 'AI',
      stage: 'FALLBACK',
      status: 'SUCCESS',
      severity: 'HIGH',
      provider: toProvider,
      workspaceId: workspaceId || 'system',
      correlationId,
      metadata: {
        fromProvider,
        toProvider,
        reason: String(reason || 'Primary provider degraded')
      }
    });
  }

  /**
   * Evaluates operational status and latency percentiles for all providers
   */
  getProviderHealth() {
    const summary = {};

    for (const [key, stats] of Object.entries(this.providers)) {
      const samples = stats.latencies;
      const sorted = [...samples].sort((a, b) => a - b);
      const avg = samples.length > 0
        ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
        : 0;

      const p50 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0;
      const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;

      const errorRate = stats.requests > 0
        ? Number(((stats.failures / stats.requests) * 100).toFixed(1))
        : 0;

      let status = 'HEALTHY';
      if (stats.requests > 0) {
        if (errorRate >= 50 || stats.timeouts >= 3) {
          status = 'DEGRADED';
        }
        if (errorRate === 100 && stats.requests >= 3) {
          status = 'OUTAGE';
        }
      }

      summary[key] = {
        name: stats.name,
        status,
        totalRequests: stats.requests,
        successCount: stats.successes,
        failureCount: stats.failures,
        timeoutCount: stats.timeouts,
        rateLimitCount: stats.rateLimits,
        fallbackCount: stats.fallbacks,
        errorRatePercent: errorRate,
        avgLatencyMs: avg,
        p50LatencyMs: p50,
        p95LatencyMs: p95,
        lastActiveAt: stats.lastActiveAt
      };
    }

    return summary;
  }
}

const aiProviderObserver = new AiProviderObserver();

module.exports = aiProviderObserver;
