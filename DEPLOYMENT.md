# APIFIX AI — Production Deployment Guide (Phase 23)

## 1. Cloud Architecture & Infrastructure Overview

APIFIX AI is built for scalable, multi-tenant cloud deployments across modern PaaS platforms (Render, Railway, Heroku) or container orchestrators (Kubernetes, AWS ECS, GCP Cloud Run).

```
[ Browser / API Clients / CLI ]
             │ (HTTPS / TLS 1.3)
             ▼
    [ Reverse Proxy / Cloudflare ]
             │ (Strict CORS / Rate Limiting)
     ┌───────┴────────────────────────┐
     ▼                                ▼
[ Next.js Frontend ]        [ Express API Gateway ]
(Container Port: 3000)      (Container Port: 4000)
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           ▼                          ▼                          ▼
[ Supabase PostgreSQL ]    [ Persistent Job Queue ]   [ AI Inference Mesh ]
(Connection Pool / RLS)    (Worker Leases / DLQ)      (Claude / GPT-4o / Groq)
```

---

## 2. Docker Container Deployment

### A. Backend Container
```bash
# Build production backend image
docker build -t apifix-backend:latest ./backend

# Run backend container
docker run -d \
  --name apifix-backend \
  -p 4000:4000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your_jwt_secret_min_32_characters \
  -e APIFIX_DEMO_MODE=false \
  apifix-backend:latest
```

### B. Frontend Container
```bash
# Build production frontend image
docker build -t apifix-frontend:latest \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.apifix.ai \
  ./frontend

# Run frontend container
docker run -d \
  --name apifix-frontend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  apifix-frontend:latest
```

### C. Docker Compose Orchestration
```bash
# Start full production stack
docker compose -f docker-compose.production.yml up -d

# Verify stack health
docker compose -f docker-compose.production.yml ps
```

---

## 3. Zero-Downtime Deployment & Canary Rollout

1. **Pre-Check**: Validates environment, migrations (`npm run db:verify`), and security gates.
2. **Canary Deployment**: Launches new version container and routes 10% of traffic.
3. **Observability Window**: Monitors error rates (threshold < 2.0%) and latency p99 (threshold < 1500ms).
4. **Traffic Promotion**: Scales canary traffic from 10% → 50% → 100%.
5. **Automated Rollback**: If health checks or smoke tests fail, traffic is instantly shifted back to the previous stable revision.
