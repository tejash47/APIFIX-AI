# APIFIX AI — Enterprise Administrative Control Plane & UI Guide

## Executive Overview

The Enterprise Admin Control Plane provides a unified management cockpit for platform administrators, security engineers, and FinOps leaders to supervise autonomous operations across the entire organization hierarchy.

---

## 1. Executive Cockpit Layout & Views

The Administrative UI is accessible at `/admin` (or via the Global Command Palette `Cmd+K` -> `Enterprise Governance Cockpit`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🏢 Titan Aerospace Global  •  Scope: org_enterprise_primary  •  SHA-256 OK  │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Overview]  [Compliance]  [Cost Intelligence]  [AI Gov]  [Approvals]  ...   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Governance Score       Passing Controls       Active Spend      Approvals  │
│       100%                   11 / 11             $14.82           0 Pending │
│                                                                             │
│  ┌───────────────────────────────┐   ┌───────────────────────────────────┐  │
│  │ Compliance Controls Matrix    │   │ Spend by Operational Category     │  │
│  │ • CC-01 RBAC: PASS            │   │ • AI Tokens: 70.5%                │  │
│  │ • CC-02 Audit Ledger: PASS    │   │ • Sandbox Compute: 16.9%          │  │
│  │ • CC-03 Secret Mask: PASS     │   │ • Synthetic Probes: 8.4%          │  │
│  │ • CC-04 SSRF Defense: PASS    │   │ • Webhook Dispatches: 2.5%        │  │
│  └───────────────────────────────┘   └───────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dedicated Administrative Modules

### 1. Executive Overview
- Real-time Governance Score ($0-100\%$).
- Active Workspaces & Member counts.
- High-level compliance status cards and spending utilization indicators.

### 2. Compliance Control Center (`ComplianceCenterView.tsx`)
- Matrix of all 11 internal control frameworks.
- On-demand **Run Full Compliance Audit** button.
- Evidence drawer with SHA-256 cryptographic verification tools.

### 3. Cost Intelligence & Budgeting (`CostIntelligenceView.tsx`)
- Spend distribution by category (AI, Probes, Webhooks, Sandbox, Storage).
- Budget utilization progress bar with 80% (Warning), 90% (Critical), and 100% (Throttling) threshold markers.
- AI token consumption breakdown by model.

### 4. Governance Approval Queue (`ApprovalQueueView.tsx`)
- Real-time list of pending sign-off requests for production branch deployments and high-severity patches.
- Multi-approval sign-off progress bars ($1/2$ or $2/2$).
- One-click Approve / Reject with confirmation modal and anti-self-approval enforcement.

### 5. Cryptographic Audit Ledger
- Real-time block explorer displaying `sequence`, `action`, `actor`, and `hash`.
- One-click **Verify Ledger Integrity** button to validate all SHA-256 hash chains.

### 6. Data Retention & Sanitized Exports
- Retention tier configuration (30 / 90 / 180 / 365 days).
- Dry-run cleanup simulations with legal hold preservation.
- Full JSON/CSV data export downloads with SHA-256 integrity hash verification.
