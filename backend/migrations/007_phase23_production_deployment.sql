-- =========================================================================
-- Migration: 007_phase23_production_deployment.sql (Version: 23.0.0)
-- Deployment Tracking, Canary Records, and Schema Migration Registry
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_by TEXT DEFAULT 'migration_runner',
  applied_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deployments (
  id TEXT PRIMARY KEY DEFAULT ('dep_' || substr(md5(random()::text), 1, 12)),
  version TEXT NOT NULL,
  git_commit TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, CANARY_OBSERVE, FULL_TRAFFIC, PROMOTED, ROLLED_BACK, FAILED
  stage TEXT DEFAULT 'PRE_CHECK',
  canary_weight INTEGER DEFAULT 0,
  health_status TEXT DEFAULT 'HEALTHY',
  error_rate NUMERIC(5, 2) DEFAULT 0.0,
  latency_p99_ms INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deployments_env_status ON public.deployments (environment, status);
