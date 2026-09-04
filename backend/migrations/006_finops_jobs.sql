-- =========================================================================
-- Migration: 006_finops_jobs.sql (Version: 22.0.0)
-- Persistent Job Queue, Leases, Dead-Letter Queue & FinOps AI Cost Ledger
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.job_queue (
  id TEXT PRIMARY KEY DEFAULT ('job_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'QUEUED', -- QUEUED, RUNNING, COMPLETED, FAILED, DEAD_LETTER
  payload JSONB DEFAULT '{}'::jsonb,
  fingerprint TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status ON public.job_queue (status);
CREATE INDEX IF NOT EXISTS idx_job_queue_fingerprint ON public.job_queue (fingerprint);

CREATE TABLE IF NOT EXISTS public.finops_cost_events (
  id TEXT PRIMARY KEY DEFAULT ('cost_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  tokens_prompt INTEGER DEFAULT 0,
  tokens_completion INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finops_cost_workspace ON public.finops_cost_events (workspace_id);
