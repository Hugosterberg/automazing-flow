-- Additive tidy-ups on the core schema.
-- All changes are non-destructive and backward compatible: every new column is
-- nullable or has a default, no existing column is renamed or dropped, and no
-- RLS policy is modified (existing policies on the parent tables already cover
-- the new columns via row-level access).
--
-- Builds on:
--   * 20260412100000_baseline_schema.sql   (legacy profiles, connected_accounts)
--   * 20260417120000_core_multitenant.sql  (business_profiles, memberships)
--   * 20260418000000_core_modules.sql      (user_profiles, integrations, sync_runs, …)
--
-- Safe to run multiple times.

-- =========================================================================
-- 1. business_profiles.status  — soft-archival lifecycle
-- =========================================================================
-- Enum instead of text so only the four intended values are ever written.
-- Rows inserted before this migration land on 'active' via the default.
do $$ begin
  create type public.business_profile_status as enum (
    'active', 'suspended', 'archived'
  );
exception when duplicate_object then null; end $$;

alter table public.business_profiles
  add column if not exists status public.business_profile_status
    not null default 'active';

create index if not exists business_profiles_status_idx
  on public.business_profiles(status)
  where status <> 'active';

comment on column public.business_profiles.status is
  'Lifecycle: active (default), suspended (temporarily disabled by owner/admin), archived (kept for history, hidden from lists).';

-- =========================================================================
-- 2. business_profiles.slug  — URL-friendly tenant identifier
-- =========================================================================
-- Nullable: legacy rows don't get one auto-generated here (would require
-- collision handling on real data). Enforce uniqueness when set.
-- Postgres UNIQUE treats NULLs as distinct, so multiple NULL slugs are OK.
alter table public.business_profiles
  add column if not exists slug text;

do $$ begin
  alter table public.business_profiles
    add constraint business_profiles_slug_format_chk
    check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$');
exception when duplicate_object then null; end $$;

create unique index if not exists business_profiles_slug_unique_idx
  on public.business_profiles(slug)
  where slug is not null;

comment on column public.business_profiles.slug is
  'URL-friendly unique identifier. Lowercase letters, digits and hyphens only (2-64 chars). Nullable — set when the tenant opts into slug URLs.';

-- =========================================================================
-- 3. user_profiles.default_business_profile_id  — persistent "last used"
-- =========================================================================
-- ON DELETE SET NULL: if the referenced business profile is removed we clear
-- the pointer instead of cascading into the user profile.
alter table public.user_profiles
  add column if not exists default_business_profile_id uuid
    references public.business_profiles(id) on delete set null;

create index if not exists user_profiles_default_bp_idx
  on public.user_profiles(default_business_profile_id)
  where default_business_profile_id is not null;

comment on column public.user_profiles.default_business_profile_id is
  'Last-used business profile id. Syncs "active profile" across devices. Nullable; clients keep localStorage as fallback.';

-- =========================================================================
-- 4. connected_accounts.last_successful_sync_at  — denormalised for lists
-- =========================================================================
-- Derivable from sync_runs (status='success'), but we denormalise so list
-- pages can render it without a per-row subquery. Writer: server-side sync
-- worker after a successful run. Until that writer exists, clients fall
-- back to computing it from sync_runs (see useSyncRuns.ts).
alter table public.connected_accounts
  add column if not exists last_successful_sync_at timestamptz;

comment on column public.connected_accounts.last_successful_sync_at is
  'Timestamp of the most recent successful sync. Denormalised from sync_runs for fast list reads. Written server-side after a successful sync run.';

-- Surface the new column in the list view so the UI can read it via
-- v_connection_health.
--
-- Postgres quirk: CREATE OR REPLACE VIEW may only APPEND columns at the end
-- of the select list — inserting new columns between existing ones is
-- interpreted as a rename (SQLSTATE 42P16). So `last_successful_sync_at`
-- goes last, after the integration_* columns. Consumers select by name
-- (select "*"), column order doesn't matter.
create or replace view public.v_connection_health as
select
  ca.id,
  ca.user_id,
  ca.business_profile_id,
  ca.profile_id,
  ca.platform,
  ca.username,
  ca.display_name,
  ca.avatar_url,
  ca.profile_url,
  ca.connected_at,
  ca.disconnected_at,
  ca.is_oauth,
  ca.is_zernio,
  ca.zernio_account_id,
  ca.stats,
  ca.analysis,
  ca.health,
  ca.last_synced_at,
  ca.last_sync_error,
  i.name      as integration_name,
  i.category  as integration_category,
  i.provider  as integration_provider,
  ca.last_successful_sync_at
from public.connected_accounts ca
left join public.integrations  i on i.slug = ca.platform;

comment on view public.v_connection_health is
  'List read model for connections: joins connected_accounts with the global integrations catalog. RLS is enforced via the underlying tables.';

grant select on public.v_connection_health to authenticated, service_role;
