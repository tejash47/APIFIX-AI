-- =========================================================================
-- Migration: 005_api_keys_scim_sso.sql (Version: 21.0.0)
-- Scoped API Keys (SHA-256 Hashes Only), SSO Integrations, and SCIM 2.0
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id TEXT PRIMARY KEY DEFAULT ('key_' || substr(md5(random()::text), 1, 12)),
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes JSONB DEFAULT '["read:projects", "read:runs"]'::jsonb,
  status TEXT DEFAULT 'ACTIVE',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON public.api_keys (workspace_id);
