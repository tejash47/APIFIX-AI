# APIFIX AI — Enterprise Cost Intelligence & Budgeting

## Executive Overview

APIFIX AI Phase 20 introduces a multi-dimensional **Cost Intelligence Engine** that provides real-time visibility into the operational costs of autonomous self-healing engineering.

Costs are tracked across five distinct operational categories:
1. **AI Inference**: Input & output token spend across all LLM providers.
2. **Synthetic Probes**: Automated health checks, latency probes, and canary executions.
3. **Webhook Dispatches**: Real-time event deliveries to Slack, PagerDuty, and custom endpoints.
4. **Isolated Sandboxes**: CPU/RAM runtime for containerized reproduction and verification.
5. **Telemetry & Storage**: Storage of raw ASTs, evidence bundles, logs, and artifacts.

---

## 1. Multi-Dimensional Cost Aggregation Matrix

| Cost Category | Default Unit Rate | Measurement Unit | Billing Granularity |
| :--- | :--- | :--- | :--- |
| **AI LLM Tokens** | Dynamic per model (\$0.00015 – \$0.015 / 1k) | Exact tokens | Per API call |
| **Synthetic Probes** | \$0.00010 | Per HTTP probe request | Per probe invocation |
| **Webhook Delivery**| \$0.00005 | Per webhook dispatch | Per dispatch attempt |
| **Sandbox Compute** | \$0.00200 | Per minute of container execution | Per millisecond elapsed |
| **Evidence Storage**| \$0.00001 | Per megabyte stored per month | Per megabyte allocated |

---

## 2. Multi-Tier Budget Thresholds & Automated Throttling

Organizations configure monthly budgets at the Organization and Workspace levels with deterministic threshold actions:

```
[Monthly Spend / Budget Ratio]
       │
       ├── < 80%: Normal Autonomous Operations (STATUS: OK)
       │
       ├── 80% Threshold: WARNING Alert Dispatched
       │     └── Dispatches alert to Slack/Email (NOTIFICATION_LEVEL: WARNING)
       │
       ├── 90% Threshold: CRITICAL Budget Warning
       │     └── Dispatches high-priority alert to SRE and FinOps teams
       │
       └── 100% Limit: THROTTLED (Autonomous Operations Suspended)
             │
             ├── Standard non-essential repairs & scans: REJECTED (HTTP 429)
             └── Security-Critical Repairs (CRITICAL / HIGH): BYPASS ALLOWED
```

### Security-Critical Incident Bypass Enclave
> [!IMPORTANT]
> **Zero-Downtime Security Guarantee**: When a budget reaches 100% capacity, standard routine optimizations and non-critical scans are paused. However, if an incident is tagged `isSecurityCritical: true` (e.g. active authentication failure or zero-day vulnerability patch), the Cost Intelligence Engine **explicitly bypasses throttling** to ensure enterprise security is never compromised by cost caps.

---

## 3. Cost Intelligence REST API

### Get Multi-Dimensional Spend Intelligence
`GET /api/costs/intelligence?organizationId=org_enterprise_primary&workspaceId=ws_demo_primary`

Response:
```json
{
  "organizationId": "org_enterprise_primary",
  "workspaceId": "ws_demo_primary",
  "period": "2026-09",
  "totalCost": 14.825,
  "budgetLimit": 100.00,
  "utilizationPercentage": 14.82,
  "status": "NORMAL",
  "costBreakdown": {
    "aiTokens": 10.450,
    "probes": 1.250,
    "webhooks": 0.375,
    "sandboxCompute": 2.500,
    "storage": 0.250
  },
  "aiUsageSummary": {
    "totalCalls": 142,
    "totalTokens": 284000,
    "topModels": [
      { "model": "claude-3-5-sonnet-20241022", "spend": 8.50, "tokens": 190000 },
      { "model": "openai/gpt-oss-120b", "spend": 1.95, "tokens": 94000 }
    ]
  }
}
```
