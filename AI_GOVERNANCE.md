# APIFIX AI — Enterprise AI Governance & Safety Control Plane

## Executive Overview

APIFIX AI Phase 20 establishes a strict **AI Governance Engine** that regulates all large language model (LLM) interactions, token consumption, model allowlists, and prompt safety across autonomous investigation and repair synthesis workflows.

---

## 1. Approved Model Allowlisting & Pricing Matrix

To protect enterprise confidentiality, APIFIX AI enforces organization-level model allowlists. Any attempt to invoke an unapproved provider or model is blocked immediately with `AI_MODEL_NOT_PERMITTED`.

### Supported Enterprise Providers & Estimated Pricing Rates (per 1,000 Tokens)

| Model Name | Provider | Input Cost ($ / 1k) | Output Cost ($ / 1k) | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| `claude-3-5-sonnet-20241022` | Anthropic | \$0.0030 | \$0.0150 | Complex AST analysis, causal chain synthesis |
| `claude-3-haiku-20240307` | Anthropic | \$0.00025 | \$0.00125 | Fast route categorization & triage |
| `gpt-4o` | OpenAI | \$0.0050 | \$0.0150 | Multi-hypothesis generation & verification |
| `gpt-4o-mini` | OpenAI | \$0.00015 | \$0.00060 | Quick regex & syntax validation |
| `openai/gpt-oss-120b` | Groq | \$0.0005 | \$0.0015 | High-speed low-latency inference |
| `llama-3.3-70b-versatile` | Groq | \$0.00059 | \$0.00079 | Open-source fast repair synthesis |

> [!NOTE]
> **Estimation Transparency**: AI operational costs are recorded and labeled truthfully as `ESTIMATED` based on standard token pricing matrices, reflecting real token input and output counts measured by the backend telemetry collector.

---

## 2. Organization Token Quotas & Spend Tracking

The AI Governance Service tracks daily and monthly token usage across all workspaces:

```
[Agent LLM Request]
       │
       ▼
[AI Governance Pre-Check]
  ├── Is model on Organization Allowlist? (e.g., ['claude-3-5-sonnet', 'gpt-4o'])
  ├── Will request exceed Daily Token Quota (e.g., 2,000,000 tokens)?
  └── Will request exceed Daily Spend Limit (e.g., $100.00 / day)?
       │
       ├── PASS: Call LLM with strict bounded timeout (30s)
       └── BLOCKED: Return HTTP 429 / 403 (AI_BUDGET_EXCEEDED)
```

### AI Usage Ledger Entry Structure
Every LLM call logs an immutable usage entry containing:
- `usageId`: Unique tracking ID (`ai_use_<uuid>`).
- `workspaceId` & `organizationId`: Tenant scoping.
- `model`: Exact model invoked.
- `provider`: Provider name (`anthropic`, `openai`, `groq`).
- `promptTokens` & `completionTokens`: Exact token metrics.
- `estimatedCost`: Calculated USD cost with 6 decimal precision.
- `purpose`: Task context (`INVESTIGATION`, `PATCH_SYNTHESIS`, `VERIFICATION`).
- `timestamp`: UTC ISO-8601 timestamp.

---

## 3. Prompt-Injection & Anti-Exfiltration Defense

Untrusted code repositories and API payload errors can contain malicious instructions intended to hijack LLM behavior.

### Defense-in-Depth Mechanisms:
1. **Instruction-Data Separation**: Code under repair, stack traces, and repository markdown files are strictly enclosed in delimiter tags (`<untrusted_source_content>`) with system instructions explicitly commanding the model to treat content strictly as static syntax data.
2. **Secret Redaction Prior to LLM Dispatch**: All outbound prompts pass through `sanitizeSecrets` before reaching any remote LLM endpoint.
3. **Structured JSON Output Enforcement**: LLMs are required to return strict JSON matching deterministic schemas; freeform text containing injected markdown or script tags is rejected by the schema validator.
