# APIFIX AI — Enterprise Compliance Controls Framework

## Overview

APIFIX AI Phase 20 implements an automated, real-time Compliance Control Center covering **11 internal control categories**.

> [!NOTE]
> **Truthful Internal Labeling Standard**: APIFIX AI labels all controls explicitly as *"Control verified internally"* based on deterministic subsystem automated audits, rather than falsely claiming 3rd-party SOC 2 Type II or ISO/IEC 27001 certifications.

---

## The 11 Internal Compliance Control Categories

| Category ID | Control Title | Primary Domain | Subsystem Verification Routine |
| :--- | :--- | :--- | :--- |
| `CC-01` | **Role-Based Access Control (RBAC)** | Access Control & Auth | Tests role ranking, capability checks, and anti-elevation invariants |
| `CC-02` | **Immutable Audit Trail** | Accountability | Verifies SHA-256 block hash chain integrity and tamper detection |
| `CC-03` | **Secret Sanitization & Masking** | Data Protection | Scans nested data for leaked Stripe keys, AI keys, tokens, & passwords |
| `CC-04` | **SSRF & Network Boundary Defense** | Perimeter Defense | Validates blocking of RFC 1918, IPv6, loopback, and Cloud Metadata IPs |
| `CC-05` | **Isolated Execution Sandbox** | Compute Security | Enforces container isolation, unprivileged user, and restricted syscalls |
| `CC-06` | **Pre-Execution Governance Policies** | Operations Control | Ensures policy rules intercept unauthorized protected-branch actions |
| `CC-07` | **AI Model Governance & Token Caps** | AI Safety | Verifies approved model allowlisting and daily token spend enforcement |
| `CC-08` | **Cost Intelligence & Throttling** | FinOps & Reliability | Validates 80%/90% warnings and 100% throttling (with security bypass) |
| `CC-09` | **Dual-Review Signoff Workflows** | Separation of Duties | Tests strict anti-self-approval and multi-reviewer gate transitions |
| `CC-10` | **Configurable Data Retention & Legal Hold**| Data Lifecycle | Verifies automated purge respecting active incident legal holds |
| `CC-11` | **Tamper-Evident Export Engine** | Compliance Integrity | Verifies SHA-256 integrity digest and sanitization on JSON/CSV exports |

---

## 1. Automated Audit Verification Engine

The compliance engine executes live diagnostic assertions against each subsystem:

```
[On-Demand Audit Trigger (POST /api/compliance/audit)]
       │
       ├── CC-01: Run RBAC isolation & anti-elevation check
       ├── CC-02: Validate SHA-256 block hash chain of audit ledger
       ├── CC-03: Run sanitizeSecrets against mock nested payload
       ├── CC-04: Test SSRF protection with 127.0.0.1 & 169.254.169.254
       ├── CC-05: Check Docker sandbox isolation configuration
       ├── CC-06: Evaluate pre-execution governance policy engine
       ├── CC-07: Verify AI model allowlist & budget tracker
       ├── CC-08: Test cost intelligence budget threshold transitions
       ├── CC-09: Assert anti-self-approval rejection on approval engine
       ├── CC-10: Verify legal hold protection on retention purge
       └── CC-11: Validate SHA-256 integrity checksum on exported data
       │
       ▼
[Score Calculation (0–100%) & Evidence Manifest Sealed with SHA-256]
```

---

## 2. Cryptographic Compliance Evidence Engine

Every automated compliance audit produces a sealed evidence record:
- **`evidenceId`**: Cryptographically unique identifier (`evi_<uuid>`).
- **`controlId`**: Reference to the control category (`CC-01` through `CC-11`).
- **`evidenceHash`**: SHA-256 digest computed as:
  $$\text{Hash} = \text{SHA256}(\text{evidenceId} \mathbin{\Vert} \text{controlId} \mathbin{\Vert} \text{scope} \mathbin{\Vert} \text{status} \mathbin{\Vert} \text{timestamp} \mathbin{\Vert} \text{sanitizedPayload})$$
- **`verifiedInternally`**: `true` — declares that verification was conducted by local subsystem telemetry.

### Evidence Integrity Verification
Auditors and security teams can verify any evidence bundle using `POST /api/compliance/evidence/:id/verify`:
```bash
curl -X POST https://apifix.ai/api/compliance/evidence/evi_88192a/verify \
  -H "Authorization: Bearer <TOKEN>"
```
Response:
```json
{
  "evidenceId": "evi_88192a",
  "controlId": "CC-04",
  "calculatedHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "storedHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "tamperDetected": false,
  "verificationStatus": "VERIFIED_VALID"
}
```

---

## 3. Governance Score Computation

The platform continuously maintains a **Governance Score** ($0 - 100\%$):
$$\text{Score} = \left(\frac{\text{Passing Controls}}{\text{Total Controls}}\right) \times 100$$
- **$100\%$ — Enterprise Certified**: All 11 controls passed without deviation.
- **$80 - 99\%$ — Minor Warning**: Non-critical policy alert (e.g. approaching token threshold).
- **$< 80\%$ — Action Required**: One or more critical security controls failing.
