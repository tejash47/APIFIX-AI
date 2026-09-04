# APIFIX AI — Cloud Architecture & Network Topology (Phase 23)

## 1. Network Topology & Edge Security

```
                                  [ INTERNET ]
                                       │
                                       ▼ (HTTPS 443 / TLS 1.3)
                       [ Cloudflare / Cloud Load Balancer ]
                                       │
                       ┌───────────────┴───────────────┐
                       ▼                               ▼
            [ Frontend Next.js Web ]        [ Backend Express API ]
            (Port 3000 / Non-root)          (Port 4000 / Non-root)
                                                       │
                           ┌───────────────────────────┼───────────────────────────┐
                           ▼                           ▼                           ▼
                [ Supabase PostgreSQL ]     [ Worker Fleet / DLQ ]      [ AI Model Mesh ]
                (SSL Enforced / RLS)        (30s Leases / SHA-256)      (Anthropic / OpenAI / Groq)
```

---

## 2. Infrastructure Components

1. **Edge Reverse Proxy**:
   - Terminating TLS 1.3, enforcing HSTS (`max-age=63072000; includeSubDomains; preload`), and applying strict Content Security Policy (CSP).
   - Injects `X-Request-Id` and `X-Correlation-Id` headers for end-to-end request tracing.
2. **Compute Layer**:
   - Multi-stage containerized deployments running under non-root user privileges (`apifix` / `nextjs`).
   - Ephemeral working workspaces (`/app/workspaces`) for isolated patch synthesis and AST quality gates.
3. **Persistence Layer**:
   - Managed Supabase PostgreSQL with automated daily backups, versioned schema migrations (001–007), and row-level security (RLS).
   - Dual-persistence engine: in-memory fallback ensures zero-downtime operation during database maintenance windows.
