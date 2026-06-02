-- Per-tenant integration secrets + per-tenant Zernio profile.
--
-- Stores bring-your-own API keys / config values that belong to a single
-- business_profile (tenant): Tripadvisor location id + optional key, Google Ads
-- customer id, optional per-tenant OpenAI key, etc. Values are encrypted at rest
-- by the server (AES-256-GCM, see server/lib/secretCrypto.ts) before they ever
-- reach the database — the columns hold ciphertext, never plaintext.
--
-- Access model: this table is touched ONLY by the server using the Supabase
-- service role (which bypasses RLS). Clients never read it directly — the UI
-- gets "configured / not configured" status from a server endpoint. We enable
-- RLS with no permissive policies so anon/authenticated keys are denied by
-- default; the service role still has full access.
--
-- Additive + idempotent: safe to run multiple times.

-- -------------------------------------------------------------------------
-- 1. Per-tenant Zernio profile id on business_profiles.
--    One global ZERNIO_API_KEY (platform owner) covers all tenants; each
--    business_profile maps to its own Zernio "profile" (workspace) so a
--    tenant's connected channels / inbox stay isolated within that key.
-- -------------------------------------------------------------------------
alter table public.business_profiles
  add column if not exists zernio_profile_id text;

comment on column public.business_profiles.zernio_profile_id is
  'Zernio profile (workspace) id created under the global Zernio API key for this tenant. Created on demand by the server.';

-- -------------------------------------------------------------------------
-- 2. integration_secrets (per business_profile, per key, encrypted value).
-- -------------------------------------------------------------------------
create table if not exists public.integration_secrets (
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  key text not null,
  value_ciphertext text not null,
  value_iv text not null,
  value_tag text not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_profile_id, key)
);

create index if not exists integration_secrets_bp_idx
  on public.integration_secrets(business_profile_id);

comment on table public.integration_secrets is
  'Per-tenant integration secrets/config. Values are AES-256-GCM ciphertext written by the server (service role only).';

-- -------------------------------------------------------------------------
-- 3. RLS: deny all by default. Only the service role (bypasses RLS) touches
--    this table. No anon/authenticated policies are created intentionally.
-- -------------------------------------------------------------------------
alter table public.integration_secrets enable row level security;
