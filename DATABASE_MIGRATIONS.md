# APIFIX AI — Database Migration Architecture (Phase 23)

## 1. Migration Directory & Versioning

All database migrations are stored in `backend/migrations/` as sequentially ordered SQL files:

| Sequence | File | Version | Scope |
| :--- | :--- | :--- | :--- |
| `001` | `001_init_schema.sql` | `1.0.0` | Users & UUID extension |
| `002` | `002_multi_tenant_rbac.sql` | `12.0.0` | Workspaces, members, roles, repositories |
| `003` | `003_resilience_dr.sql` | `18.0.0` | Resilience events & DR runs |
| `004` | `004_governance_audit.sql` | `20.0.0` | Organizations, cryptographic audit ledger |
| `005` | `005_api_keys_scim_sso.sql` | `21.0.0` | Scoped API keys (SHA-256 hashes) & SSO |
| `006` | `006_finops_jobs.sql` | `22.0.0` | Persistent job queue & FinOps cost events |
| `007` | `007_phase23_production_deployment.sql` | `23.0.0` | Deployment records & migration registry |

---

## 2. Migration CLI Commands

```bash
# Check current migration status vs applied records
npm run db:status --prefix backend

# Verify migration file integrity and SHA-256 checksums
npm run db:verify --prefix backend

# Apply pending migrations with distributed locking
npm run db:migrate --prefix backend
```

---

## 3. Migration Safety Guarantees

1. **Distributed Locking**: Migrations acquire a non-reentrant distributed lock (`acquireMigrationLock`) to prevent race conditions during multi-instance container rollouts.
2. **Deterministic Checksums**: Every migration file is verified against its computed SHA-256 hash to detect post-deployment tampering.
3. **Zero Destructive Queries**: DDL commands use `IF NOT EXISTS` and avoid unconditional column or table drops.
