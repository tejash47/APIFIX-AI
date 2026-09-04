# APIFIX AI — Production Secret Management Strategy (Phase 23)

## 1. Zero-Secret Invariant

APIFIX AI strictly enforces a zero-plaintext-secret policy across all operational surfaces:
1. **Source Code**: No credentials, private keys, or API tokens committed to Git.
2. **Logs & Telemetry**: All structured JSON logs, error traces, and Prometheus metrics pass through `securitySanitizer.js` to redact keys (`[REDACTED]`).
3. **Frontend Bundles**: Client-side JavaScript bundles contain ONLY explicitly public `NEXT_PUBLIC_*` variables.
4. **API Responses**: Scoped API keys are stored exclusively as one-way SHA-256 hashes (`key_hash`) and never returned in API payloads.

---

## 2. Automated Secret Detection & CI Gate

The `secretScanner.js` engine executes in CI/CD pipelines to scan source files, templates, Docker layers, and frontend build outputs against high-entropy patterns:
- Stripe Secret Keys (`sk_live_*`, `sk_test_*`)
- Stripe Webhook Secrets (`whsec_*`)
- GitHub Personal Access Tokens (`ghp_*`, `github_pat_*`)
- AI Provider Tokens (`sk-ant-*`, `gsk_*`, `sk-*`)
- RSA/EC Private Key blocks
- Supabase Service Role JWTs

---

## 3. Secret Rotation Procedure

1. **Stripe & AI Keys**: Update secret in cloud environment variables / secret manager, then execute graceful container restart.
2. **JWT Secret**:
   - Issue new JWT token with updated secret.
   - Active tokens expire deterministically; users refresh sessions seamlessly.
3. **Inbound Webhook Secret**:
   - Update `INBOUND_WEBHOOK_SIGNING_SECRET` in `.env`.
   - The webhook signature verifier immediately enforces the new secret with timing-safe comparison.
