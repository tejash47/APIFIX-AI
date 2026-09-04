# APIFIX AI — Hierarchical Sliding-Window Rate Limiting Engine

## 1. Overview & Tier Hierarchy

APIFIX AI implements a 4-tier hierarchical sliding-window rate limiter that enforces quotas concurrently across:
1. **Organization Tier**: Organization-wide aggregate capacity (e.g. 5,000 req/min for Enterprise tier).
2. **Workspace Tier**: Workspace-level fair share limit (e.g. 1,000 req/min).
3. **API Key Tier**: Individual API key token bucket (e.g. 300 req/min).
4. **Endpoint Tier**: Sensitive, compute-heavy endpoints (e.g., `/api/v1/repairs/analyze` capped at 30 req/min).

```
   [Inbound HTTP Request]
             │
             ▼
+───────────────────────────+
|   Organization Rate Limit |  (5,000 req/min)
+───────────────────────────+
             │  (Pass)
             ▼
+───────────────────────────+
|    Workspace Rate Limit   |  (1,000 req/min)
+───────────────────────────+
             │  (Pass)
             ▼
+───────────────────────────+
|     API Key Rate Limit    |  (300 req/min)
+───────────────────────────+
             │  (Pass)
             ▼
+───────────────────────────+
|    Endpoint Rate Limit    |  (30 req/min for AI repairs)
+───────────────────────────+
             │  (Pass)
             ▼
    [Execute Request]
```

---

## 2. Standard HTTP Response Headers

Every API response emitted through the API gateway includes standard rate limiting headers:

| Header | Description | Example |
| :--- | :--- | :--- |
| `X-RateLimit-Limit` | Maximum allowed requests in the current window. | `300` |
| `X-RateLimit-Remaining` | Remaining requests available before hitting threshold. | `284` |
| `X-RateLimit-Reset` | Seconds until current sliding window expires. | `45` |
| `X-RateLimit-Reset-Ms` | Milliseconds until current sliding window expires. | `45000` |
| `Retry-After` | (Only on 429) Recommended seconds to back off before retrying. | `45` |

---

## 3. Rate Limit Exceeded Envelope (HTTP 429)

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "API key request rate limit exceeded (300 req/min).",
    "level": "API_KEY",
    "retryAfterSeconds": 45,
    "requestId": "req_1725432000000_rate_limit",
    "retryable": true
  }
}
```

---

## 4. Sliding-Window Algorithm Implementation

Rather than fixed-window counters that suffer from burst boundary vulnerabilities, APIFIX AI uses a sliding-window timestamp bucket:

```js
function evaluateSlidingWindow(key, limit, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = store.get(key) || [];
  // Prune timestamps older than window
  timestamps = timestamps.filter(t => t > windowStart);

  if (timestamps.length >= limit) {
    const oldestTimestamp = timestamps[0];
    const resetSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, resetSeconds };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return { allowed: true, remaining: limit - timestamps.length, resetSeconds: Math.ceil(windowMs / 1000) };
}
```
