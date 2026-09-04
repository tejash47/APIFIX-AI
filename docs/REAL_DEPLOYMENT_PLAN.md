# APIFIX AI — Real Cloud Deployment & Production Infrastructure Plan

**Document Version**: 1.0.0  
**Target Environments**: Production (`prod`), Staging (`stage`), Local Staging (`staging-local`)  
**Deployment Model**: Decoupled Cloud-Native SaaS with Ephemeral Worker Sandboxes  
**Classification**: `[IMPLEMENTED]` / `[TESTED]`  

---

## 1. Current Architecture Overview

APIFIX AI operates as an autonomous API investigation, repair, verification, and governance control plane. The system is engineered as a decoupled, multi-tenant full-stack platform:

```
+---------------------------------------------------------------------------------------------------+
|                                  APIFIX AI TOPOLOGY DIAGRAM                                       |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|   +--------------------------+          HTTPS / WSS          +--------------------------------+   |
|   |   Next.js 14 Frontend    | ----------------------------> |    Express.js Control Plane    |   |
|   |    (Vercel / Edge CDN)   |                               |     (Render / Railway / K8s)   |   |
|   +--------------------------+                               +--------------------------------+   |
|                                                                              |                    |
|                               +----------------------------------------------+                    |
|                               |                      |                       |                    |
|                               v                      v                       v                    |
|                     +-------------------+  +-------------------+  +---------------------+         |
|                     | Supabase Postgres |  | Redis / In-Memory |  | Ephemeral Sandboxes |         |
|                     |  (RLS + Merkle)   |  |   Leased Queue    |  |  (Dynamic TCP Port) |         |
|                     +-------------------+  +-------------------+  +---------------------+         |
|                                                      |                       |                    |
|                               +----------------------+                       |                    |
|                               v                                              v                    |
|                     +-------------------+                          +--------------------+         |
|                     | AI Cascade Engine |                          |  Stripe & Webhooks |         |
|                     | (Claude/GPT/Groq) |                          | (HMAC Verification)|         |
|                     +-------------------+                          +--------------------+         |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Platform Deployment Targets

| Component | Preferred Cloud Target | Fallback Target | Runtime / Plan | Health Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Web Console** | **Vercel** | Render Web Service / AWS Amplify | Next.js 14.2.3 (Node 20) | `GET /` |
| **Backend API Control Plane** | **Render** | Railway / AWS ECS Fargate | Node.js 20.x Express | `GET /health` |
| **Background Worker Pool** | **Render Background Worker** | Railway Worker / Worker Pod | Node.js 20.x Worker (`IS_WORKER_PROCESS=true`) | `GET /ready` |
| **Database & Persistence** | **Supabase Cloud PostgreSQL** | Managed AWS RDS PostgreSQL | PostgreSQL 15+ with RLS | `GET /health/deep` |
| **Payment Gateway** | **Stripe Cloud** | Stripe Test Mode API | API v2024+ (Webhooks) | `POST /api/billing/webhook` |
| **AI LLM Inference** | **Anthropic / OpenAI / Groq** | Local Ollama (`http://localhost:11434`) | REST HTTPS Multi-Provider | In-Engine Ping |

---

## 3. Environment Variable & Secret Architecture

### A. Public Client Variables (`NEXT_PUBLIC_*`)
Exposed only to browser bundles at build time:
- `NEXT_PUBLIC_BACKEND_URL`: Canonical backend API URL (`https://api.apifix.ai` or deployed Render URL).
- `NEXT_PUBLIC_APP_URL`: Canonical frontend domain (`https://app.apifix.ai`).

### B. Server-Only Operational Configuration (Non-Secret)
- `NODE_ENV`: `production` | `staging` | `development` | `test`
- `PORT`: HTTP listener port (default `4000` or assigned by host `$PORT`)
- `FRONTEND_URL`: Permitted CORS origin matching frontend domain
- `ALLOWED_ORIGINS`: Comma-separated allowlist of permitted HTTPS origins
- `AI_REQUEST_TIMEOUT_MS`: Maximum LLM inference wait time (`30000`)
- `APPROVAL_TIMEOUT_MS`: Governance approval expiration (`300000`)
- `DB_QUERY_TIMEOUT_MS`: PostgreSQL timeout threshold (`5000`)
- `APIFIX_DEMO_MODE`: Set to `false` in production (enforces real execution)

