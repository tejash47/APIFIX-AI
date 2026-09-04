# APIFIX AI — Autonomous API Reliability & Repair Platform

> **"APIFIX AI does not merely generate a fix. It generates evidence that the fix works."**

APIFIX AI is an enterprise-grade autonomous AI reliability platform that detects API failures, discovers routes, reproduces runtime exceptions in isolated workspaces, performs AST-bounded root cause investigations, generates structured code patches, requires human approval, executes real dynamic-port verification and regression testing, packages sanitized codebase archives, and automatically opens verified GitHub Pull Requests.

---

## Production Architecture (V2 — Phases 1 to 11)

```
[ UNTRUSTED PROJECT INTAKE ] (ZIP upload or GitHub repo import with Zip Slip defense)
          ↓ 
[ IMMUTABLE ORIGINAL / WORKING WORKSPACE ] (Isolated dynamic sandboxes)
          ↓ 
[ DYNAMIC PROCESS SUPERVISOR & API DISCOVERY ] (Fast TCP socket readiness, port allocation, route extraction)
          ↓ 
[ LIVE HTTP FAILURE REPRODUCTION ] (Real HTTP probes capturing status, headers, body, stderr)
          ↓ 
[ EVIDENCE ENGINE & 15-CATEGORY TAXONOMY ] (Ranks structured diagnostic evidence by relevance)
          ↓ 
[ MULTI-HYPOTHESIS ROOT CAUSE ANALYSIS ] (Evaluates H1, H2, H3 with supporting/contradicting signals)
          ↓ 
[ SURGICAL REPAIR PLANNING & RISK SCORING ] (Enforces minimal patch scope vs broad rewrites)
          ↓ 
[ STRUCTURED MONACO PATCH & DIFF REVIEW ] (Human-in-the-loop review, syntax validation, path safety)
          ↓ 
[ TRANSACTIONAL PATCH APPLICATION ] (Atomic application to working workspace with rollback protection)
          ↓ 
[ 10 QUALITY GATES & SANDBOX VERIFICATION ] (Static AST, sandbox startup, crash elimination, project tests)
          ↓ 
[ REGRESSION INTELLIGENCE & DERIVED CONFIDENCE ] (Cross-route comparative analysis, evidence-weighted score)
          ↓ 
[ SANITIZED REPAIRED ZIP & GITHUB PR AUTOMATION ] (Zero-secret archives, automatic remote branch & PR creation)
          ↓
[ REPAIR MEMORY & HISTORICAL INCIDENT RECALL ] (Safe anonymized pattern persistence for future runs)
```

---

## Phase 11: Production Platform & Observability

1. **Centralized Environment Validation** (`backend/src/config/envValidator.js`):
   - Validates all AI provider credentials, GitHub tokens, Supabase database URLs, and timeouts.
   - Enforces zero-secret leakage with masked display strings.
   - `backend/.env` is strictly ignored by Git; `.env.example` contains placeholders only.

2. **Structured JSON Logging** (`backend/src/services/logger.js`):
   - Production JSON logs containing `timestamp`, `level`, `service`, `requestId`, `runId`, `stage`, `durationMs`, and `status`.
   - Strips authorization headers, API keys, and sensitive request payloads automatically.

3. **Health, Readiness & Metrics Endpoints**:
   - `GET /health` / `GET /api/health`: Light application liveness probe.
   - `GET /ready` / `GET /api/ready`: Deep dependency and configuration readiness check.
   - `GET /api/metrics`: In-memory operational metrics, success rates, latency averages, and rate-limit events.

4. **Sliding-Window Rate Limiting** (`backend/src/middleware/rateLimiter.js`):
   - In-memory sliding-window limiter per IP/token with standard and heavy route tiers.
   - Responds with `HTTP 429 Too Many Requests` and standard `Retry-After` header.

5. **Graceful Shutdown** (`backend/src/services/shutdownManager.js`):
   - Intercepts `SIGTERM` / `SIGINT` signals, terminates child sandbox processes, cancels active runs, and cleanly closes the HTTP server.

