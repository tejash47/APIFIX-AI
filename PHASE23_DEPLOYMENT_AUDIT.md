# APIFIX AI — Phase 23 Deployment & Infrastructure Audit

## 1. Executive Runtime & Architecture Overview

APIFIX AI is an enterprise-grade autonomous API investigation, repair, verification, and governance platform. As of Phase 22, the platform is structured as a decoupled full-stack architecture comprising an Express/Node.js API and worker control plane, a Next.js 14 frontend web console, an official CLI automation tool, and a dual PostgreSQL/Supabase database persistence engine with transparent in-memory fallback.

| Layer | Runtime / Framework | Primary Port | Entrypoint | Build Command | Test Command |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend** | Node.js v20.x (Express) | `4000` / `$PORT` | `src/server.js` | N/A (Standard Node) | `node --test tests/*.test.js` |
| **Frontend** | Next.js 14.2.3 (React 18) | `3000` / `$PORT` | `src/app/page.tsx` | `npm run build` | `npm test` |
| **CLI** | Node.js v20.x CLI | N/A | `bin/apifix.js` | N/A | `node bin/apifix.js --help` |
| **Database** | Supabase Cloud PostgreSQL | `5432` / Pool | `supabase_schema.sql` | `npm run db:migrate` | `npm run db:verify` |

---

## 2. Environment Variables & Secret Classification

### A. Public Client Variables (`NEXT_PUBLIC_*`)
Exposed to browser client bundles during Next.js build and runtime:
- `NEXT_PUBLIC_BACKEND_URL`: Public backend API base endpoint (e.g., `https://api.apifix.ai` or `http://localhost:4000`).
- `NEXT_PUBLIC_APP_URL`: Public frontend web console URL (e.g., `https://app.apifix.ai`).

### B. Server-Only Operational Variables (Non-Secret)
Configures server networking, ports, log levels, and timeouts:
- `NODE_ENV`: `production` | `staging` | `development` | `test`
- `PORT`: Server listening port (default: `4000`)
- `FRONTEND_URL`: Canonical origin for CORS allowlist validation
- `ALLOWED_ORIGINS`: Comma-separated list of permitted HTTPS browser origins (no wildcards in production)
- `AI_REQUEST_TIMEOUT_MS`: AI inference timeout (default: `30000`)
- `APPROVAL_TIMEOUT_MS`: Human approval wait timeout (default: `300000`)
- `DB_QUERY_TIMEOUT_MS`: Database query timeout (default: `5000`)
- `APIFIX_DEMO_MODE`: `false` in production (enforces real execution)

### C. Server-Only Secret Variables (Strictly Confidential)
Must NEVER appear in source control, client bundles, Docker image layers, or logs:
- `JWT_SECRET`: High-entropy signing key (minimum 32 characters) for auth tokens
- `SUPABASE_URL`: HTTPS endpoint for Supabase project
- `SUPABASE_SERVICE_ROLE_KEY`: Privileged admin key for server-side PostgreSQL queries
- `STRIPE_SECRET_KEY`: Stripe API secret key (`sk_live_*` or `sk_test_*`)
- `STRIPE_WEBHOOK_SECRET`: HMAC signing secret for Stripe webhooks (`whsec_*`)
- `GROQ_API_KEY`: Groq AI provider API token
- `ANTHROPIC_API_KEY`: Anthropic Claude API token
- `OPENAI_API_KEY`: OpenAI API token
- `GITHUB_TOKEN`: GitHub Personal Access Token for remote PR automation
- `INBOUND_WEBHOOK_SIGNING_SECRET`: HMAC signing key for external incident webhooks

---

## 3. Storage, Filesystem & Ephemeral Constraints

1. **Workspace Sandboxes**:
   - Sandboxes created in `backend/workspaces/` during patch verification and dependency caching are isolated, ephemeral, and bounded.
   - Production containers must treat local filesystem storage as ephemeral. State that requires persistence (workspaces, repositories, incidents, audit logs, feature flags, billing records) is stored in Supabase PostgreSQL or the persistent job queue.
2. **Artifact Packaging**:
   - Repaired project ZIP archives (`backend/storage/`) are streamed and ephemeral, cleaned up post-download or uploaded to persistent object storage (S3/GCS/Supabase Storage) in cloud environments.
3. **Data Directories**:
   - `backend/data/` contains seed taxonomies and fallback persistence for offline/local environments.

---

## 4. Dependencies & Worker Model

1. **Job Queue & Crash Recovery**:
   - Persistent worker processes claim jobs via `jobQueueService.js` using 30s heartbeat leases and SHA-256 deduplication fingerprints.
   - Dead-letter queue (DLQ) with exponential backoff preserves unhandled failures across process restarts.
2. **Database Resilience**:
   - Connection pool circuit breaker (`CLOSED` → `OPEN` → `HALF-OPEN`) protects against cascading database brownouts.
   - Non-idempotent operations (charges, deletions) are strictly non-retried on transient failures to prevent duplicate side effects.
3. **AI Fallback Chain**:
   - Primary provider auto-failover (Claude 3.5 Sonnet → GPT-4o → Groq Llama 3.3) with circuit breakers and token-budget throttling.

---

## 5. Deployment Readiness Assessment

- **Dockerization**: Standard multi-stage build, non-root user (`node` / `nextjs`), healthchecks configured.
- **Database Migrations**: Deterministic, versioned migrations (001–007) with distributed locking.
- **CI/CD**: GitHub Actions workflow with full lint, typecheck, test, build, and security scanning.
- **Monitoring**: Prometheus standard exposition (`/health?format=prometheus`), structured JSON logs, Sentry/Datadog/Slack dispatcher.
- **Deployment Safety**: 6-stage canary rollout with automatic rollback triggers.
