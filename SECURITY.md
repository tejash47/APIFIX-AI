# Security Policy — APIFIX AI

APIFIX AI is built with an enterprise-first security model designed for autonomous repair operations on mission-critical APIs and services. This document describes our security guarantees, vulnerability reporting process, and operational security posture.

---

## 1. Vulnerability Reporting & Disclosure

We take the security of APIFIX AI seriously. If you believe you have discovered a vulnerability, security flaw, or privacy issue, please disclose it responsibly:

- **Security Contact**: `security@apifix.ai`
- **PGP Key ID**: `4A9F 88B1 2C44 D8E9`
- **Initial Response Time**: Within 24 hours
- **Triage & Remediation Timeline**: Critical issues patched within 48–72 hours

Please include:
1. Clear description of the vulnerability and attack vector.
2. Step-by-step reproduction instructions or proof-of-concept.
3. Affected components (e.g. backend routes, sandbox runner, agent pipeline).
4. Impact assessment.

*We request that you do not publicly disclose vulnerabilities until our team has verified, remediated, and released a security advisory.*

---

## 2. Core Security Architecture & Verified Guarantees

APIFIX AI enforces multi-layered defense-in-depth across the entire autonomous repair lifecycle:

```
+-------------------------------------------------------------------------+
|                              EDGE / INGRESS                             |
|  - Rate Limiting (Token Bucket)  - Production CORS                     |
|  - Security Headers (CSP, HSTS, X-Frame-Options: DENY, nosniff, COOP)  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                         AUTHENTICATION & IDENTITY                       |
|  - JWT HS256 algorithm enforcement (blocks alg: none & RS256 confusion) |
|  - Token expiration & revocation validation                            |
|  - Inbound Webhook constant-time HMAC SHA-256 verification              |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                      MULTI-TENANT RBAC & AUTHORIZATION                  |
|  - Workspace Scoping (OWNER > ADMIN > MEMBER > VIEWER)                  |
|  - Strict Cross-Tenant Isolation on all GET, POST, PATCH, DELETE       |
|  - Defense against Insecure Direct Object References (IDOR)             |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                       INPUT SANITIZATION & SAFE I/O                     |
|  - Path Traversal Block (POSIX ../, Windows C:\, UNC \\, Encoded %2e)   |
|  - Archive Protection (Zip Slip validation, Zip Bomb limit checks)      |
|  - SSRF Protection (Loopback, RFC 1918, Cloud Metadata 169.254.169.254)|
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                     AUTONOMOUS SANDBOX EXECUTION                        |
|  - Ephemeral child processes with stripped environment secrets          |
|  - Whitelisted system environment variables only                        |
|  - Automated secret redaction across all logs, diffs & AI prompts       |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                      AUDITABILITY & COMPLIANCE                          |
|  - Immutable audit logs capturing actor, action, timestamp, & metadata  |
|  - Zero plain-text secrets in persistent storage                        |
+-------------------------------------------------------------------------+
```

---

## 3. Verified Security Matrix (Phase 19 Hardening)

| Threat Vector | Defense Mechanism | Verified Status |
| :--- | :--- | :--- |
| **Authentication Bypass** | Mandatory JWT extraction, rejection of forged signatures | **VERIFIED** |
| **Algorithm Confusion** | Explicit `algorithms: ['HS256']` enforcement | **VERIFIED** |
| **Cross-Tenant Access** | Multi-tenant RBAC middleware with workspace boundary checks | **VERIFIED** |
| **IDOR** | Scoped queries against authenticated workspace membership | **VERIFIED** |
| **Path Traversal** | `validateSafePath` with null byte, encoded traversal, UNC checks | **VERIFIED** |
| **Zip Slip / Bomb** | `safeExtractZip` checking normalized paths & file size limits | **VERIFIED** |
| **SSRF (Loopback & Cloud)** | `ssrfProtection.js` blocking RFC1918, 127.0.0.0/8, 169.254.169.254 | **VERIFIED** |
| **Secret Leakage** | `sanitizeSecrets` stripping Stripe, Supabase, JWT, AI, PAT keys | **VERIFIED** |
| **Sandbox Secret Isolation** | `createSanitizedEnv` stripping all control plane secrets | **VERIFIED** |
| **Webhook Forgery** | Constant-time `crypto.timingSafeEqual` HMAC SHA-256 validation | **VERIFIED** |
| **Stack Trace Disclosure** | Standardized error contracts suppressing internal trace frames | **VERIFIED** |
| **Clickjacking** | `X-Frame-Options: DENY` + `frame-ancestors 'none'` CSP | **VERIFIED** |
| **MIME Sniffing** | `X-Content-Type-Options: nosniff` | **VERIFIED** |

---

## 4. Operational Best Practices

1. **Environment Variables**: Never commit `.env` or production secrets to source control.
2. **Key Rotation**: Rotate `JWT_SECRET`, Stripe webhook secrets (`whsec_`), and GitHub PATs periodically.
3. **Least Privilege**: Grant GitHub Personal Access Tokens strictly with minimal required repository scope (`repo` or `contents:write`).
4. **Audit Reviews**: Monitor `/api/workspaces/:id/audit-logs` for anomalies.
