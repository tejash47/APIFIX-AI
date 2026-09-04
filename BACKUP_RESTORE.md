# APIFIX AI — Backup & Restore Disaster Recovery Guide (Phase 23)

## 1. Backup Strategy & SLA Requirements

- **Recovery Point Objective (RPO)**: < 1 hour (Continuous WAL replication + hourly snapshots)
- **Recovery Time Objective (RTO)**: < 15 minutes (Automated point-in-time recovery)
- **Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Retention**: Daily backups retained for 30 days; monthly archives retained for 365 days.

---

## 2. Automated Backup Verification Drill

The `scripts/verify-backup-restore.js` tool runs in CI/CD and production monitoring routines:
```bash
# Execute backup verification drill
node scripts/verify-backup-restore.js
```

### Verification Criteria
1. **Catalog Recency**: Most recent backup age must be < 24 hours.
2. **Checksum Integrity**: SHA-256 hash matches the cryptographic manifest.
3. **Table Completeness**: All 9 core schemas (`users`, `workspaces`, `workspace_members`, `repositories`, `incidents`, `audit_ledger`, `api_keys`, `job_queue`, `finops_cost_events`) are present.
4. **Schema Compatibility**: Snapshot DDL matches the active backend version.

---

## 3. Disaster Recovery Execution

In the event of a catastrophic database failure:
1. Run automated DR drill: `apifix dr`
2. Verify all 12 disaster recovery test scenarios pass with zero duplicate billing, zero duplicate repairs, and zero secret leakage.
