# Security Architecture Specification — APIFIX AI

This document provides a technical specification of the security architecture, threat model, isolation boundaries, cryptographic implementations, and data governance models in APIFIX AI.

---

## 1. Identity, Authentication & Session Security

### 1.1 JWT Token Lifecycle & Cryptographic Constraints
- **Signing Algorithm**: Exclusively HMAC SHA-256 (`HS256`).
- **Algorithm Confusion Defense**: All `jwt.verify` invocation points in middleware and route controllers enforce `{ algorithms: ['HS256'] }`. Any token claiming `alg: "none"`, `RS256`, or alternative algorithms is rejected immediately.
- **Expiration & Replay**: Tokens carry standard `exp` claims (default 1 hour for interactive sessions, 24 hours for agent automation). Expired tokens trigger HTTP 401 with standard code `TOKEN_EXPIRED`.
- **Secret Management**: Signing key loaded from `JWT_SECRET` environment variable with production startup checks.

### 1.2 Authentication Middleware Architecture
```
Request Ingress
      │
      ▼
[Security Headers Middleware] ────► Injects CSP, HSTS, X-Frame-Options, nosniff
      │
      ▼
[Rate Limiter Middleware] ────────► Enforces IP / Token bucket quotas
      │
      ▼
[Auth Middleware]
      ├─► Bearer Token present? ──No──► 401 UNAUTHORIZED
      ├─► jwt.verify(token, secret, { algorithms: ['HS256'] })
      │         ├─► Valid ───────────► req.user = decoded
      │         └─► Invalid/Expired ──► 401 INVALID_TOKEN / TOKEN_EXPIRED
      ▼
[RBAC Middleware: requireWorkspaceAccess(minRole)]
      ├─► Resolves workspaceId from Params / Headers / Body
      ├─► Verifies membership in workspace
      ├─► Evaluates Role Hierarchy (OWNER > ADMIN > MEMBER > VIEWER)
      │         ├─► Authorized ──────► Next Route Handler
      │         └─► Forbidden ───────► 403 FORBIDDEN / INSUFFICIENT_PERMISSIONS
```

---

## 2. Multi-Tenant Isolation & Authorization

### 2.1 Role-Based Access Control (RBAC) Matrix

| Capability | OWNER | ADMIN | MEMBER | VIEWER |
| :--- | :---: | :---: | :---: | :---: |
| **Workspace Management (Rename, Settings)** | Yes | Yes | No | No |
| **Workspace Deletion** | Yes | No | No | No |
| **Member Invitation / Removal** | Yes | Yes | No | No |
| **Role Elevation / Modification** | Yes | Yes (cannot elevate to OWNER) | No | No |
| **Billing & Stripe Subscriptions** | Yes | Yes | No | No |
| **Autonomous Repair Ingestion & Execution** | Yes | Yes | Yes | No |
| **GitHub PR Creation** | Yes | Yes | Yes | No |
| **Incident Inspection & Evidence Viewing** | Yes | Yes | Yes | Yes |
| **Audit Log Viewing** | Yes | Yes | Yes | Yes |
| **Artifact Codebase Download** | Yes | Yes | Yes | Yes |

### 2.2 Insecure Direct Object Reference (IDOR) Protection
- All resource queries (Projects, Incidents, Runs, Artifacts, Webhooks, Channels) require double-scoping:
  1. Authenticated user ID & active workspace ID.
  2. Database query matches `workspace_id = :workspaceId`.
- Accessing foreign workspace IDs returns clean 403 Forbidden without leaking resource existence or metadata.

---

## 3. Server-Side Request Forgery (SSRF) Defense Engine

### 3.1 Network Boundary & CIDR Blocklist
Outbound requests initiated by APIFIX AI (Alert Webhooks, Synthetic Probers, GitHub integrations) are processed through `ssrfProtection.js` before network dispatch:

1. **Protocol Validation**: Strictly `http:` or `https:`.
2. **Hostname & Suffix Blocklist**:
   - `localhost`, `metadata.google.internal`, `instance-data`, `host.docker.internal`
   - `.local`, `.localhost`, `.internal`, `.lan`, `.home`, `.corp`
3. **IPv4 Prohibited CIDR Ranges**:
   - `0.0.0.0/8` (Current network)
   - `127.0.0.0/8` (Loopback)
   - `10.0.0.0/8` (RFC 1918 Private)
   - `172.16.0.0/12` (RFC 1918 Private)
   - `192.168.0.0/16` (RFC 1918 Private)
   - `169.254.0.0/16` (Link-local / AWS & GCP Instance Metadata)
   - `100.64.0.0/10` (Carrier-grade NAT)
   - `224.0.0.0/4` (Multicast)
   - `240.0.0.0/4` (Reserved)
