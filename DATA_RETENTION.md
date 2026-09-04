# APIFIX AI — Enterprise Data Retention & Lifecycle Management

## Executive Overview

APIFIX AI Phase 20 provides an automated **Data Retention Engine** allowing organizations to manage data lifecycles according to internal policies and compliance guidelines.

---

## 1. Configurable Retention Tiers

Organizations can configure retention periods at the organization and workspace scopes:

| Retention Tier | Retention Duration | Applicable Data Scope |
| :--- | :--- | :--- |
| **Standard (30 Days)** | 30 Days | Debug logs, temporary AST caches, ephemeral run artifacts |
| **Operational (90 Days)** | 90 Days | Historical probe records, test runner stdout/stderr, incident diagnostics |
| **Extended (180 Days)** | 180 Days | Resolved incident metadata, AI hypothesis transcripts |
| **Compliance (365 Days / 1 Year)** | 365 Days | Cryptographic compliance evidence, approval audit trails |

---

## 2. Active Incident & Legal Hold Protection

> [!IMPORTANT]
> **Legal Hold Guarantee**: The Data Retention Engine performs automated safety pre-checks before deleting any historical artifact:
> 1. **Active Incidents**: Any incident in status `OPEN`, `INVESTIGATING`, or `PENDING_APPROVAL` is permanently protected from retention purges.
> 2. **Explicit Legal Hold**: Any evidence or incident tagged `legalHold: true` cannot be purged by scheduled cleanup jobs.
> 3. **Immutable Audit Trail**: The SHA-256 chained audit ledger is **exempt** from standard retention purges to preserve complete historical accountability.

---

## 3. Dry-Run Simulation & Purge APIs

Administrators can preview the impact of a retention cleanup without executing destructive changes:

### Preview Retention Purge (Dry-Run)
`POST /api/retention/dry-run`
```json
{
  "organizationId": "org_enterprise_primary",
  "retentionDays": 90
}
```

Response:
```json
{
  "dryRun": true,
  "eligibleForDeletion": {
    "repairRuns": 42,
    "incidents": 18,
    "artifacts": 60,
    "estimatedBytesReclaimed": 52428800
  },
  "protectedItems": {
    "activeIncidents": 3,
    "legalHolds": 1
  }
}
```

### Execute Retention Purge
`POST /api/retention/execute`
```json
{
  "organizationId": "org_enterprise_primary",
  "retentionDays": 90,
  "confirmed": true
}
```
Response:
```json
{
  "dryRun": false,
  "deletedRecords": 120,
  "reclaimedBytes": 52428800,
  "executedAt": "2026-09-04T05:30:00.000Z",
  "auditEventId": "aud_retention_9921"
}
```