### C. Server-Only Confidential Secrets (Never Printed or Committed)
- `JWT_SECRET`: High-entropy signing secret ($\ge 32$ chars)
- `SUPABASE_URL`: HTTPS endpoint for Supabase project
- `SUPABASE_SERVICE_ROLE_KEY`: Service role JWT for administrative PostgreSQL operations
- `STRIPE_SECRET_KEY`: Live or Test Stripe API Secret (`sk_live_*` / `sk_test_*`)
- `STRIPE_WEBHOOK_SECRET`: HMAC signature verification key (`whsec_*`)
- `GROQ_API_KEY`: Groq Cloud API key (`gsk_*`)
- `ANTHROPIC_API_KEY`: Anthropic Claude API key (`sk-ant-*`)
- `OPENAI_API_KEY`: OpenAI API key (`sk-*`)
- `GITHUB_TOKEN`: GitHub fine-grained PAT with repository write permissions
- `INBOUND_WEBHOOK_SIGNING_SECRET`: HMAC key for external incident webhooks

---

## 4. Deployment Dependencies & Sequence

```
1. DATABASE INITIALIZATION
   ├── Connect to Supabase Cloud PostgreSQL
   ├── Run migration runner: npm run db:migrate (Migrations 001 - 007)
   └── Verify schema integrity: npm run db:verify
        │
2. BACKEND API DEPLOYMENT
   ├── Inject platform secrets via Render / Railway Environment Settings
   ├── Execute container build: npm ci --only=production
   ├── Validate configuration: configValidationService.validateOrThrow()
   ├── Launch server: npm start (Port $PORT)
   └── Verify endpoints: GET /health, GET /ready, GET /metrics
        │
3. WORKER POOL DEPLOYMENT
   ├── Provision dedicated worker instances (IS_WORKER_PROCESS=true)
   ├── Establish leased queue listener (heartbeat lease: 30s)
   └── Confirm DLQ and retry handler connectivity
        │
4. FRONTEND DEPLOYMENT
   ├── Configure NEXT_PUBLIC_BACKEND_URL to point to deployed Backend API
   ├── Execute static prerendering build: npm run build
   ├── Deploy to Vercel / Render Static Web Service
   └── Verify frontend health and browser CORS connectivity
        │
5. INTEGRATION & SMOKE VERIFICATION
   ├── Execute Production Smoke Suite: tests/production-smoke/smoke_test.js
   ├── Execute Controlled Self-Healing Repair on demo-api
   └── Sign off deployment release in PHASE25_RELEASE_CHECKLIST.md
```

---

## 5. Rollback Strategy & Incident Response

1. **Zero-Downtime Rollback Triggers**:
   - Backend `/health` or `/ready` returns non-200 for > 30 seconds.
   - P95 API response latency exceeds 500ms during initial 10% canary traffic.
   - Post-deployment smoke test encounters any `FAIL` condition.
2. **Rollback Execution**:
   - **Frontend**: Immediate redeployment of previous immutable deployment hash on Vercel/Render (instant < 5s shift).
   - **Backend**: Rollback container image tag to previous stable release tag via Render/Railway API.
   - **Database**: Execute non-destructive down-migration script or restore point-in-time backup from Supabase.

---

## 6. Verification Strategy & Known Risks

### Verification Strategy
- **Health Probes**: Automated curl requests against `/health`, `/ready`, `/health/deep`.
- **Smoke Tests**: 15-point contract verification checking auth, sandboxes, AI cascade, and billing.
- **Controlled Pilot**: End-to-end autonomous repair of `demo-api` unhandled `TypeError`.

### Known Risks & Mitigation
1. **AI Rate Limits / Outages**: Mitigated by multi-provider cascade (Claude $\rightarrow$ GPT-4o $\rightarrow$ Groq $\rightarrow$ Local Ollama) and circuit breaker backpressure.
2. **Ephemeral Disk Quotas**: Mitigated by bounded scratch sandboxes in temporary directories with deterministic cleanup hooks.
3. **Database Connection Saturation**: Mitigated by connection pool circuit breaker (`CLOSED` $\rightarrow$ `OPEN` $\rightarrow$ `HALF-OPEN`) and exponential backoff retry.