4. **IPv6 Prohibited Address Space**:
   - `::1` / `::` (Loopback)
   - `fc00::/7` (Unique Local Address)
   - `fe80::/10` (Link-local)
   - `::ffff:0:0/96` (IPv4-mapped IPv6 checked against IPv4 CIDRs)
5. **Alternative Representations**: Decimal and hexadecimal IP encodings (e.g., `2130706433` or `0x7F000001`) are decoded and verified against the blocklist.

---

## 4. File I/O, Safe Paths & Archive Security

### 4.1 Path Traversal Defense (`validateSafePath`)
- Resolves target path against root boundary (`path.resolve`).
- Rejects:
  - Relative climb sequences (`..`, `../`, `..\`)
  - URL-encoded climb sequences (`%2e%2e%2f`, `%2e%2e%5c`)
  - Null-byte terminators (`\0`, `%00`)
  - Windows absolute drive letters (`C:\`, `D:\`)
  - Universal Naming Convention (UNC) paths (`\\server\share`)
- Throws security violation if resolved path escapes the base directory.

### 4.2 ZIP Archive Security (`zipSecurity.js`)
- **Zip Slip Defense**: Checks every entry header before extraction. Rejects archives with entries containing `..` or absolute paths.
- **Zip Bomb Defense**:
  - Maximum uncompressed size: 500MB
  - Maximum compression ratio: 100:1
  - Maximum total files: 10,000
- **Symlink Defense**: Ignores or validates symbolic links to prevent pointing outside target extraction directory.

---

## 5. Child Process Sandbox & Autonomous Execution Security

### 5.1 Sandbox Environment Secret Stripping
When the autonomous verification runner boots child application processes to test patches, `createSanitizedEnv(port)` generates a sterile environment:

- **Whitelisted Keys Only**: `PATH`, `SYSTEMROOT`, `TEMP`, `NODE_PATH`, `NODE_ENV`, `PORT`, `CI`.
- **Blocklist Substrings**: Any key containing `SECRET`, `KEY`, `TOKEN`, `PASSWORD`, `SUPABASE`, `OPENAI`, `ANTHROPIC`, `GEMINI`, `AUTH`, `STRIPE`, `GITHUB` is deleted before spawn.
- **Network Isolation**: Spawned child processes run on ephemeral localhost ports strictly bound to local probers.

### 5.2 Secret Sanitization Pipeline (`securitySanitizer.js`)
Autonomous repair logs, diffs, AI prompt payloads, and audit records pass through regex redaction matching:
- Stripe Live & Test Keys (`sk_live_`, `sk_test_`, `rk_live_`, `whsec_`)
- GitHub Personal Access Tokens (`ghp_`, `github_pat_`)
- Supabase API Keys (`sbp_`, JWT service tokens)
- AI Model API Keys (OpenAI `sk-proj-`, Anthropic `sk-ant-`, Groq `gsk_`)
- Database Connection Strings (`postgres://user:pass@host/db`)
- Bearer Tokens & Generic Passwords

---

## 6. Webhook Cryptographic Security

### 6.1 Constant-Time HMAC Signature Verification
Inbound webhooks (PagerDuty, Datadog, Custom Alert Webhooks) require HMAC SHA-256 signatures:
- Computed signature: `HMAC-SHA256(payload, webhookSecret)`
- Comparison: `crypto.timingSafeEqual` prevents timing-based side-channel attacks.
- Header support: `X-Signature`, `X-Hub-Signature-256`, `X-Webhook-Signature`.
- Secret Rotation: Instant revocation of stale secrets upon rotation.

---

## 7. Audit Logging & Compliance Controls

### 7.1 Immutable Audit Trail
- All security-relevant actions (Logins, Workspace Mutations, Member Role Changes, Secret Rotations, Ingestion, Artifact Downloads, Billing Operations) produce structured audit records.
- **Audit Record Schema**: `id`, `workspace_id`, `actor_id`, `actor_email`, `action`, `resource_type`, `resource_id`, `timestamp`, `request_id`, `metadata`.
- **Sanitization**: Audit metadata is scrubbed by `sanitizeAuditPayload` before writing to storage.
- **Immutability**: No public or authenticated API allows modifying or deleting audit log history.
