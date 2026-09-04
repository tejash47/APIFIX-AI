-- =========================================================================
-- Migration: 003_resilience_dr.sql (Version: 18.0.0)
-- Resilience Telemetry, Disaster Recovery Runs, and Probe Logs
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.resilience_events (
  id TEXT PRIMARY KEY DEFAULT ('res_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  severity TEXT DEFAULT 'INFO',
  subsystem TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resilience_events_workspace ON public.resilience_events (workspace_id);
CREATE INDEX IF NOT EXISTS idx_resilience_events_type ON public.resilience_events (event_type);