6. **Standardized API Error Contract** (`backend/src/middleware/errorHandler.js`):
   - Uniform `{ error: { code, message, requestId } }` error contract across all endpoints.
   - Redacts internal file paths and stack traces in production mode.

## Phase 12: Multi-Tenant Workspaces & RBAC
- **Multi-Tenant Workspace Isolation**: Workspaces partition repositories, repair runs, incidents, artifacts, and settings.
- **Hierarchical RBAC**: Four distinct roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) enforcing least-privilege access across all endpoints.
- **Dual Persistence Architecture**: Seamless Supabase PostgreSQL database persistence with automatic, zero-config in-memory/JSON fallback.

---

## Phase 13: Stripe Billing, Subscriptions & Credit System
1. **Centralized Plan & Pricing Configuration** (`backend/src/config/billingPlans.js`):
   - **Community Free**: 10 initial credits, 1 concurrent sandbox repair, standard AI models.
   - **Professional ($49/mo)**: 100 monthly credits, 5 concurrent repairs, multi-AI models (Claude 3.5 Sonnet, GPT-4o, Groq), priority queue.
   - **Enterprise Scale ($199/mo)**: 500 monthly credits, 10 concurrent repairs, custom SLAs, dedicated runners.
   - **Pay-As-You-Go Credit Packs**: 25 credits ($10), 100 credits ($35), 300 credits ($90).

2. **Stripe Integration & Hosted Sessions** (`backend/src/services/stripeClient.js`):
   - Hosted Stripe Checkout for subscription upgrades and one-time credit top-ups.
   - Stripe Customer Billing Portal for managing payment methods, invoices, and cancellations.
   - Zero-secret exposure: Stripe secret keys strictly confined to server-side `backend/.env`.

3. **Atomic Credit Ledger & Mutex Safety** (`backend/src/services/billingService.js`):
   - Immutable transaction ledger tracking `GRANT`, `CONSUMPTION`, `REFUND`, `RENEWAL`, and `PURCHASE`.
   - In-memory concurrency locks preventing double-spending during rapid parallel requests.
   - Strict negative balance prevention with `INSUFFICIENT_CREDITS` (HTTP 402).

