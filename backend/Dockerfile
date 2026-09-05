# =========================================================================
# APIFIX AI — Production Multi-Stage Backend Dockerfile (Node.js 20 Alpine)
# =========================================================================

# Stage 1: Dependency Installation
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --only=production --no-audit --no-fund

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache wget

# Create non-root system user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apifix

# Create required ephemeral directories with proper permissions
RUN mkdir -p /app/workspaces /app/storage /app/uploads /app/data && \
    chown -R apifix:nodejs /app

# Copy production dependencies from deps stage
COPY --from=deps --chown=apifix:nodejs /app/node_modules ./node_modules
COPY --chown=apifix:nodejs package.json ./

# Copy application source and migrations
COPY --chown=apifix:nodejs src/ ./src/
COPY --chown=apifix:nodejs migrations/ ./migrations/

# Set production environment defaults (Secrets injected at runtime)
ENV NODE_ENV=production
ENV PORT=4000
ENV APIFIX_DEMO_MODE=false

USER apifix

EXPOSE 4000

# Health check using the liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "src/server.js"]
