# APIFIX AI — Background Worker Architecture & Crash Recovery (Phase 22)

## Durable Job Lifecycle State Machine

```
      ┌───────────┐
      │  QUEUED   │
      └─────┬─────┘
            │ Worker Claim (Lease Assigned)
            ▼
      ┌───────────┐
      │  CLAIMED  │
      └─────┬─────┘
            │ Execution Starts
            ▼
      ┌───────────┐
      │  RUNNING  │
      └─────┬─────┘
            ├──────────────────────┬──────────────────────┐
            │ Success              │ Transient Failure    │ Permanent / Max Retries
            ▼                      ▼                      ▼
      ┌───────────┐          ┌───────────┐          ┌─────────────┐
      │ SUCCEEDED │          │ RETRYING  │          │ DEAD_LETTER │
      └───────────┘          └───────────┘          └─────────────┘
```

---

## Lease Management & Zombie Recovery

1. **Timed Leases:** When a background worker claims a job, it is granted a lease with an expiration timestamp (default: 30 seconds).
2. **Heartbeat Renewal:** Active workers periodically renew their lease heartbeat (`jobQueueService.renewLease()`).
3. **Crash Detection:** If a worker node crashes or is terminated abruptly, its lease expires.
4. **Zombie Recovery Scanner:** The background recovery scanner detects expired leases and automatically reclaims the job:
   - If the job is idempotent and retries remain: transitions to `RETRYING`.
   - If non-idempotent or retries exhausted: routes to `DEAD_LETTER`.