4. **Cryptographic Webhook Intake & Idempotency** (`backend/src/routes/billingRoutes.js`):
   - Cryptographic signature validation via `stripe.webhooks.constructEvent(rawBody, signature, secret)`.
   - Persistent idempotency registry preventing replay attacks or duplicate credit grants.
   - Handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`.

5. **Usage Enforcement & Repair Pipeline Gating** (`backend/src/services/usageEnforcer.js`):
   - Gating check before starting autonomous repairs.
   - Automatic credit deduction on start with automatic credit refund if setup/probe fails before execution.

---

## Phase 14: Production UI/UX & Developer Experience
1. **Design System & Accessible Developer Theme**:
   - Dark-first developer tokens (`--background`, `--panel`, `--hairline`, `--primary`, `--verified`, `--signal`, `--alert`).
   - Accessible focus rings and `prefers-reduced-motion` compliance.
2. **Global Command Palette (`Ctrl+K` / `Cmd+K`)**:
   - Keyboard-navigable quick-jump modal indexing all tabs, quick actions, and incident tools.
3. **Global Toast Notification System**:
   - Non-intrusive `useToast()` provider with auto-dismiss timers and `aria-live="polite"` regions.
4. **Multi-Tab Dashboard Experience**:
   - Enriched subviews for Overview (6-stage linear pipeline, causal graph, SSE stream logs), APIs Registry, Incidents Tracker, Agent Runs, and Sandbox Test Suites.

---

## Phase 15: Inbound Webhooks, Synthetic Canary Prober & Alerting
1. **Inbound Webhook Receiver & Schema Normalizer** (`backend/src/services/inboundWebhookService.js`):
   - Cryptographically verified HMAC SHA-256 webhook intake (`/api/workspaces/:id/webhooks/inbound`).
   - Normalizes external alert schemas from Sentry, DataDog, PagerDuty, and custom HTTP webhooks.
2. **Proactive Synthetic Canary Prober** (`backend/src/services/syntheticProberService.js`):
   - Continuous background health check cycles against registered endpoints with latency & uptime telemetry.
   - Automated incident filing upon detecting HTTP 500 runtime exceptions.
3. **Multi-Channel Alert Dispatcher** (`backend/src/services/alertDispatcher.js`):
   - Outbound notifications for Slack, Discord, and custom HTTP webhooks.
   - Event-driven dispatch with zero-secret payload scrubbing (`securitySanitizer`).
4. **Autonomous Remediation Policy Engine** (`backend/src/services/remediationPolicyEngine.js`):
   - Configurable self-healing policies: `MANUAL_APPROVAL` (default), `AUTO_REPAIR_AND_PR`, `DIAGNOSE_ONLY`.
   - Enforces daily repair quotas and credit balance gating before automated repair execution.

---

## Phase 16: SRE, Production Observability & Operational Intelligence

1. **Centralized Telemetry & Correlation** (`backend/src/services/observabilityEngine.js`, `backend/src/middleware/correlationMiddleware.js`):
   - End-to-end request tracing via `X-Request-Id` and `X-Correlation-Id`.
   - In-memory circular telemetry stream (1,000 events) and real-time p50/p90/p95/p99 latency calculation.
   - Correlated execution trace graph (`getTraceTimeline`).
2. **AI Provider Health & SRE Metrics** (`backend/src/services/aiProviderObserver.js`):
   - Real-time tracking of Groq, Anthropic, and OpenAI calls, error rates, timeout counts, and fallback transitions.
3. **Repair Lifecycle & MTTR Engine** (`backend/src/services/repairTelemetryTracker.js`):
   - Mean Time to Detect (MTTD), Investigate (MTTI), Patch (MTTR), and Verify (MTTV).
4. **Standardized Error Taxonomy** (`backend/src/config/errorTaxonomy.js`):
   - Normalized operational error codes and severity classification.
5. **Alert Storm Deduplication & Incident Grouping** (`backend/src/services/alertDeduplicator.js`):
   - SHA-256 fingerprinting with 5-minute cooldown suppression.
6. **SLO Engine & Error Budgeting** (`backend/src/services/sloEngine.js`):
   - Real-time availability (99.9%), latency (<250ms), and repair success (>90%) tracking with error budgets.
7. **Background Worker Monitor** (`backend/src/services/workerMonitor.js`):
   - Concurrency tracking and zombie job prevention.
8. **Frontend SRE Command Center** (`frontend/src/components/ObservabilityView.tsx`):
   - Interactive SRE dashboard with System Health Matrix, AI Provider Telemetry Cards, MTTR Metrics Bar, SLO & Error Budget Gauges, and Zero-Secret Live Telemetry Stream.

---

## Phase 17: Production Deployment, Reliability & Launch Readiness

1. **Production HTTP Security Headers** (`backend/src/middleware/securityHeaders.js`):
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - Strips `X-Powered-By` header across all responses.

2. **CORS Origin Whitelisting & Config Validation**:
   - Enforces strict origin matching in production (`FRONTEND_URL` / `ALLOWED_ORIGINS`).
   - Fails fast on invalid or missing production environment secrets (`JWT_SECRET`, `NODE_ENV`).

3. **Multi-Subsystem Graceful Shutdown** (`backend/src/services/shutdownManager.js`):
   - Stops synthetic canary probers (`syntheticProberService.stopAll()`).
   - Cleans up stale worker jobs and releases concurrency locks (`workerMonitor.cleanupStaleJobs()`).
   - Terminates running sandbox processes and cleanly drains HTTP traffic on `SIGTERM`/`SIGINT`.

4. **Multi-Stage Production Docker Containers**:
   - `frontend/Dockerfile`: Multi-stage Next.js 14 non-root Alpine container with built-in healthchecks.
   - `docker-compose.yml`: Multi-service orchestration (`backend` + `frontend`) with unified bridge networking and health dependency gating.

5. **Deployment Guide & Operations Runbook** (`DEPLOYMENT.md`):
   - Step-by-step production setup, Supabase PostgreSQL migrations, rollbacks, and launch checklist.

---

## Phase 18: Scalability, Resilience & Disaster Recovery

1. **Reusable Circuit Breakers** (`backend/src/services/circuitBreaker.js`):
   - Fail-fast protection with standard `CLOSED`, `OPEN`, `HALF_OPEN` state transitions.
   - Dedicated circuit breakers for `ai:groq`, `ai:anthropic`, `ai:openai`, `github:api`, `stripe:api`, `database:supabase`, and `webhook:dispatch`.

2. **Multi-Tier AI Provider Fallback & Jittered Backoff** (`backend/src/services/aiProviderClient.js`):
   - Bounded exponential backoff with random jitter for transient errors (429/500/timeouts).
   - Seamless automatic failover across providers: `Groq` $\to$ `Anthropic Claude` $\to$ `OpenAI GPT-4o`.

3. **Request Backpressure & Concurrency Control** (`backend/src/middleware/requestBackpressure.js` & `runController.js`):
   - Concurrency limits: max 25 in-flight requests, 50 queue depth with `Retry-After: 10` headers on saturation.
   - Per-workspace repair concurrency cap (max 3) and global concurrency cap (max 10) with auto-expiring lock TTLs.

4. **Webhook Burst Deduplication** (`backend/src/services/inboundWebhookService.js`):
   - SHA-256 fingerprint sliding-window deduplication (5-minute window) and rate limits (100/min per workspace).

5. **Disaster Recovery & Continuity Runbook** (`DISASTER_RECOVERY.md`):
## Phase 19: Enterprise Security & Attack Surface Hardening
- **Automated SSRF Protection Engine**: Blocks loopback, private IPv4 (RFC 1918), IPv6, and Cloud Metadata IPs (169.254.169.254).
- **Inbound Webhook HMAC SHA-256 Authentication**: Timing-safe signature validation and instant key rotation.
- **Path Traversal & Zip Slip Prevention**: Strict canonical path validation rejecting traversal sequences.
- **Universal Secret Masking (`sanitizeSecrets`)**: Strips API keys, Stripe tokens, GitHub PATs, JWTs, and passwords.

---

## Phase 20: Enterprise Governance, Compliance & Cost Intelligence

1. **Organization Multi-Tenant Containment Hierarchy**:
   - `Organization -> Workspace -> Project -> Repository -> API -> Incident -> Repair Run`.
   - Strict tenant boundary isolation preventing IDOR attacks.

2. **8-Tier Enterprise Role Hierarchy & Capability Matrix**:
   - `OWNER`, `ADMIN`, `SECURITY_ADMIN`, `BILLING_ADMIN`, `SRE_ADMIN`, `DEVELOPER`, `MEMBER`, `VIEWER`.
   - Granular capability-based permissions with anti-elevation invariants.

3. **Pre-Execution Governance Policy Engine**:
   - Intercepts autonomous repair actions on protected branches or production repositories.
   - Evaluates compliance rules, budget caps, and model permissions before execution.

4. **Approval Workflow Engine & Anti-Self-Approval**:
   - Multi-reviewer sign-off workflows for high-risk operations.
   - Strict anti-self-approval enforcement (`FORBIDDEN_SELF_APPROVAL`).

5. **Compliance Control Center (11 Internal Categories)**:
   - Live automated verification for RBAC, Audit, Secrets, SSRF, Sandbox, AI, Cost, Approvals, Retention, and Export controls.
   - Transparent, truthful internal labeling (`"Control verified internally"`).

6. **Cryptographic Compliance Evidence Engine**:
   - Sealed SHA-256 compliance evidence bundles with verification APIs.

7. **Immutable Cryptographic Audit Ledger**:
   - SHA-256 block hash chaining with sequence numbers, timestamps, and previous hashes.
   - Instant tamper detection (`AUDIT_INTEGRITY_FAILURE`) and permanent deletion protection.

8. **Cost Intelligence & Multi-Tier Budgets**:
   - Multi-dimensional spend tracking across AI inference, synthetic probes, webhooks, sandbox compute, and storage.
   - 80% (Warning), 90% (Critical), and 100% (Throttling) thresholds with security incident bypass enclave.

9. **Configurable Data Retention & Legal Hold Engine**:
   - 30, 90, 180, and 365-day retention tiers with active incident protection and dry-run preview mode.

10. **Enterprise Data Export**:
    - Sanitized JSON/CSV exports with SHA-256 data integrity checksums.

11. **Enterprise Administrative Cockpit UI**:
    - Dedicated `/admin` route with tabs for Overview, Compliance, Costs, AI Governance, Approvals, Audit Explorer, and Retention.

---

## Phase 21: Enterprise Integration Platform & Developer Ecosystem

1. **Versioned Public API Platform (`/api/v1/*`)**:
   - Uniform response envelopes (`data`, `meta.requestId`, `meta.correlationId`, `meta.apiVersion`, `meta.timestamp`).
   - Standardized RFC 7807 error contracts with automatic secret scrubbing.
   - Comprehensive `/api/v1/projects`, `/api/v1/incidents`, `/api/v1/runs`, `/api/v1/repairs`, `/api/v1/verification`, `/api/v1/webhooks`, `/api/v1/api-keys`.

2. **Enterprise API Key Management**:
   - Cryptographic SHA-256 storage (strictly zero plaintext secrets stored).
   - Fine-grained scopes (`read:projects`, `write:runs`, `repairs:execute`, `verify:all`, `webhooks:manage`, `admin:all`).
   - Automated key rotation, revocation, and immutable Phase 20 audit logging.

3. **Enterprise Idempotency & Hierarchical Rate Limiting**:
   - Idempotency engine with deterministic JSON key sorting and payload hashing (`X-Idempotency-Key`, `X-Cache: IDEMPOTENT_REPLAY`, 409 Conflict).
   - 4-Tier sliding window rate limiter (`Organization` -> `Workspace` -> `API Key` -> `Endpoint`).

4. **Outbound Webhooks Platform (17 Events)**:
   - Cryptographic HMAC-SHA256 signing (`X-APIFIX-Signature: t=...,v1=...`).
   - Exponential backoff retries with randomized jitter, dead-letter state tracking, SSRF defense, and manual replay API.

5. **Enterprise Identity, SCM, SCIM & CI/CD**:
   - SCM Providers: Unified GitHub, GitLab, and Bitbucket branch/commit/PR abstractions.
   - SSO & JIT Provisioning: OIDC, SAML 2.0, Microsoft Entra ID, Google Workspace with group-to-role mappings.
   - SCIM 2.0: RFC 7644 `/scim/v2/Users` and `/scim/v2/Groups` directory provisioning.
   - Official APIFIX CLI tool (`cli/bin/apifix.js`) with deterministic exit codes (0–5).
   - Interactive Frontend Developer Portal (`/developer`).
   - OpenAPI 3.1 Specification (`GET /openapi.json`).

---

- 🛡️ [Production Readiness & Launch Audit Guide](PRODUCTION_READINESS.md)
- 🚀 [Production Deployment & Zero-Downtime Rollback](DEPLOYMENT.md)
- 💰 [FinOps Engine & AI Cost Optimization](FINOPS.md)
- 🐳 [Production Deployment Architecture](DEPLOYMENT.md)
- 📖 [Production Runbook & SRE Operations](PRODUCTION_RUNBOOK.md)
- ⚙️ [Multi-Environment CI/CD Automation](CI_CD.md)
- ☁️ [Cloud Architecture & Topology](CLOUD_ARCHITECTURE.md)
- 🔒 [Enterprise Secret Management & Entropy Rules](SECRET_MANAGEMENT.md)
- 🗄️ [Versioned Database Migrations & Safety](DATABASE_MIGRATIONS.md)
- 💾 [Non-Destructive Backup & Restore Verification](BACKUP_RESTORE.md)
- 🧪 [20-Point Production Smoke Testing](PRODUCTION_SMOKE_TESTS.md)
- 🚨 [Incident Response & SRE Escalation Matrix](INCIDENT_RESPONSE.md)
- 📋 [Phase 23 Deployment Audit & Launch Certification](PHASE23_DEPLOYMENT_AUDIT.md)
- ⚙️ [Background Worker Crash Recovery & Dead-Letter Queue](WORKER_RECOVERY.md)
- 🔄 [12-Scenario Automated Disaster Recovery Guide](DR_VERIFICATION.md)
- ⚙️ [Production Configuration Reference](PRODUCTION_CONFIGURATION.md)
- 📊 [SRE Metrics & Prometheus Exporter](METRICS.md)
- 🚩 [Enterprise Feature Flags Management](FEATURE_FLAGS.md)
- 🔌 [Enterprise Public API Platform](API_PLATFORM.md)
- 🔐 [API Security & Key Architecture](API_SECURITY.md)
- 📡 [Outbound Webhook Delivery Platform](WEBHOOK_DELIVERY.md)
- 🔄 [Enterprise Idempotency Engine](IDEMPOTENCY.md)
- ⏱️ [Hierarchical Rate Limiting Engine](RATE_LIMITING.md)
- 💻 [Interactive Developer Portal UI](DEVELOPER_PORTAL.md)
- 🖥️ [Official Enterprise CLI Guide](CLI.md)
- 🚀 [CI/CD Platform Integration & Quality Gates](CI_CD_INTEGRATION.md)
- 🆔 [Enterprise Identity & SSO Guide](IDENTITY_INTEGRATION.md)
- 👥 [SCIM 2.0 Directory Provisioning Guide](SCIM.md)
- 📖 [OpenAPI 3.1 Specification & SDK Guide](OPENAPI_GUIDE.md)
- 📘 [Enterprise Governance Architecture](ENTERPRISE_GOVERNANCE.md)
- 🛡️ [Compliance Controls Framework](COMPLIANCE_CONTROLS.md)
- 🤖 [AI Governance & Safety Plane](AI_GOVERNANCE.md)
- 💰 [Cost Intelligence & Budgeting](COST_INTELLIGENCE.md)
- 🔒 [Immutable Cryptographic Audit Ledger](AUDIT_LEDGER.md)
- 🗄️ [Data Retention & Legal Holds](DATA_RETENTION.md)
- 🏢 [Enterprise Admin UI & Cockpit Guide](ENTERPRISE_ADMIN.md)
- 🔐 [Security Architecture](SECURITY_ARCHITECTURE.md)

---

## Quickstart & Local Development

### 1. Backend Setup & Migrations
```bash
cd backend
cp .env.example .env
npm install

# Check database migration status & verify integrity
npm run db:status
npm run db:verify

# Apply versioned database migrations (001 - 007)
npm run db:migrate

# Start local dev server
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Production Docker Setup
```bash
# Build and run multi-stage production profile
docker compose -f docker-compose.production.yml up --build -d

# Verify container health
docker compose -f docker-compose.production.yml ps
```

### 4. Official CLI Setup & Deployment Commands
```bash
# Link CLI locally
cd cli
npm link

# Deployment safety & preflight inspection
apifix deployment check --json
apifix deployment preflight --json
apifix deployment version --json
apifix deployment smoke --json
apifix deployment rollback-status --json

# Test platform commands
apifix status
apifix readiness
apifix metrics
apifix costs
apifix workers
apifix dr
```

### 5. Full Platform Verification Suite
```bash
# Phase 23 Dedicated Deployment Suite (145 tests, 100% pass)
cd backend
node --test tests/phase23_*.test.js

# Standalone 20-Point Production Smoke Tests
node tests/production-smoke/smoke_test.js

# Backup & Restore Verification Drill
node scripts/verify-backup-restore.js

# Frontend Unit Tests, Typecheck & Production Build (11 static routes, 0 errors)
cd ../frontend
npm test
npm run build
```

---

## Security Model & Secret Safety
- **Strict Git Ignore**: `backend/.env`, `workspaces/`, `storage/`, `data/` are excluded from Git.
- **Never Commit Secrets**: Real secrets must ONLY exist in local environment files.
- **Automated Secret Scanner**: Continuous entropy scanning ensures zero plaintext API keys across all logs, telemetry, configs, and frontend bundles.
- **Strict Redaction**: API keys and tokens are automatically replaced with `[REDACTED]` in all logs, artifacts, telemetry streams, and PR metadata.



