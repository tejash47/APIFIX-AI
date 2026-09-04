# APIFIX AI — Enterprise Versioned Public API Platform (/api/v1/*)

## 1. Overview & Architecture

The APIFIX AI Public API Platform exposes a high-performance, versioned RESTful interface (`/api/v1/*`) enabling engineering organizations to integrate autonomous API investigation, continuous verification quality gates, webhook delivery, source control automation, and enterprise governance into their custom toolchains and internal developer portals (IDPs).

```
+-----------------------------------------------------------------------------------+
|                           ENTERPRISE CLIENT / CI/CD                               |
|                  (APIFIX CLI, GitHub Actions, Backstage IDP, SDK)                 |
+-----------------------------------------------------------------------------------+
                                         │
                   HTTPS / JSON API      │ (Bearer apifix_live_..., X-Idempotency-Key)
                                         ▼
+───────────────────────────────────────────────────────────────────────────────────+
|                           API GATEWAY / MIDDLEWARE PIPELINE                       |
|  ├─ 1. Correlation Tracing: (X-Request-Id, X-Correlation-Id)                      |
|  ├─ 2. Authentication & Scope Validator (SHA-256 Hashed Keys, JWT SSO)            |
|  ├─ 3. Hierarchical Rate Limiter (Org -> Workspace -> Key -> Endpoint)            |
|  ├─ 4. Idempotency Engine (SHA-256 Payload Hash, Lock Mutex, Replay Cache)         |
|  └─ 5. Secret Scrubbing & Universal Envelope Serialization                        |
+───────────────────────────────────────────────────────────────────────────────────+
                                         │
        ┌───────────────────┬────────────┴────────────┬───────────────────┐
        ▼                   ▼                         ▼                   ▼
+───────────────+   +───────────────+         +───────────────+   +───────────────+
| /api/v1/runs  |   | /api/v1/verify|         |/api/v1/webhook|   |/api/v1/api-key|
| Autonomous    |   | Continuous    |         | 17 Outbound   |   | Scoped Key    |
| Self-Healing  |   | Quality Gates |         | Webhook Engine|   | Lifecycle     |
+───────────────+   +───────────────+         +───────────────+   +───────────────+
```

---

## 2. Universal Response Envelope Contract

Every successful response from `/api/v1/*` is encapsulated in a standardized envelope conforming to RFC 7807 principles with automated zero-secret redaction:

```json
{
  "data": {
    "id": "proj_api_gateway_core",
    "name": "API Gateway Core",
    "healthScore": 98.5,
    "status": "ACTIVE"
  },
  "meta": {
    "requestId": "req_1725432000000_a1b2",
    "correlationId": "corr_1725432000000_c3d4",
    "apiVersion": "v1",
    "timestamp": "2026-09-04T06:00:00.000Z"
  }
}
```

### Paginated Collections Envelope

```json
{
  "data": [ ... ],
  "meta": {
    "requestId": "req_1725432000000_e5f6",
    "correlationId": "corr_1725432000000_g7h8",
    "apiVersion": "v1",
    "timestamp": "2026-09-04T06:00:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalCount": 142,
      "totalPages": 8,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

---

## 3. Standardized Error Contract

All 4xx and 5xx errors emit structured diagnostic envelopes. Stack traces, database connection strings, and sensitive credentials are scrubbed before serialization.

```json
{
  "error": {
    "code": "INSUFFICIENT_SCOPE",
    "message": "API key lacks required scope: 'repairs:execute'.",
    "requestId": "req_1725432000000_j9k0",
    "correlationId": "corr_1725432000000_l1m2",
    "retryable": false
  }
}
```

### Standard Error Codes

| Error Code | HTTP Status | Retryable | Description |
| :--- | :--- | :--- | :--- |
| `UNAUTHORIZED` | 401 | No | Missing or malformed authentication header. |
| `INVALID_API_KEY` | 401 | No | Key not found, invalid hash, or expired. |
| `API_KEY_REVOKED` | 401 | No | The specified API key has been revoked. |
| `INSUFFICIENT_SCOPE` | 403 | No | API key is missing required permissions. |
| `POLICY_VIOLATION_BLOCKED` | 403 | No | Blocked by Enterprise Governance policy. |
| `IDEMPOTENCY_CONFLICT` | 409 | No | Same idempotency key provided with different payload. |
| `SSRF_PROTECTION_TRIGGERED`| 400 | No | Destination URL resolves to loopback, private, or metadata IP. |
| `RATE_LIMIT_EXCEEDED` | 429 | Yes | Sliding window threshold exceeded at org/workspace/key level. |
| `INTERNAL_ERROR` | 500 | Yes | Internal server error (retryable via exponential backoff). |

---

## 4. Public API v1 Endpoint Catalog

| HTTP Method | Route | Required Scope | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/projects` | `read:projects` | List all monitored projects. |
| `GET` | `/api/v1/projects/:id` | `read:projects` | Retrieve project health and route metadata. |
| `POST` | `/api/v1/projects/:id/sync` | `write:projects` | Trigger OpenAPI spec resync & route discovery. |
| `GET` | `/api/v1/incidents` | `read:incidents` | List active & resolved API failure incidents. |
| `GET` | `/api/v1/incidents/:id` | `read:incidents` | Retrieve root-cause analysis & failure evidence. |
| `GET` | `/api/v1/runs` | `read:runs` | List autonomous investigation & repair runs. |
| `POST` | `/api/v1/runs` | `write:runs` | Trigger autonomous investigation / repair run. |
| `GET` | `/api/v1/runs/:id` | `read:runs` | Get run execution state and timeline. |
| `DELETE` | `/api/v1/runs/:id` | `write:runs` | Cancel an in-flight autonomous run. |
| `POST` | `/api/v1/repairs/analyze` | `repairs:execute`| Generate root-cause hypothesis & patch candidate. |
| `POST` | `/api/v1/repairs/apply` | `repairs:execute`| Apply validated patch to target workspace. |
| `POST` | `/api/v1/verification/verify` | `verify:all` | Execute deterministic verification gate. |
| `GET` | `/api/v1/webhooks` | `webhooks:manage`| List outbound webhook subscriptions. |
| `POST` | `/api/v1/webhooks` | `webhooks:manage`| Register new webhook subscription. |
| `GET` | `/api/v1/api-keys` | `admin:all` | List workspace API keys. |
| `POST` | `/api/v1/api-keys` | `admin:all` | Create new scoped API key. |
| `DELETE` | `/api/v1/api-keys/:id` | `admin:all` | Revoke an API key immediately. |
| `GET` | `/api/v1/usage/analytics` | `audit:read` | Retrieve real-time latency percentiles (p50/p95/p99). |
| `GET` | `/status` | *Public* | Platform component health and uptime metrics. |
| `GET` | `/openapi.json` | *Public* | Full OpenAPI 3.1 schema specification. |
