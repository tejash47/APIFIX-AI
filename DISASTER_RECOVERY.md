# APIFIX AI — Disaster Recovery & Business Continuity Runbook (Phase 18)

This runbook establishes operational procedures for **Disaster Recovery (DR)**, **High Availability (HA)**, **Circuit Breaker Management**, **Backup & Restore Procedures**, and **Zero-Downtime Incident Response** for the APIFIX AI Reliability Platform.

---

## 1. Reliability & Recovery Objectives

| Metric | Target | Description |
|---|---|---|
| **RPO (Recovery Point Objective)** | **< 1 Hour** | Maximum acceptable data loss period for credit ledgers, incidents, and workspace configurations. |
| **RTO (Recovery Time Objective)** | **< 15 Minutes** | Maximum acceptable downtime to restore API control plane, repair workers, and webhooks to full operational capacity. |
| **Availability SLA** | **99.95%** | Permitted monthly downtime of $\le 21.6$ minutes. |
| **Circuit Breaker Fail-Fast** | **< 50ms** | Upstream outages fail fast immediately without exhausting local thread/connection pools. |

---

## 2. Platform Architecture & Redundancy

```
                              [ Load Balancer / CDN ]
                                         │
                    ┌────────────────────┴────────────────────┐
                    │                                         │
          ┌─────────▼─────────┐                     ┌─────────▼─────────┐
          │  APIFIX Primary   │                     │  APIFIX Standby   │
          │  Node.js Ingress  │                     │  Node.js Ingress  │
          └─────────┬─────────┘                     └─────────┬─────────┘
                    │                                         │
       ┌────────────┼────────────────────────────┐            │
       │            │                            │            │
┌──────▼──────┐ ┌───▼───────────┐         ┌──────▼──────┐     │
│ Circuit     │ │ Bounded Queue │         │ Database    │◄────┘
│ Breakers    │ │ (Backpressure)│         │ Resilience  │
│ (AI/Stripe) │ └───────────────┘         │ (Supabase)  │
└─────────────┘                           └──────┬──────┘
                                                 │
                                          ┌──────▼──────┐
                                          │ Point-in-   │
                                          │ Time Backup │
                                          └─────────────┘
```

---

## 3. Circuit Breaker Subsystem

The platform isolates all external third-party dependencies using dedicated, auto-recovering circuit breakers.

### Managed Circuit Breakers:
- `ai:groq` — Groq LLM Inference Gateway
- `ai:anthropic` — Anthropic Claude Gateway
- `ai:openai` — OpenAI GPT-4o Gateway
- `github:api` — GitHub REST & GraphQL APIs
- `stripe:api` — Stripe Subscriptions & Invoicing
- `database:supabase` — Supabase PostgreSQL & PostgREST
- `webhook:dispatch` — Outbound Alert Notification Dispatch

### State Machine Lifecycle:
1. **CLOSED**: Normal state. All requests flow through. Failures are counted in a sliding window.
2. **OPEN**: Failure threshold exceeded ($\ge 5$ consecutive failures). Requests fail fast immediately with `HTTP 503 / 429` and `Retry-After: 30` headers. Zero outbound network calls are made.
3. **HALF_OPEN**: Cooldown period (30s) elapses. A trial request tests upstream connectivity.
   - If trial succeeds $\to$ Circuit resets to **CLOSED**.
   - If trial fails $\to$ Circuit trips back to **OPEN** for another cooldown window.

### Health Inspection:
```bash
curl -s http://localhost:4000/ready | jq .checks.circuitBreakers
```

---

## 4. Failure Mode Runbooks

### Runbook A: Total Primary AI Provider Outage (`ai:groq` down)
**Symptoms:** Error spike on Groq endpoints; `circuit_breaker_opened` telemetry events.
**Automated Response:**
1. Circuit breaker trips `ai:groq` to `OPEN`.
2. AI client automatically routes in-flight repair analysis to secondary provider (`Anthropic Claude 3.5 Sonnet`).
3. If Anthropic is degraded, requests automatically cascade to tertiary (`OpenAI GPT-4o`).
4. Fallback transition is recorded in `aiProviderObserver`.
**Operator Actions:**
- Monitor `/api/observability/summary` to verify fallback traffic distribution.
- No manual intervention is required.

