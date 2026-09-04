# APIFIX AI — Developer Portal & API Ecosystem UI

## 1. Overview

The APIFIX AI Developer Portal (`/developer`) is an interactive Next.js 14 web application designed for software engineers, platform architects, and DevOps practitioners. It provides unified management of:
- **API Keys & Scopes**: Generation, copy-to-clipboard raw secrets, scope assignment, rotation, and revocation.
- **Outbound Webhooks**: Destination URL registration, event subscription filtering, ping delivery testing, and delivery audit logs.
- **Interactive API Documentation & SDKs**: Live cURL, Node.js, and Python code snippets for all `/api/v1/*` endpoints.
- **Real-Time API Usage & Latency Percentiles**: Live visual gauge metrics for p50, p95, p99 latency, request volume, and error rates.
- **CI/CD Pipeline Workflow Generators**: 1-click YAML generation for GitHub Actions, GitLab CI, Bitbucket Pipelines, and Azure DevOps.

---

## 2. Component Architecture

```
frontend/
├── src/app/developer/page.tsx               # Developer Portal route entrypoint
├── src/components/DeveloperPortalView.tsx   # Master 5-tab developer console
│   ├── Tab 1: API Keys Console
│   │   ├── Scoped Key Creation Modal (apifix_live_... / apifix_test_...)
│   │   ├── One-Time Secret Reveal Banner & Copy Action
│   │   ├── Key Lifecycle Table (Rotation / Revocation)
│   │   └─ SHA-256 Hash Display
│   ├── Tab 2: Outbound Webhooks Console
│   │   ├── Subscription Manager (17 Supported Events)
│   │   ├── Secret Viewer (whsec_...)
│   │   ├── Live Ping Test Trigger
│   │   └─ Delivery History Table & Dead-Letter Replay
│   ├── Tab 3: Interactive API Explorer & SDK Samples
│   │   ├── Method Badges (GET/POST/PUT/DELETE)
│   │   ├── Live cURL, Node.js, Python Code Generators
│   │   └─ OpenAPI 3.1 Spec Export Link (/openapi.json)
│   ├── Tab 4: API Analytics & Telemetry
│   │   ├── Latency Percentiles Gauge (p50, p95, p99)
│   │   ├── Status Code Distribution (2xx, 4xx, 5xx)
│   │   └─ Top Consumer Endpoints & API Keys
│   └── Tab 5: CI/CD Integration & Workflow Generator
│       ├── Platform Selector (GitHub, GitLab, Bitbucket, Azure)
│       ├── Interactive YAML Previewer
│       └─ 1-Click Copy Configuration
```

---

## 3. Theme & Accessibility Standards

- **Dark-First Design System**: Built with CSS variables (`--bg-primary`, `--accent-cyan`, `--accent-purple`, `--border-color`).
- **Responsive Layout**: Fluid grids and overflow containers for seamless viewing on desktop, tablet, and mobile displays.
- **ARIA & Keyboard Navigation**: Full WCAG 2.1 AA accessibility compliance with descriptive `aria-label`, keyboard focus rings, and screen-reader announcements.
- **Zero Hardcoded Secrets**: Secrets are rendered strictly via runtime API state and never hardcoded in client components.
