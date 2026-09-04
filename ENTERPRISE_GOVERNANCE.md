# APIFIX AI — Enterprise Governance Architecture & Control Plane

## Executive Overview

APIFIX AI Phase 20 introduces an enterprise-grade Governance Control Plane designed to give CISOs, SRE directors, and engineering leadership absolute administrative control, cryptographic transparency, and multi-tenant scoping across all autonomous self-healing operations.

The governance framework enforces strict hierarchical containment, an 8-tier role hierarchy, pre-execution automated policy enforcement, approval sign-off gates for production actions, and immutable cryptographic audit ledgers.

---

## 1. Multi-Tenant Enterprise Hierarchy

APIFIX AI organizes all enterprise entities into a strict 7-level containment tree:

```
Organization (Enterprise Tenant: e.g., Titan Aerospace Global)
  └── Workspace (Team / Department: e.g., Payments SRE)
        └── Project (Codebase / Application: e.g., Core Gateway)
              └── Repository (Git Source: e.g., github.com/titan/gateway)
                    └── API Endpoint (e.g., POST /api/v1/checkout)
                          └── Incident (e.g., INC-2026-08 Fault)
                                └── Repair Run (Autonomous Investigation & Patch Verification)
```

### Hierarchy Rules & Scoping
- **Organization**: Top-level tenant boundary. Enforces organization-wide AI model allowlists, compliance profiles, retention tiers, and cost budgets.
- **Workspace**: Department or team enclave. Inherits organization policies while supporting granular policy overrides.
- **Project**: Code repository target analyzed by the AST engine and sandbox runner.
- **Strict Isolation**: No user or token can query, inspect, or mutate resources outside their assigned organization and workspace scope. Cross-tenant access is immediately blocked with HTTP 403 `FORBIDDEN_ORGANIZATION_ACCESS`.

---

## 2. Enterprise Role Hierarchy & Permission Matrix

APIFIX AI implements an 8-tier role hierarchy with discrete capability permissions:

| Role Rank | Role Name | Primary Responsibilities | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **8** | `OWNER` | Executive & Root Administrator | Full tenant management, delete org, transfer ownership, manage all policies |
| **7** | `ADMIN` | General Administrator | Manage workspaces, assign roles (up to ADMIN), update policies & budgets |
| **6** | `SECURITY_ADMIN` | CISO / SecOps Officer | Compliance audits, cryptographic evidence verification, policy security enforcement |
| **5** | `BILLING_ADMIN` | Finance / FinOps Officer | Manage credit allocations, cost budgets, spend thresholds, Stripe integration |
| **4** | `SRE_ADMIN` | SRE Team Lead | Approve production patches, emergency bypass, configure probes & alerts |
| **3** | `DEVELOPER` | Software Engineer | Trigger scans, initiate repair runs, view repository AST, draft fixes |
| **2** | `MEMBER` | Team Contributor | View runs, inspect non-sensitive incident telemetry, test endpoints |
| **1** | `VIEWER` | Read-Only Stakeholder | Read-only access to dashboards and status metrics |

### Granular Capability Permissions
- `org:read`, `org:write`, `org:delete`, `org:members:manage`
- `workspace:create`, `workspace:read`, `workspace:write`, `workspace:delete`
- `governance:policy:read`, `governance:policy:write`
- `compliance:read`, `compliance:audit`, `compliance:evidence:export`
- `audit:read`, `audit:export`, `audit:verify`
- `costs:read`, `costs:budgets:manage`
- `approvals:read`, `approvals:create`, `approvals:review`
- `retention:manage`, `retention:execute`
- `runs:trigger`, `runs:view`, `runs:delete`
- `patches:generate`, `patches:apply`, `patches:reject`

---

## 3. Pre-Execution Governance Policy Engine

Before any AI agent, probe, sandbox execution, or Git PR automation is triggered, the **Governance Policy Engine** evaluates the action against the active policy rules:

```
[Agent Action Request] 
       │
       ▼
[Pre-Execution Policy Engine]
  ├── Is branch protected (e.g. main/master)? ──► Require SRE_ADMIN Approval
  ├── Is target production environment? ────────► Require Multi-Signoff Gate
  ├── Is severity CRITICAL / HIGH? ────────────► Require Security Review
  ├── Is AI Model Whitelisted? ────────────────► Block unapproved LLM providers
  └── Is Cost Budget Exceeded (100%)? ──────────► Throttle (unless Security-Critical)
       │
       ├── PASS (Autonomous Execution Allowed)
       └── BLOCKED / PENDING_APPROVAL (Queued into Approval Workflow)
```

### Policy Evaluation Decision Records
Every evaluation generates an immutable decision record stored in the governance ledger containing:
- `decisionId`: Unique UUID.
- `policyId`: Evaluated policy version.
- `verdict`: `ALLOWED`, `BLOCKED`, or `REQUIRES_APPROVAL`.
- `reason`: Rule triggering the verdict.
- `evaluator`: `GovernancePolicyEngine:v1.0`.
- `evaluatedAt`: ISO-8601 UTC timestamp.

---

## 4. Approval Workflow Engine & Anti-Self-Approval

High-risk actions (such as deploying patches to protected branches or modifying security-sensitive controllers) are intercepted and held in the **Approval Queue**:

### Anti-Self-Approval Security Rule
> **Strict Enforcement**: The developer who initiated the repair run or created the approval request is cryptographically and logically prohibited from approving their own request (`FORBIDDEN_SELF_APPROVAL`). All sign-offs require an independent reviewer with `SRE_ADMIN`, `SECURITY_ADMIN`, `ADMIN`, or `OWNER` privileges.

### Approval Lifecycle
1. `PENDING`: Request created, notifications dispatched to designated reviewers.
2. `APPROVED`: Sufficient authorized sign-offs obtained; execution unblocked.
3. `REJECTED`: Reviewer denied the request with documented justification.
4. `EXPIRED`: Request exceeded SLA timeout (default: 48 hours) and was auto-canceled.

---

## 5. Security & Isolation Assurances

1. **Deterministic Tenant Scoping**: All service calls validate `organizationId` and `workspaceId` before any database or filesystem operation.
2. **Zero Sensitive Data in Decisions**: Policy logs redact API keys, JWTs, and private tokens.
3. **Fail-Closed Default**: If policy evaluation fails or encounters an unhandled exception, execution is automatically blocked rather than permitted.