---

### Runbook B: Database Outage / Network Partition (`database:supabase` unreachable)
**Symptoms:** Supabase connection resets (`ECONNRESET`, `502`, `503`); PostgreSQL pool saturation.
**Automated Response:**
1. Idempotent read operations automatically retry with jittered exponential backoff (max 2 retries).
2. If connection is completely lost, database circuit breaker trips to `OPEN`.
3. Platform seamlessly engages **In-Memory & Local JSON Fast Fallback** (`data/*.json`).
4. Inbound webhooks continue to be ingested and deduplicated; active repairs proceed without interruption.
**Operator Actions:**
- Check Supabase control plane status.
- Once connectivity is restored, circuit breaker automatically re-syncs state during `HALF_OPEN` trial probe.

---

### Runbook C: Webhook Surge / Flooding Attack
**Symptoms:** Spike in webhook ingestion rate from a compromised or misconfigured monitor.
**Automated Response:**
1. Inbound SHA-256 fingerprinting deduplicates identical alerts within a 5-minute sliding window (`deduplicated: true`).
2. Per-workspace rate limiter enforces a strict cap of **100 webhooks/minute**.
3. Excessive flood requests are rejected with `HTTP 429` and `Retry-After` header.
**Operator Actions:**
- Inspect `inbound_webhook_deduplicated` telemetry events in SRE Command Center.
- Rotate workspace webhook secret if compromise is suspected (`POST /api/workspaces/:id/webhooks/rotate`).

---

### Runbook D: Worker Crash & Orphan Process Recovery
**Symptoms:** Node process terminated during live sandbox execution; temporary project files left on disk.
**Automated Response:**
1. `workerMonitor.cleanupStaleJobs()` automatically scans active job registry on intervals and transitions stalled jobs to `TIMED_OUT`.
2. `runController.cleanupStaleRunLocks()` automatically expires target locks older than 15 minutes.
3. `shutdownManager` captures SIGTERM / SIGINT, signals child process abort controllers, executes process tree termination (`taskkill /T /F` or `SIGKILL`), and rolls back uncommitted workspace patches.
**Operator Actions:**
- Check worker telemetry: `GET /api/observability/summary`.

---

## 5. Database Backup & Restoration Runbook

### 5.1 Automated Scheduled Backups (PostgreSQL)
Supabase automatically takes daily point-in-time recovery (PITR) snapshots.
For self-hosted instances:
```bash
# Manual full database dump
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -Fc -f "/backup/apifix_backup_$(date +%Y%m%d_%H%M%S).dump"
```

### 5.2 Local Storage & Project Workspace Backup
To back up active project workspaces and local data stores:
```bash
tar -czvf "/backup/apifix_storage_$(date +%Y%m%d_%H%M%S).tar.gz" \
  backend/data/ \
  backend/storage/
```

### 5.3 Point-in-Time Database Restoration
```bash
# Restore PostgreSQL dump into fresh database
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -c "/backup/apifix_backup_YYYYMMDD_HHMMSS.dump"
```

### 5.4 Verification of Restored Instance
1. Run Health Check: `curl http://localhost:4000/health`
2. Run Readiness Check: `curl http://localhost:4000/ready`
3. Verify test suite: `npm test`

---

## 6. Disaster Recovery Drill Schedule

To maintain disaster readiness, conduct regular failure drills:
- **Bi-Monthly**: Simulate primary AI provider outage by revoking Groq key in staging and verifying Anthropic/OpenAI fallback.
- **Quarterly**: Execute database restore from backup into an isolated staging cluster and run `backend/tests/phase18_acceptance_e2e.js`.
- **Quarterly**: Run chaos failure injection suite: `node --test backend/tests/phase18_chaos.test.js`.
