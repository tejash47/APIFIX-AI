# APIFIX AI — Troubleshooting & Incident Playbooks

Common operational issues and remediation procedures.

## 1. Port Collision During Verification
- **Symptom**: `EADDRINUSE` error in sandbox logs.
- **Remediation**: Ensure the project under test supports dynamic port binding via `process.env.PORT`.

## 2. AI Provider Rate Limits (429)
- **Symptom**: Primary provider rate limit reached during high-concurrency surge.
- **Remediation**: APIFIX automatically triggers fallback cascade to Secondary (Claude 3.5 Sonnet) or Tertiary (GPT-4o) providers.

## 3. Webhook Signature Mismatch
- **Symptom**: HTTP 401 Unauthorized when receiving webhook deliveries.
- **Remediation**: Verify the shared secret in Developer Portal -> Webhooks matches your server's HMAC secret.
