/**
 * APIFIX AI — API Usage & Developer Analytics Service
 * 
 * Collects, aggregates, and computes operational metrics (p50, p95, p99 latency,
 * error rates, endpoint distribution, API key consumption) in real-time.
 */

const { getMetrics } = require('./observabilityEngine');
const { getCostMetrics } = require('./costIntelligenceService');

// In-memory sliding sample window for latency & requests (last 10,000 samples)
const MAX_SAMPLES = 10000;
const latencySamples = [];
const requestCountsByEndpoint = new Map();
const requestCountsByStatusCode = new Map();
const requestCountsByApiKey = new Map();

/**
 * Record an API request telemetry sample
 */
function recordApiRequest({
  method = 'GET',
  endpoint = '',
  pathUrl = '',
  statusCode = 200,
  durationMs = 0,
  apiKeyId = null,
  organizationId = null,
  workspaceId = null
}) {
  const targetPath = endpoint || pathUrl || '/';
  const normalizedPath = String(targetPath).split('?')[0];

  // Record latency sample
  latencySamples.push(durationMs);
  if (latencySamples.length > MAX_SAMPLES) {
    latencySamples.shift();
  }

  // Record endpoint count
  const epKey = `${method.toUpperCase()} ${normalizedPath}`;
  requestCountsByEndpoint.set(epKey, (requestCountsByEndpoint.get(epKey) || 0) + 1);

  // Record status code count
  const statusGroup = `${Math.floor(statusCode / 100)}xx`;
  requestCountsByStatusCode.set(statusGroup, (requestCountsByStatusCode.get(statusGroup) || 0) + 1);

  // Record API key count
  if (apiKeyId) {
    requestCountsByApiKey.set(apiKeyId, (requestCountsByApiKey.get(apiKeyId) || 0) + 1);
  }
}

/**
 * Calculate percentile from sorted numbers
 */
function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
}

/**
 * Get comprehensive API usage analytics
 */
function getApiUsageAnalytics({ organizationId = null, workspaceId = null } = {}) {
  const sortedLatency = [...latencySamples].sort((a, b) => a - b);
  const totalRequests = sortedLatency.length;

  const p50 = calculatePercentile(sortedLatency, 50);
  const p95 = calculatePercentile(sortedLatency, 95);
  const p99 = calculatePercentile(sortedLatency, 99);
  const avgLatency = totalRequests > 0 ? Math.round(sortedLatency.reduce((a, b) => a + b, 0) / totalRequests) : 0;

  // Status code breakdown
  const statusCodes = {};
  for (const [code, count] of requestCountsByStatusCode.entries()) {
    statusCodes[code] = count;
  }

  const errorsCount = (statusCodes['4xx'] || 0) + (statusCodes['5xx'] || 0);
  const errorRatePercentage = totalRequests > 0 ? parseFloat(((errorsCount / totalRequests) * 100).toFixed(2)) : 0.0;

  // Top 10 endpoints
  const topEndpoints = Array.from(requestCountsByEndpoint.entries())
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top API keys
  const topApiKeys = Array.from(requestCountsByApiKey.entries())
    .map(([apiKeyId, count]) => ({ apiKeyId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const latency = {
    avg: avgLatency,
    avgMs: avgLatency,
    p50,
    p50Ms: p50,
    p95,
    p95Ms: p95,
    p99,
    p99Ms: p99
  };

  const summary = {
    totalRequests,
    latency,
    errorRatePercentage
  };

  return {
    period: 'live_sliding_window',
    totalRequests,
    latency,
    errorRatePercentage,
    statusCodes,
    topEndpoints,
    topApiKeys,
    summary,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  recordApiRequest,
  getApiUsageAnalytics,
  getUsageAnalytics: getApiUsageAnalytics
};
