# APIFIX AI — Enterprise Idempotency Engine

## 1. Overview & RFC Conformance

APIFIX AI implements an end-to-end idempotency engine conforming to the IETF Idempotency-Key Header specification (`draft-ietf-httpapi-idempotency-key-header`). It guarantees that duplicate mutation requests (`POST`, `PUT`, `PATCH`, `DELETE`) with identical idempotency keys execute exactly once.

---

## 2. Request Processing Workflow

```
[Inbound Mutation] ──► [X-Idempotency-Key Present?]
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
              [NO]                           [YES]
                 │                             │
         [Normal Execute]        [Compute SHA-256 Payload Hash]
                                               │
                                 [Check Idempotency Cache]
                                               │
               ┌───────────────────────────────┼───────────────────────────────┐
               ▼                               ▼                               ▼
      [Cache Record Exists]            [Key Currently Locked]         [No Record (New Key)]
               │                               │                               │
    [Payload Hash Matches?]           [Return 409 Lock Error]          [Acquire 15s Mutex Lock]
        ┌──────┴──────┐                                                        │
        ▼             ▼                                                 [Execute Handler]
      [YES]          [NO]                                                      │
        │             │                                                 [Cache Response + Status]
 [Replay Cache]  [Return 409 Conflict]                                         │
 [X-Cache:       [IDEMPOTENCY_CONFLICT]                                 [Release Mutex Lock]
  IDEMPOTENT_                                                                  │
  REPLAY]                                                               [Return 200/201 Success]
```

---

## 3. Headers and Conflict Semantics

### Client Request Headers
- `X-Idempotency-Key`: A unique UUID or client-generated string (e.g., `idem_8f3a9e...`).

### Server Response Headers
- `X-Cache: IDEMPOTENT_REPLAY`: Returned when a cached response is served without re-executing the underlying handler.

### Conflict Response (HTTP 409)
If a client reuses an existing `X-Idempotency-Key` with a modified request body or target URL, the engine rejects the request:

```json
{
  "error": {
    "code": "IDEMPOTENCY_CONFLICT",
    "message": "Idempotency key was previously used with a different request payload or endpoint.",
    "requestId": "req_1725432000000_conflict",
    "retryable": false
  }
}
```

---

## 4. Deterministic Payload Fingerprinting

The payload fingerprint is computed using SHA-256 over a canonical representation with recursively sorted JSON keys:

```js
function hashRequestPayload(body) {
  const canonicalString = JSON.stringify(sortKeysRecursively(body || {}));
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}
```
This ensures whitespace or key-ordering variations in client JSON payloads do not produce false positive conflicts.
