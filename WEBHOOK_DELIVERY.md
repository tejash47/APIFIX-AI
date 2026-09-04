# APIFIX AI — Outbound Webhook Delivery Platform

## 1. Overview

APIFIX AI features an enterprise-grade outbound webhook delivery engine with cryptographic HMAC-SHA256 signing, exponential backoff retries with randomized jitter, dead-letter state tracking, SSRF defense, and a manual replay API.

---

## 2. Supported Outbound Events (17 Enterprise Events)

| Event Type | Category | Description |
| :--- | :--- | :--- |
| `incident.created` | Incidents | Triggered when a new API regression or failure is detected. |
| `incident.updated` | Incidents | Triggered when severity, status, or findings change. |
| `repair.started` | Self-Healing | Autonomous investigation or repair run launched. |
| `repair.completed` | Self-Healing | Repair successfully generated, validated, and merged. |
| `repair.failed` | Self-Healing | Autonomous repair rejected or failed quality gate. |
| `patch.created` | Code Engine | Deterministic patch synthesized and syntax-verified. |
| `verification.started` | Verification | Sandbox continuous verification suite started. |
| `verification.completed`| Verification | Continuous verification gate completed with result. |
| `approval.requested` | Governance | High-risk production repair submitted for dual approval. |
| `approval.approved` | Governance | Approval threshold met; repair unblocked. |
| `approval.rejected` | Governance | Reviewer rejected proposed patch. |
| `deployment.started` | CI/CD | Patch deployment initiated to target environment. |
| `deployment.completed`| CI/CD | Patch deployed and post-deployment canary verified. |
| `budget.warning` | Cost Intel | Organization or workspace reached 80% cost budget. |
| `budget.critical` | Cost Intel | Organization exceeded allocated budget threshold. |
| `security.alert` | Security | SSRF attempt, scope violation, or rate limit anomaly. |
| `compliance.control_failed`| Compliance | Continuous compliance automated control check failed. |

---

## 3. Webhook Delivery Lifecycle & Exponential Backoff

```
 [Event Dispatched] ───► [SSRF Check] ───► [HMAC Signing] ───► [HTTP POST Attempt 1]
                                                                        │
                                      ┌─────────────────────────────────┴─────────────────────────────────┐
                                      ▼                                                                   ▼
                               [2xx Success]                                                       [Non-2xx / Timeout]
                                      │                                                                   │
                              [Status: DELIVERED]                                              [Exponential Backoff + Jitter]
                                                                                                          │
                                                                                               [HTTP POST Attempt 2 & 3]
                                                                                                          │
                                                                                               ┌──────────┴──────────┐
                                                                                               ▼                     ▼
                                                                                          [2xx Success]        [All Failed]
                                                                                               │                     │
                                                                                          [DELIVERED]          [DEAD_LETTER]
```

### Backoff Timing Strategy

1. **Attempt 1**: Immediate dispatch (5s timeout).
2. **Attempt 2**: Wait `1000ms * 2^0 + random(0..200ms)` (~1.1s).
3. **Attempt 3**: Wait `1000ms * 2^1 + random(0..200ms)` (~2.1s).
4. **Final State**: If all 3 attempts fail, marked as `DEAD_LETTER`.

---

## 4. Webhook Verification Example (Node.js)

```javascript
const crypto = require('crypto');

function verifyWebhook(rawBody, signatureHeader, secret) {
  // Extract timestamp and signature components
  const parts = signatureHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).replace('t=', '');
  const receivedSig = parts.find(p => p.startsWith('v1=')).replace('v1=', '');

  // Verify timestamp is within 300 seconds tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false; // Stale or replayed webhook
  }

  // Compute expected HMAC SHA-256
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(receivedSig, 'hex'), Buffer.from(expectedSig, 'hex'));
}
```

---

## 5. Dead-Letter Replay API

Failed deliveries can be replayed programmatically via the Public API:

```http
POST /api/v1/webhooks/deliveries/:deliveryId/replay
Authorization: Bearer apifix_live_...
```

Response:
```json
{
  "data": {
    "deliveryId": "whd_1725432000000_replay_1",
    "endpointId": "whep_1725432000000_a1b2",
    "status": "DELIVERED",
    "statusCode": 200,
    "isReplay": true,
    "completedAt": "2026-09-04T06:05:00.000Z"
  }
}
```
