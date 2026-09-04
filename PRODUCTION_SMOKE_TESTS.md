# APIFIX AI — Production Smoke Test Suite Guide (Phase 23)

## 1. Overview & Non-Destructive Invariant

The 20-point production smoke test suite (`tests/production-smoke/smoke_test.js`) verifies critical application pathways without mutating live customer data or executing destructive operations.

```bash
# Execute production smoke test suite
node tests/production-smoke/smoke_test.js
```

---

## 2. 20-Point Smoke Test Matrix

| # | Test Name | Target Subsystem | Safety Guarantee |
| :--- | :--- | :--- | :--- |
| **1** | Frontend Availability Probe | Next.js Frontend | Read-only static probe |
| **2** | Backend Health (GET /health) | Liveness Probe | Read-only process metrics |
| **3** | Backend Readiness (GET /ready) | Dependency Probe | Read-only subsystem status |
| **4** | User Auth Flow Contract | JWT Authentication | Contract validation |
| **5** | Scoped API Key Verification | API Platform | SHA-256 validation |
| **6** | Tenant Boundary Isolation | RBAC & Workspaces | Read-only partition check |
| **7** | API Route Discovery | Scanner Engine | In-memory exploration |
| **8** | Repair Run Initializer | State Machine | State transition validation |
| **9** | Approval Policy Gate | Governance Policy | In-memory evaluation |
| **10** | Patch AST Quality Gate | Verification Engine | AST parser validation |
| **11** | Webhook HMAC Signatures | Inbound/Outbound | Timing-safe cryptographic check |
| **12** | FinOps Budget Safety | Cost Engine | Budget threshold check |
| **13** | Enterprise Policy Engine | Governance | Policy simulation |
| **14** | Production Readiness Auditor | Audit Subsystem | In-memory multi-check |
| **15** | Prometheus Metrics Exporter | Observability | Read-only metric scraping |
| **16** | Worker Fleet Availability | Job Queue | Queue depth inquiry |
| **17** | AI Provider Fallback | AI Client | Provider connectivity probe |
| **18** | Rate Limiter & Backpressure | Rate Limiting | Sliding-window check |
| **19** | Zero Stack Trace Disclosure | Error Handler | Response contract check |
| **20** | Graceful Shutdown Drain | Lifecycle Manager | Signal handling check |
