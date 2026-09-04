# APIFIX AI — Production Operations Runbook (Phase 23)

## 1. Daily SRE Operational Checklist

| Task | Frequency | Command / Tool | Success Criteria |
| :--- | :--- | :--- | :--- |
| **Liveness Check** | Continuous | `GET /health` | HTTP 200, status `ok` |
| **Readiness Check** | Continuous | `GET /ready` | HTTP 200, status `ready` |
| **Prometheus Metrics** | 15s Scrape | `GET /health?format=prometheus` | Valid Prometheus exposition |
| **Worker Queue Depth** | 5 mins | `apifix workers` | Queue depth < 50, DLQ = 0 |
| **FinOps Cost Review** | Daily | `apifix costs --summary` | Spend within monthly budget |
| **Disaster Recovery** | Weekly | `apifix dr` | 12 / 12 Scenarios Passed |

---

## 2. Standard Operating Procedures (SOP)

### SOP-1: Handling High Database Latency or Saturation
1. Check active database connections: `node src/services/migrationRunner.js status`.
2. Inspect connection pool saturation via `GET /metrics`.
3. If circuit breaker enters `OPEN` state, verify Supabase PostgreSQL availability.
4. Transparent memory fallback preserves core read/write operations without service disruption.

### SOP-2: Worker Lease Timeout / Crash Recovery
1. The persistent job queue automatically recovers abandoned leases after 30 seconds.
2. Deduplication fingerprints prevent duplicate repair runs from executing.
3. Check dead-letter queue items: `apifix workers --list`.
4. Retry failed jobs: `apifix workers --retry-dlq <jobId>`.

### SOP-3: Emergency Launch Rollback
1. Execute CLI rollback check: `apifix deployment rollback-status`.
2. Trigger immediate canary traffic shift to previous stable revision:
   ```bash
   apifix deployment --rollback
   ```
3. Verify liveness and smoke tests on the restored version: `apifix deployment smoke`.
