# APIFIX AI — CI/CD Pipeline & Quality Gates Guide (Phase 23)

## 1. Continuous Integration Architecture

```
[ Git Push / PR ]
       │
       ▼
[ GitHub Actions CI Workflow (.github/workflows/ci.yml) ]
  ├── 1. Checkout & Setup Node.js v20
  ├── 2. Deterministic npm ci (Backend & Frontend)
  ├── 3. TypeScript Static Typecheck (tsc --noEmit)
  ├── 4. Automated High-Entropy Secret Scanner
  ├── 5. Database Migration Checksum Verification (SHA-256)
  ├── 6. Full Backend Test Regression (508 Tests)
  ├── 7. Frontend Component & Unit Tests (16 Tests)
  ├── 8. Next.js 14 Production Static Build (11 Routes)
  └── 9. Backup & Restore Simulation Drill
```

---

## 2. Continuous Delivery Pipeline

The `.github/workflows/deploy.yml` workflow orchestrates zero-downtime releases across three environments:
1. **Development**: Automatic deploy on push to `develop`.
2. **Staging**: Automatic deploy on merge to `main`. Executes full smoke tests against staging endpoints.
3. **Production**: Manual approval gate required by designated SRE / Tech Lead. Executes 6-stage canary rollout with automatic rollback triggers.

---

## 3. Mandatory Quality Gate Rules

| Quality Gate | Failure Condition | Action on Failure |
| :--- | :--- | :--- |
| **Secret Scan** | Any detected API key, JWT secret, private key | Immediate build failure; blocks merge |
| **TypeScript** | Any static type error in Next.js frontend | Build failure |
| **Backend Tests** | Any test failure across Phases 1–23 | Build failure |
| **Migrations** | Checksum mismatch or out-of-order sequence | Deployment blocked |
| **Smoke Tests** | Any failure in 20-point production smoke suite | Automatic deployment rollback |
