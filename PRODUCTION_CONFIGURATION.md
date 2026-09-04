# APIFIX AI — Production Configuration & Security Matrix (Phase 22)

## Environment Variable Reference

| Variable | Required in Prod | Description | Safe Default / Format |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **YES** | Runtime environment (`production`, `staging`, `development`) | `production` |
| `PORT` | **YES** | Port for HTTP server ingress | `4000` |
| `JWT_SECRET` | **YES** | Cryptographic signing secret (Min 32 characters) | High-entropy random hex |
| `SUPABASE_URL` | Optional | Supabase PostgreSQL HTTPS URL | `https://*.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase service role secret | Encrypted key string |
| `GROQ_API_KEY` | **YES*** | Primary fast inference provider key | `gsk_...` |
| `ANTHROPIC_API_KEY` | Optional | Secondary complex reasoning provider key | `sk-ant-...` |
| `OPENAI_API_KEY` | Optional | Tertiary fallback provider key | `sk-proj-...` |
| `STRIPE_SECRET_KEY` | Optional | Stripe billing live/test secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signature secret | `whsec_...` |
| `CORS_ORIGIN` | **YES** | Allowed CORS origins (Wildcard `*` forbidden) | `https://app.apifix.ai` |
| `APP_BASE_URL` | **YES** | Public HTTPS Frontend Base URL | `https://app.apifix.ai` |
| `SHUTDOWN_TIMEOUT_MS` | Optional | Bounded window for graceful drain | `15000` |

*\* At least one AI provider key must be configured in production.*
