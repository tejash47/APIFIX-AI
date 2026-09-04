# Incident Response Plan — APIFIX AI

This document establishes the official security incident management and response protocol for APIFIX AI, outlining roles, severity classifications, escalation paths, containment measures, and post-mortem requirements.

---

## 1. Incident Severity Classification

| Severity Level | Definition | Response SLA | Escalation Target |
| :--- | :--- | :--- | :--- |
| **SEV-1 (CRITICAL)** | Active remote code execution, unauthorized cross-tenant data access, leaked primary production master keys (JWT Secret, Database Credentials, Stripe Master Key). | **< 15 minutes** | CISO, Lead Security Engineer, CTO |
| **SEV-2 (HIGH)** | SSRF bypass, sandbox process breakout attempt, privilege escalation within a single tenant, API rate limiter failure under attack. | **< 1 hour** | Lead Security Engineer, SRE On-Call |
| **SEV-3 (MEDIUM)** | Path traversal or Zip Slip attempt blocked with unusual patterns, repeated failed HMAC webhook bursts, unexpected error disclosure in API response. | **< 4 hours** | Security Engineer, Platform Team |
| **SEV-4 (LOW)** | Security documentation typo, informational vulnerability report with no active exploit path, minor dependency audit advisory. | **< 24 hours** | Development Team |

---

## 2. Five-Stage Incident Response Lifecycle

```
+---------------+     +---------------+     +---------------+     +---------------+     +---------------+
| 1. DETECTION  | ──► | 2. TRIAGE &   | ──► | 3. CONTAINMENT| ──► | 4. REMEDIATION| ──► | 5. POST-MORTEM|
| & ALERTING    |     | CLASSIFICATION|     | & ERADICATION |     | & RECOVERY    |     | & LESSONS     |
+---------------+     +---------------+     +---------------+     +---------------+     +---------------+
```

### Stage 1: Detection & Alerting
- Automated alerting from SRE metrics (`/metrics`, circuit breaker trip counters, 5xx spike alarms).
- Sentry / Datadog alert notifications for unexpected exceptions or unhandled rejections.
- External vulnerability disclosure received via `security@apifix.ai`.

### Stage 2: Triage & Classification
- On-call security engineer assesses exploitability, scope of impact, and affected tenants.
- Assigns severity level (SEV-1 to SEV-4).
- Creates a dedicated incident command channel `#incident-YYYYMMDD-[name]` and appoints Incident Commander (IC).

### Stage 3: Containment & Eradication
Depending on the incident type:
- **Compromised Secret / Key**:
  - Immediately rotate `JWT_SECRET`, Stripe webhook secrets, or database passwords in environment variables.
  - Invalidate all active user sessions by bumping token version / key epoch.
- **SSRF / Malicious Ingress**:
  - Add malicious IP / CIDR to ingress firewall / edge blocklist.
  - Update `BLOCKED_HOSTNAMES` or CIDR ranges in `ssrfProtection.js`.
- **Sandbox Threat**:
  - Terminate affected child worker processes via process kill signal.
  - Purge temporary sandbox directories in `storage/temp/`.

### Stage 4: Remediation & Recovery
- Develop, review, and test security patch against `backend/tests/phase19_security.test.js` and `phase19_security_acceptance_e2e.js`.
- Verify zero regression across Phase 1–18 test suites.
- Deploy hotfix through CI/CD pipeline.
- Verify system health and baseline traffic patterns via SRE probers.

### Stage 5: Post-Mortem & Corrective Action
- Incident Commander coordinates post-incident review within 48 hours of resolution.
- Deliverables:
  1. Timeline of events from detection to full recovery.
  2. Root cause analysis (5 Whys).
  3. Action items (new automated test cases, code hardening, config updates).
  4. Customer notification report if customer data was impacted.

---

## 3. Communication Matrix & Emergency Contacts

- **Security Incident Hotline**: `+1 (800) APIFIX-SEC`
- **Security Operations Email**: `security-ops@apifix.ai`
- **Emergency Secret Revocation Portal**: `https://admin.apifix.ai/security/revocation`
