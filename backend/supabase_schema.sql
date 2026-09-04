-- =========================================================
-- APIFIX AI — Supabase PostgreSQL Database Schema (Phase 12)
-- Multi-Tenant Workspaces, Persistence & Repair Operations
-- =========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT DEFAULT '',
  role TEXT DEFAULT 'developer',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (lower(email));

-- 3. Create Workspaces Table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id TEXT PRIMARY KEY DEFAULT ('ws_' || substr(md5(random()::text), 1, 12)),
  name TEXT NOT NULL,
  owner_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  credits INTEGER DEFAULT 10,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces (owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_stripe_customer ON public.workspaces (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_plan ON public.workspaces (plan);

-- 4. Create Workspace Members Table
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id TEXT PRIMARY KEY DEFAULT ('wsm_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'MEMBER', -- OWNER, ADMIN, MEMBER, VIEWER
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON public.workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_email ON public.workspace_members (lower(user_email));

-- 5. Create Workspace Settings Table
CREATE TABLE IF NOT EXISTS public.workspace_settings (
  workspace_id TEXT PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  default_ai_provider TEXT DEFAULT 'groq',
  approval_required BOOLEAN DEFAULT true,
  max_concurrent_repairs INTEGER DEFAULT 3,
  notification_preferences JSONB DEFAULT '{"email": true, "slack": false}'::jsonb,
  security_preferences JSONB DEFAULT '{"blockEnvInArtifacts": true, "strictSandbox": true}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Repositories Table
CREATE TABLE IF NOT EXISTS public.repositories (
  id TEXT PRIMARY KEY DEFAULT ('repo_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT DEFAULT 'github',
  repository_url TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repositories_workspace ON public.repositories (workspace_id);

-- 7. Create Incidents Table
CREATE TABLE IF NOT EXISTS public.incidents (
  id TEXT PRIMARY KEY DEFAULT ('inc_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE SET NULL,
  repository_id TEXT REFERENCES public.repositories(id) ON DELETE SET NULL,
  run_id TEXT,
  user_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'POST',
  status INTEGER DEFAULT 500,
  severity TEXT DEFAULT 'HIGH', -- CRITICAL, HIGH, MEDIUM, LOW
  classification TEXT DEFAULT 'NULL_POINTER_EXCEPTION',
  latency TEXT DEFAULT '140ms',
  error_rate TEXT DEFAULT '12.5%',
  error_message TEXT,
  state TEXT DEFAULT 'OPEN', -- OPEN, INVESTIGATING, RESOLVED, IGNORED
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_workspace ON public.incidents (workspace_id);
CREATE INDEX IF NOT EXISTS idx_incidents_state ON public.incidents (state);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents (severity);

-- 8. Create Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id TEXT,
  user_email TEXT,
  name TEXT NOT NULL,
  technology TEXT NOT NULL,
  framework TEXT,
  source_type TEXT DEFAULT 'zip_upload',
  original_path TEXT,
  working_path TEXT,
  manifest TEXT DEFAULT 'package.json',
  selected_project_path TEXT DEFAULT '.',
  detected_projects JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'ready',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON public.projects (workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);

-- 9. Create Runs & Repair Runs Table
CREATE TABLE IF NOT EXISTS public.repair_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE SET NULL,
  repository_id TEXT REFERENCES public.repositories(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL,
  initiated_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT,
  status TEXT DEFAULT 'initialized',
  current_stage TEXT DEFAULT 'DETECTED',
  started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  failure_reason TEXT,
  confidence TEXT,
  provider TEXT DEFAULT 'groq',
  root_cause JSONB,
  verification_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_runs_workspace ON public.repair_runs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_repair_runs_status ON public.repair_runs (status);
CREATE INDEX IF NOT EXISTS idx_repair_runs_created_at ON public.repair_runs (created_at DESC);

-- Backward compatibility runs table
CREATE TABLE IF NOT EXISTS public.runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id TEXT,
  user_email TEXT,
  status TEXT DEFAULT 'initialized',
  command TEXT,
  port INTEGER,
  framework TEXT,
  runtime TEXT DEFAULT 'Node.js',
  selected_project_path TEXT DEFAULT '.',
  exit_code INTEGER,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_workspace ON public.runs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_runs_project_id ON public.runs (project_id);

-- 10. Create Repair Attempts Table
CREATE TABLE IF NOT EXISTS public.repair_attempts (
  id TEXT PRIMARY KEY DEFAULT ('att_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.repair_runs(id) ON DELETE CASCADE,
  attempt_number INTEGER DEFAULT 1,
  strategy TEXT NOT NULL,
  patch_diff TEXT,
  result TEXT DEFAULT 'SUCCESS',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repair_attempts_run ON public.repair_attempts (run_id);

-- 11. Create Endpoints Table
CREATE TABLE IF NOT EXISTS public.endpoints (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.runs(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  source_file TEXT,
  source_line INTEGER,
  discovery_method TEXT DEFAULT 'source-analysis',
  status TEXT DEFAULT 'DISCOVERED',
  response_time_ms INTEGER,
  http_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Create Findings Table
CREATE TABLE IF NOT EXISTS public.findings (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.runs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT DEFAULT 'MEDIUM',
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Create Investigations Table
CREATE TABLE IF NOT EXISTS public.investigations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.runs(id) ON DELETE CASCADE,
  finding_id TEXT,
  status TEXT DEFAULT 'COMPLETED',
  root_cause JSONB NOT NULL,
  evidence JSONB DEFAULT '[]'::jsonb,
  repair_strategy JSONB NOT NULL,
  hypotheses JSONB DEFAULT '[]'::jsonb,
  model TEXT,
  provider TEXT,
  confidence TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. Create Patches Table
CREATE TABLE IF NOT EXISTS public.patches (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.runs(id) ON DELETE CASCADE,
  investigation_id TEXT,
  user_id TEXT,
  status TEXT DEFAULT 'READY',
  summary TEXT NOT NULL,
  reason TEXT,
  risk TEXT DEFAULT 'LOW',
  changes JSONB NOT NULL,
  before_files JSONB DEFAULT '{}'::jsonb,
  proposed_files JSONB DEFAULT '{}'::jsonb,
  file_hashes JSONB DEFAULT '{}'::jsonb,
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  applied_at TIMESTAMPTZ
);

-- 15. Create Verifications Table
CREATE TABLE IF NOT EXISTS public.verifications (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.runs(id) ON DELETE CASCADE,
  patch_id TEXT,
  user_id TEXT,
  status TEXT DEFAULT 'VERIFIED',
  target JSONB NOT NULL,
  before_evidence JSONB NOT NULL,
  after_evidence JSONB NOT NULL,
  tests JSONB DEFAULT '{}'::jsonb,
  regressions JSONB DEFAULT '[]'::jsonb,
  decision_reason TEXT,
  artifact JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 16. Create Artifacts Table
CREATE TABLE IF NOT EXISTS public.artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.runs(id) ON DELETE CASCADE,
  verification_id TEXT,
  user_id TEXT,
  status TEXT DEFAULT 'VERIFIED',
  zip_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON public.artifacts (workspace_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON public.artifacts (run_id);

-- 17. Create GitHub Pull Requests Table
CREATE TABLE IF NOT EXISTS public.github_pull_requests (
  id TEXT PRIMARY KEY DEFAULT ('pr_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES public.runs(id) ON DELETE CASCADE,
  user_id TEXT,
  repository_owner TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  repair_branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  title TEXT,
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_prs_workspace ON public.github_pull_requests (workspace_id);
CREATE INDEX IF NOT EXISTS idx_github_prs_run_id ON public.github_pull_requests (run_id);

-- 18. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('aud_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  request_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON public.audit_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);

-- 19. Create Credit Ledger Table (Phase 13)
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id TEXT PRIMARY KEY DEFAULT ('crd_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id TEXT,
  amount INTEGER NOT NULL, -- positive for grant/refund/renewal, negative for consumption
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL, -- GRANT, CONSUMPTION, REFUND, RENEWAL, PURCHASE, MANUAL_ADJUSTMENT
  reason TEXT,
  run_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_workspace ON public.credit_ledger (workspace_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_type ON public.credit_ledger (type);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at ON public.credit_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_idempotency ON public.credit_ledger (idempotency_key);

-- 20. Create Billing Events Table (Idempotency for Webhooks - Phase 13)
CREATE TABLE IF NOT EXISTS public.billing_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT DEFAULT 'PROCESSED',
  payload_summary JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_billing_events_workspace ON public.billing_events (workspace_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON public.billing_events (event_type);

-- 21. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- 22. Backend Service Policies
CREATE POLICY "Allow public backend access to users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow public backend access to workspaces" ON public.workspaces FOR ALL USING (true);
CREATE POLICY "Allow public backend access to workspace_members" ON public.workspace_members FOR ALL USING (true);
CREATE POLICY "Allow public backend access to workspace_settings" ON public.workspace_settings FOR ALL USING (true);
CREATE POLICY "Allow public backend access to repositories" ON public.repositories FOR ALL USING (true);
CREATE POLICY "Allow public backend access to incidents" ON public.incidents FOR ALL USING (true);
CREATE POLICY "Allow public backend access to projects" ON public.projects FOR ALL USING (true);
CREATE POLICY "Allow public backend access to repair_runs" ON public.repair_runs FOR ALL USING (true);
CREATE POLICY "Allow public backend access to runs" ON public.runs FOR ALL USING (true);
CREATE POLICY "Allow public backend access to repair_attempts" ON public.repair_attempts FOR ALL USING (true);
CREATE POLICY "Allow public backend access to endpoints" ON public.endpoints FOR ALL USING (true);
CREATE POLICY "Allow public backend access to findings" ON public.findings FOR ALL USING (true);
CREATE POLICY "Allow public backend access to investigations" ON public.investigations FOR ALL USING (true);
CREATE POLICY "Allow public backend access to patches" ON public.patches FOR ALL USING (true);
CREATE POLICY "Allow public backend access to verifications" ON public.verifications FOR ALL USING (true);
CREATE POLICY "Allow public backend access to artifacts" ON public.artifacts FOR ALL USING (true);
CREATE POLICY "Allow public backend access to github_pull_requests" ON public.github_pull_requests FOR ALL USING (true);
CREATE POLICY "Allow public backend access to audit_logs" ON public.audit_logs FOR ALL USING (true);
CREATE POLICY "Allow public backend access to credit_ledger" ON public.credit_ledger FOR ALL USING (true);
CREATE POLICY "Allow public backend access to billing_events" ON public.billing_events FOR ALL USING (true);

-- 23. Seed Admin, Demo Users & Workspaces
INSERT INTO public.users (id, email, password, name, role)
VALUES 
  ('usr_admin_01', 'admin@apifix.ai', '$2a$10$wI5uO8gWJ9gWJ9gWJ9gWJuOqGkGqGkGqGkGqGkGqGkGqGkGqGkGqG', 'System Administrator', 'admin'),
  ('usr_demo_01', 'dev@apifix.ai', '$2a$10$wI5uO8gWJ9gWJ9gWJ9gWJuOqGkGqGkGqGkGqGkGqGkGqGkGqGkGqG', 'Lead Reliability Engineer', 'developer')
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.workspaces (id, name, owner_id)
VALUES 
  ('ws_admin_primary', 'Enterprise Core Workspace', 'usr_admin_01'),
  ('ws_demo_primary', 'Primary Dev Workspace', 'usr_demo_01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_members (id, workspace_id, user_id, user_email, user_name, role)
VALUES 
  ('wsm_admin_01', 'ws_admin_primary', 'usr_admin_01', 'admin@apifix.ai', 'System Administrator', 'OWNER'),
  ('wsm_demo_01', 'ws_demo_primary', 'usr_demo_01', 'dev@apifix.ai', 'Lead Reliability Engineer', 'OWNER')
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO public.workspace_settings (workspace_id, default_ai_provider, approval_required, max_concurrent_repairs)
VALUES 
  ('ws_admin_primary', 'groq', true, 5),
  ('ws_demo_primary', 'groq', true, 3)
ON CONFLICT (workspace_id) DO NOTHING;

-- =========================================================
-- 24. Inbound Webhook Configs (Phase 15)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.inbound_webhook_configs (
  workspace_id TEXT PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================
-- 25. Synthetic Canary Prober Configs (Phase 15)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.synthetic_canary_configs (
  workspace_id TEXT PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  interval_ms INTEGER DEFAULT 30000,
  endpoints JSONB DEFAULT '[]'::jsonb,
  is_running BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================
-- 26. Outbound Alert Channels (Phase 15)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.alert_channels (
  id TEXT PRIMARY KEY DEFAULT ('ach_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- SLACK, DISCORD, WEBHOOK, EMAIL
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_channels_workspace ON public.alert_channels (workspace_id);

-- =========================================================
-- 27. Remediation Policies (Phase 15)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.remediation_policies (
  workspace_id TEXT PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  strategy TEXT DEFAULT 'MANUAL_APPROVAL', -- MANUAL_APPROVAL, AUTO_REPAIR_AND_PR, DIAGNOSE_ONLY
  max_daily_auto_repairs INTEGER DEFAULT 5,
  require_clean_sandbox_pass BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================
-- 28. Workspace SLO Targets (Phase 16)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.workspace_slo_targets (
  workspace_id TEXT PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  availability_target_percent NUMERIC(5,2) DEFAULT 99.90,
  latency_target_ms INTEGER DEFAULT 250,
  repair_success_target_percent NUMERIC(5,2) DEFAULT 90.00,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for Phase 15/16/17 Tables
ALTER TABLE public.inbound_webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_canary_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remediation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_slo_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public backend access to inbound_webhook_configs" ON public.inbound_webhook_configs FOR ALL USING (true);
CREATE POLICY "Allow public backend access to synthetic_canary_configs" ON public.synthetic_canary_configs FOR ALL USING (true);
CREATE POLICY "Allow public backend access to alert_channels" ON public.alert_channels FOR ALL USING (true);
CREATE POLICY "Allow public backend access to remediation_policies" ON public.remediation_policies FOR ALL USING (true);
CREATE POLICY "Allow public backend access to workspace_slo_targets" ON public.workspace_slo_targets FOR ALL USING (true);
