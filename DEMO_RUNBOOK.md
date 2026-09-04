# APIFIX AI — Official 5-Minute Product Demo Runbook
**Version:** 1.0 (Phase 25 Enterprise Release)  
**Target Audience:** Enterprise Engineering Leaders, SRE Directors & Investors  
**Environment:** Local Demo Environment or Staging Cloud Cluster

---

## Demo Script & Walkthrough Steps

### Step 1: Login & Workspace Navigation (0:00 - 0:30)
- **Action:** Open `http://localhost:3000/login` (or `/dashboard?demo=true`).
- **Talking Point:** "Welcome to APIFIX AI. We are logged into the Enterprise Demo workspace with isolated row-level security and active credit tracking."

### Step 2: Open Dashboard & Review Navigation (0:30 - 1:00)
- **Action:** Point out the Command Center Header, active credits pill (10 CR), and System Notifications.
- **Talking Point:** "APIFIX provides unified control across SRE metrics, API registries, incident response, and governance."

### Step 3: Inspect Connected Demo API & Route Discovery (1:00 - 1:30)
- **Action:** Open **APIs Registry** tab. Show discovered endpoints: `POST /api/auth/login`, `GET /api/users`, `GET /health`.
- **Talking Point:** "APIFIX uses static Babel AST parsing combined with dynamic TCP probing to index public and authenticated routes."

### Step 4: Detect & Ingest Runtime Crash Incident (1:30 - 2:00)
- **Action:** Trigger the demo failure. Show incident card appearing with HTTP 500 error: `TypeError: Cannot read properties of undefined (reading 'password')`.
- **Talking Point:** "When a customer hits an unexpected edge case, APIFIX captures the exact stack trace and HTTP envelope without storing plaintext credentials."

### Step 5: Autonomous AI Root-Cause Investigation (2:00 - 2:30)
- **Action:** Open **Investigation Report Card**. Show Causal Chain Graph and multi-provider AI reasoning.
- **Talking Point:** "Our AI fallback cascade analyzes the failure line and identifies the missing object guard."

### Step 6 & 7: AST Syntax Patch Generation & Diff Inspection (2:30 - 3:00)
- **Action:** Open **Monaco Diff Viewer**. Inspect the proposed patch adding null-safety checks before property access.
- **Talking Point:** "Every patch is validated against AST JavaScript grammar rules before presentation to ensure zero syntax errors."

### Step 8 & 9: Enterprise Governance & Human Approval (3:00 - 3:30)
- **Action:** Show policy status: `REQUIRE_APPROVAL` (Security-sensitive controller). Click **Approve Patch**.
- **Talking Point:** "Governance policies allow teams to require developer or admin sign-off for critical routes."

### Step 10 & 11: Ephemeral Sandbox Verification (3:30 - 4:15)
- **Action:** Click **Verify in Sandbox**. Watch live terminal output on dynamic port. Show result transitioning to **VERIFIED** with HTTP 401 Controlled Response.
- **Talking Point:** "APIFIX tests the patch in an isolated ephemeral sandbox. The original runtime crash is eliminated, and regression tests pass 100%."

### Step 12: Real-Time SRE & Observability Dashboard (4:15 - 4:35)
- **Action:** Click **SRE & Observability** tab. Show MTTR graph, request rate, and Prometheus `/metrics` data.
- **Talking Point:** "The incident is marked RESOLVED, with MTTR dropping from hours to under 60 seconds."

### Step 13: Cryptographic Merkle Audit Ledger (4:35 - 4:50)
- **Action:** Navigate to **Compliance Center**. Show the new sequential SHA-256 hash block.
- **Talking Point:** "Every action—from AI prompt to human approval—is immutably sealed for SOC2 and ISO27001 compliance."

### Step 14 & 15: FinOps Usage Metering & Operations Control (4:50 - 5:15)
- **Action:** Show Cost Intelligence view displaying $0.00350 token spend and open the **Operations Center** (`/operations`) displaying latency percentiles and launch certification.
- **Talking Point:** "APIFIX delivers fully autonomous, secure, auditable, and cost-controlled API self-repair."
