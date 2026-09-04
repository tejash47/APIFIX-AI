# APIFIX AI — Enterprise API Security & Cryptographic Key Architecture

## 1. Security Invariant: Zero Plaintext Secret Storage

APIFIX AI enforces a strict zero-plaintext storage invariant across all API keys, personal access tokens, webhook signing secrets, and SSO client credentials.

```
+───────────────────────────+
|      API KEY CREATION     |
| Raw Key: apifix_live_...  | (Displayed exactly ONCE to creating client)
+───────────────────────────+
              │
              ▼
   SHA-256 Cryptographic Hash
              │
              ▼
+───────────────────────────+
|     PERSISTENT STORAGE    |
| - Key ID: key_123...      |
| - SHA-256 Hash: 64 hex    |
| - Prefix: apifix_live_a1b2|
| - Scopes: [read:projects] |
| (NO PLAINTEXT SECRETS)    |
+───────────────────────────+
```

When an inbound request arrives with `Authorization: Bearer <key>` or `X-API-Key: <key>`, the runtime:
1. Computes `crypto.createHash('sha256').update(rawKey).digest('hex')`.
2. Matches the hash against stored key records using constant-time comparison.
3. Attaches authorized tenant context (`organizationId`, `workspaceId`, `scopes`, `role`).

---

## 2. Fine-Grained API Scopes

APIFIX API keys support least-privilege scoping:

| Scope | Description |
| :--- | :--- |
| `read:projects` / `projects:read` | Inspect project inventory, health scores, and route maps. |
| `write:projects` / `projects:write`| Create or sync project definitions. |
| `read:incidents` / `incidents:read`| Query API failure incidents and root-cause evidence. |
| `write:runs` / `runs:create` | Trigger autonomous self-healing and investigation runs. |
| `repairs:execute` | Execute AI repair analysis and apply code patches. |
| `verify:all` | Execute continuous verification sandbox gates. |
| `webhooks:manage` | Register, update, and replay outbound webhook endpoints. |
| `admin:all` | Full workspace administration (API key lifecycle, settings, audit). |

---

## 3. Webhook Cryptographic Signing & SSRF Defense

### HMAC-SHA256 Signatures

All outbound webhook deliveries include an `X-APIFIX-Signature` header:
```
X-APIFIX-Signature: t=1725432000,v1=9b1d8e33a2c5f6...
```

The signature is computed over `${timestamp}.${payload}` using the webhook's assigned shared secret (`whsec_...`):
```js
const signedPayload = `${timestamp}.${payloadString}`;
const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
```

### SSRF (Server-Side Request Forgery) Prevention

All webhook destination URLs are pre-validated before registration and upon dispatch. Destination URLs are rejected if they resolve to:
- AWS Cloud Metadata (`169.254.169.254`, `fd00:ec2::254`)
- Loopback / Localhost (`127.0.0.0/8`, `::1`, `localhost`)
- RFC 1918 Private Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Link-Local and Carrier-Grade NAT (`100.64.0.0/10`, `169.254.0.0/16`)

---

## 4. Response Envelope Secret Sanitization

All API responses and error traces pass through the automated `securitySanitizer` before serialization. Patterns such as API tokens, provider API keys, webhook signing secrets, JWTs, and database URLs containing passwords (`postgres://user:pass@host`) are automatically redacted to `[REDACTED_CREDENTIAL]` or `[REDACTED]`.
