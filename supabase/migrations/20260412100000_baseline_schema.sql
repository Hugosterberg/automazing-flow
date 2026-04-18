-- Baseline schema for a fresh Supabase project.
-- Derived from AccountsContext.tsx row types: AccountRow + ProfileRow.
--
-- Must run before 20260412120000_connected_accounts_disconnected_at.sql,
-- which only ALTERs connected_accounts and assumes the table exists.
--
-- Idempotent — safe to re-run against environments where these tables
-- were created out-of-band (e.g. Supabase Studio UI).

-- -------------------------------------------------------------------------
-- profiles (legacy "business profile" per user — kept for backward compat
-- with current AccountsContext; new code uses public.business_profiles
-- created by 20260417120000_core_multitenant.sql).
-- -------------------------------------------------------------------------
create table if not exists public.profiles (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_user_idx on public.profiles(user_id);

alter table public.profiles enable row level security;

drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all on public.profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -------------------------------------------------------------------------
-- connected_accounts (one row per linked external channel).
-- disconnected_at is added by the next migration, on purpose.
-- business_profile_id + health/last_synced/last_sync_error are added by
-- 20260417120000_core_multitenant.sql.
-- -------------------------------------------------------------------------
create table if not exists public.connected_accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  platform text not null,
  username text not null,
  display_name text,
  avatar_url text,
  profile_url text,
  connected_at timestamptz not null default now(),
  is_oauth boolean not null default false,
  is_zernio boolean not null default false,
  zernio_account_id text,
  stats jsonb,
  analysis jsonb
);

create index if not exists connected_accounts_user_idx
  on public.connected_accounts(user_id);
create index if not exists connected_accounts_profile_idx
  on public.connected_accounts(profile_id);

alter table public.connected_accounts enable row level security;

-- Baseline policy: user_id must match the caller. Will be replaced / extended
-- by 20260417120000_core_multitenant.sql with membership-based policies.
drop policy if exists connected_accounts_owner_all on public.connected_accounts;
create policy connected_accounts_owner_all on public.connected_accounts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
