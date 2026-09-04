-- =========================================================================
-- Migration: 004_governance_audit.sql (Version: 20.0.0)
-- Enterprise Governance, Immutable Cryptographic Audit Ledger & Compliance
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id TEXT PRIMARY KEY DEFAULT ('org_' || substr(md5(random()::text), 1, 12)),
  name TEXT NOT NULL,
  owner_id TEXT REFERENCES public.users(id),
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_ledger (
  id TEXT PRIMARY KEY DEFAULT ('aud_' || substr(md5(random()::text), 1, 12)),
  organization_id TEXT REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT,
  previous_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ledger_org ON public.audit_ledger (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_ledger_hash ON public.audit_ledger (entry_hash);
