# APIFIX AI — System Architecture

High-level architecture of the APIFIX AI control plane and execution engine.

## Component Overview

```
[Customer Web App / Next.js] ── (HTTP/REST + SSE) ──> [APIFIX Control Plane / Express]
                                                          │
   ┌──────────────────────────────────────────────────────┼──────────────────────────────┐
   │                                                      │                              │
   ▼                                                      ▼                              ▼
[Distributed Job Queue]                      [Multi-AI Fallback Engine]      [Isolated Sandbox Runner]
   │                                                      │                              │
   ├─ Distributed Leases                                  ├─ Groq Llama 3.3 70B          ├─ Dynamic Ephemeral TCP
   ├─ Worker Pool (1 to 8 Nodes)                          ├─ Anthropic Claude 3.5        ├─ AST Syntax Validation
   └─ Dead-Letter Queue (DLQ)                             └─ OpenAI GPT-4o               └─ Regression Test Runner
```

## Storage & Persistence Layer
- **Relational PostgreSQL (Supabase)**: Multi-tenant scoped tables for workspaces, projects, incidents, runs, and api keys.
- **In-Memory Fallback**: High-speed memory store for test runners and offline evaluation.
- **Cryptographic Merkle Ledger**: Monotonic SHA-256 hash chains for SOC2 and ISO27001 auditability.
