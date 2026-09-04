# APIFIX AI — Production Database Runbook

**System**: APIFIX Cloud Database & Merkle Audit Persistence  
**Database Engine**: PostgreSQL 15+ (Supabase Managed / Self-Hosted RDS)  
**Migration Framework**: Deterministic Versioned SQL with SHA-256 Checksums  
**Classification**: `[IMPLEMENTED]` / `[TESTED]`  

---

## 1. Architecture & Persistence Overview

APIFIX AI utilizes a hybrid persistence architecture:
1. **Primary Persistence**: Supabase Managed PostgreSQL with Row-Level Security (RLS).
2. **Local / Staging Fallback**: High-performance in-memory transactional database (`projectStore.js`, `incidentService.js`, `auditLedgerService.js`) ensuring high availability when database connection pools are offline or during initial startup.
3. **Audit Ledger**: Cryptographic SHA-256 Merkle chain stored in PostgreSQL with append-only tamper-proofing.

---

## 2. Migration Procedure

### Available Migrations
| Sequence | Migration File | Scope / Purpose | Checksum (SHA-256) |
| :--- | :--- | :--- | :--- |
| `001` | `001_init_schema.sql` | Core tables: `workspaces`, `projects`, `incidents`, `repairs` | `8b74153021...` |
| `002` | `002_multi_tenant_rbac.sql` | Multi-tenant organization scoping & RBAC roles | `59138c55bf...` |
| `003` | `003_resilience_dr.sql` | Job queue dead-letter & disaster recovery snapshots | `193eb78ae1...` |
| `004` | `004_governance_audit.sql` | Merkle audit ledger & cryptographic hash chain | `445d71dd8a...` |
| `005` | `005_api_keys_scim_sso.sql` | Scoped API keys, SCIM user provisioning, and SSO mappings | `d6d398a7ed...` |
| `006` | `006_finops_jobs.sql` | Billing records, credit meters, and usage ledgers | `f6e50fb894...` |
| `007` | `007_phase23_production_deployment.sql` | Production deployment status, canary gates, and audit logs | `c226bb8501...` |

### Step-by-Step Execution Runbook

```bash
# 1. Check current migration status against database
npm run db:status --prefix backend

# 2. Apply pending migrations with distributed lock safety
npm run db:migrate --prefix backend

# 3. Verify schema checksum integrity and index health
npm run db:verify --prefix backend
```

---

## 3. Backup Procedure

### Automated Point-in-Time Recovery (PITR)
- Supabase automatically maintains continuous WAL logs and daily snapshot backups with 30-day retention.

### Manual On-Demand Backup Runbook
```bash
# Export schema and data via standard pg_dump
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="apifix_backup_$(date +%Y%m%d_%H%M%S).dump"
```

---

## 4. Restore Procedure

To restore from a backup snapshot:

```bash
# 1. Put API in maintenance mode (read-only)
curl -X POST "$BACKEND_URL/api/admin/maintenance" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"enabled": true}'

# 2. Restore PostgreSQL database from dump
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname="$DATABASE_URL" \
  "apifix_backup_YYYYMMDD_HHMMSS.dump"

# 3. Verify integrity
npm run db:verify --prefix backend

# 4. Disable maintenance mode
curl -X POST "$BACKEND_URL/api/admin/maintenance" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"enabled": false}'
```

---

## 5. Emergency Rollback

If a migration fails or causes unexpected regression:

1. **Non-Destructive Principle**: APIFIX migrations only use additive schema changes (new columns, indexes, tables). Deletions or destructive alterations are forbidden.
2. **Schema Rollback**:
   ```sql
   -- Emergency disable of newly added feature flag
   UPDATE feature_flags SET enabled = false WHERE name = 'NEW_MIGRATION_FLAG';
   ```
3. **Database Failover to In-Memory Resilient Store**:
   - If PostgreSQL experiences sustained network degradation (> 5000ms), the connection pool circuit breaker (`databaseReliabilityService.js`) automatically trips to `OPEN`, falling back to the resilient in-memory store without terminating client traffic.

---

## 6. Schema & Row-Level Security (RLS) Verification

### RLS Policies
Every multi-tenant table enforces PostgreSQL Row-Level Security:
```sql
-- Workspace isolation policy
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_policy" ON incidents
  FOR ALL
  USING (workspace_id = current_setting('request.jwt.claim.workspace_id', true));
```

### Verification Command
```bash
node -e "
const { databaseReliabilityService } = require('./backend/src/services/databaseReliabilityService');
console.log('Database Health:', databaseReliabilityService.getHealthMetrics());
"
```
