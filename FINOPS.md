# APIFIX AI — FinOps & AI Cost Intelligence Engine (Phase 22)

## Cost Intelligence Architecture

The APIFIX AI FinOps Engine attributes infrastructure, compute, and AI costs across:
- **Organizations & Workspaces**
- **Repositories & Projects**
- **Autonomous Repair Runs**
- **AI Providers:** Groq (`llama-3.3-70b-versatile`), Anthropic (`claude-3-7-sonnet`), OpenAI (`gpt-4o`)
- **Execution Sandboxes, Webhook Dispatches, and Synthetic Probes**

---

## Unit Economics & Efficiency Metrics

### 1. Cost Per Verified Repair
$$\text{Cost Per Verified Repair} = \frac{\text{Total AI \& Sandbox Compute Cost}}{\text{Number of Verified Passing Repairs}}$$

### 2. Provider Cost-Efficiency Benchmark
| Provider | Primary Model | Cost / 1k Tokens | Average Latency | Verified Efficiency |
| :--- | :--- | :--- | :--- | :--- |
| **Groq** | `llama-3.3-70b-versatile` | $0.00059 / 1k | ~350ms | Ultra High |
| **Anthropic** | `claude-3-7-sonnet` | $0.00300 / 1k | ~1800ms | High (Complex) |
| **OpenAI** | `gpt-4o` | $0.00250 / 1k | ~1400ms | High |

---

## Predictive Budget States

```
NORMAL (0-75%) ──> WARNING (75-90%) ──> CRITICAL (90-99%) ──> THROTTLED (100%+) ──> EMERGENCY (>120% / Anomaly)
```

---

## The Security-Critical Enclave

> [!IMPORTANT]
> **Zero Compromise Security Invariant**: When an organization reaches 100% budget utilization (`THROTTLED`), non-essential background workloads are paused. However, incidents marked with `isSecurityCritical: true` or `severity: "CRITICAL"` **bypass cost throttling** to ensure urgent vulnerability patches are never delayed.
