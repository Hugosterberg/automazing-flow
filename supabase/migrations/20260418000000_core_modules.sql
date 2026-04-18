-- Core modules schema: user_profiles, integrations, sync_runs,
-- activity_events, tasks, ai_recommendations.
--
-- Additive only. Builds on:
--   * 20260412100000_baseline_schema.sql      (legacy profiles, connected_accounts)
--   * 20260417120000_core_multitenant.sql     (business_profiles, memberships, connection health)
--
-- Safe to run multiple times (idempotent guards).

-- =========================================================================
-- 0. Shared helpers
-- =========================================================================

-- is_member(bp_id): SECURITY DEFINER so RLS policies don't recurse into
-- memberships. Used by every tenant-scoped policy below.
create or replace function public.is_member(bp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_profile_id = bp_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated, service_role;

-- is_member_with_role(bp_id, roles[]): same as above, restricted by role.
create or replace function public.is_member_with_role(bp_id uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.business_profile_id = bp_id
      and m.user_id = auth.uid()
      and m.role = any (roles)
  );
$$;

revoke all on function public.is_member_with_role(uuid, text[]) from public;
grant execute on function public.is_member_with_role(uuid, text[]) to authenticated, service_role;

-- touch_updated_at(): generic trigger that keeps updated_at fresh on UPDATE.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =========================================================================
-- 1. Enums
-- =========================================================================

do $$ begin
  create type public.integration_category as enum (
    'social', 'communication', 'calendar', 'reviews',
    'content', 'ecommerce', 'mail', 'analytics', 'custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sync_run_kind as enum (
    'full', 'delta', 'reconcile', 'refresh_token', 'backfill'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sync_run_status as enum (
    'queued', 'running', 'success', 'partial', 'failed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_event_severity as enum (
    'info', 'success', 'warning', 'error'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum (
    'open', 'in_progress', 'blocked', 'done', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum (
    'low', 'medium', 'high', 'urgent'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_recommendation_kind as enum (
    'content', 'outreach', 'engagement', 'maintenance', 'insight'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_recommendation_status as enum (
    'new', 'seen', 'accepted', 'dismissed', 'expired'
  );
exception when duplicate_object then null; end $$;

-- Free-text taxonomy for cross-module linking. Kept as text (not enum) so
-- new modules can be added without a schema migration.
-- Expected values: connections, content, social, calendar, reviews,
-- customers, marketing, messaging, ai, admin.

-- =========================================================================
-- 2. user_profiles — per-auth-user metadata
-- =========================================================================
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text,
  timezone text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_self_select on public.user_profiles;
create policy user_profiles_self_select on public.user_profiles
  for select using (id = auth.uid());

drop policy if exists user_profiles_self_upsert on public.user_profiles;
create policy user_profiles_self_upsert on public.user_profiles
  for insert with check (id = auth.uid());

drop policy if exists user_profiles_self_update on public.user_profiles;
create policy user_profiles_self_update on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- =========================================================================
-- 3. integrations — global catalog (no tenant scope)
-- =========================================================================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category public.integration_category not null,
  provider text not null default 'zernio',  -- zernio | official | native
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integrations_category_idx
  on public.integrations(category) where is_enabled;

drop trigger if exists integrations_touch_updated_at on public.integrations;
create trigger integrations_touch_updated_at
  before update on public.integrations
  for each row execute function public.touch_updated_at();

alter table public.integrations enable row level security;

-- All signed-in users may read the catalog. Writes are server-side only
-- (service role bypasses RLS), so no insert/update/delete policies.
drop policy if exists integrations_read_all on public.integrations;
create policy integrations_read_all on public.integrations
  for select using (auth.role() = 'authenticated');

-- =========================================================================
-- 4. sync_runs — per-connection sync history
-- =========================================================================
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  connected_account_id text references public.connected_accounts(id) on delete set null,
  kind public.sync_run_kind not null default 'delta',
  status public.sync_run_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  items_processed integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sync_runs_bp_idx
  on public.sync_runs(business_profile_id, created_at desc);
create index if not exists sync_runs_account_idx
  on public.sync_runs(connected_account_id, created_at desc);
create index if not exists sync_runs_status_idx
  on public.sync_runs(status)
  where status in ('queued', 'running');

alter table public.sync_runs enable row level security;

drop policy if exists sync_runs_select on public.sync_runs;
create policy sync_runs_select on public.sync_runs
  for select using (public.is_member(business_profile_id));

drop policy if exists sync_runs_insert on public.sync_runs;
create policy sync_runs_insert on public.sync_runs
  for insert with check (public.is_member(business_profile_id));

drop policy if exists sync_runs_update on public.sync_runs;
create policy sync_runs_update on public.sync_runs
  for update using (public.is_member(business_profile_id));
-- No delete policy: sync history is append-only from the client. Service
-- role can purge via scheduled jobs.

-- =========================================================================
-- 5. activity_events — cross-module audit trail / feed
-- =========================================================================
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  module text not null,
  event_type text not null,
  subject_type text,
  subject_id text,
  severity public.activity_event_severity not null default 'info',
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists activity_events_bp_time_idx
  on public.activity_events(business_profile_id, occurred_at desc);
create index if not exists activity_events_bp_module_idx
  on public.activity_events(business_profile_id, module, occurred_at desc);
create index if not exists activity_events_subject_idx
  on public.activity_events(subject_type, subject_id)
  where subject_id is not null;

alter table public.activity_events enable row level security;

drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
  for select using (public.is_member(business_profile_id));

drop policy if exists activity_events_insert on public.activity_events;
create policy activity_events_insert on public.activity_events
  for insert with check (public.is_member(business_profile_id));
-- activity_events are append-only. No update/delete from authenticated users.

-- =========================================================================
-- 6. tasks — product-wide work items
-- =========================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'medium',
  module text,
  related_type text,
  related_id text,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_bp_status_idx
  on public.tasks(business_profile_id, status);
create index if not exists tasks_bp_due_idx
  on public.tasks(business_profile_id, due_at)
  where status in ('open', 'in_progress');
create index if not exists tasks_assignee_idx
  on public.tasks(assigned_to)
  where assigned_to is not null;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

alter table public.tasks enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (public.is_member(business_profile_id));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert with check (public.is_member(business_profile_id));

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update using (public.is_member(business_profile_id));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete using (
    public.is_member_with_role(business_profile_id, array['owner','admin','editor'])
  );

-- =========================================================================
-- 7. ai_recommendations — structured AI suggestions
-- =========================================================================
create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  kind public.ai_recommendation_kind not null,
  status public.ai_recommendation_status not null default 'new',
  title text not null,
  summary text,
  rationale text,
  confidence numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  module text,
  related_type text,
  related_id text,
  suggested_action jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_recs_bp_status_idx
  on public.ai_recommendations(business_profile_id, status, created_at desc);
create index if not exists ai_recs_bp_kind_idx
  on public.ai_recommendations(business_profile_id, kind)
  where status = 'new';

drop trigger if exists ai_recommendations_touch_updated_at on public.ai_recommendations;
create trigger ai_recommendations_touch_updated_at
  before update on public.ai_recommendations
  for each row execute function public.touch_updated_at();

alter table public.ai_recommendations enable row level security;

drop policy if exists ai_recs_select on public.ai_recommendations;
create policy ai_recs_select on public.ai_recommendations
  for select using (public.is_member(business_profile_id));

drop policy if exists ai_recs_insert on public.ai_recommendations;
create policy ai_recs_insert on public.ai_recommendations
  for insert with check (public.is_member(business_profile_id));

drop policy if exists ai_recs_update on public.ai_recommendations;
create policy ai_recs_update on public.ai_recommendations
  for update using (public.is_member(business_profile_id));

drop policy if exists ai_recs_delete on public.ai_recommendations;
create policy ai_recs_delete on public.ai_recommendations
  for delete using (
    public.is_member_with_role(business_profile_id, array['owner','admin'])
  );

-- =========================================================================
-- 8. Convenience view: connection with integration metadata
-- =========================================================================
-- Source of truth for list reads. RLS on the underlying tables
-- (connected_accounts + integrations) is enforced automatically when the
-- view is queried as authenticated user (no SECURITY DEFINER here).
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
  i.provider  as integration_provider
from public.connected_accounts ca
left join public.integrations  i on i.slug = ca.platform;

comment on view public.v_connection_health is
  'List read model for connections: joins connected_accounts with the global integrations catalog. RLS is enforced via the underlying tables.';

grant select on public.v_connection_health to authenticated, service_role;

-- =========================================================================
-- 9. Seed: integration catalog baseline (idempotent upsert)
-- =========================================================================
insert into public.integrations (slug, name, category, provider) values
  ('instagram',        'Instagram',        'social',        'zernio'),
  ('tiktok',           'TikTok',           'social',        'zernio'),
  ('youtube',          'YouTube',          'social',        'zernio'),
  ('x',                'X',                'social',        'zernio'),
  ('facebook',         'Facebook',         'social',        'zernio'),
  ('whatsapp',         'WhatsApp',         'communication', 'zernio'),
  ('google_business',  'Google Business',  'reviews',       'official'),
  ('google_reviews',   'Google Reviews',   'reviews',       'official'),
  ('tripadvisor',      'Tripadvisor',      'reviews',       'zernio'),
  ('google_calendar',  'Google Calendar',  'calendar',      'official'),
  ('outlook_calendar', 'Outlook Calendar', 'calendar',      'official'),
  ('gmail',            'Gmail',            'mail',          'official'),
  ('outlook',          'Outlook',          'mail',          'official'),
  ('google_drive',     'Google Drive',     'content',       'official'),
  ('shopify',          'Shopify',          'ecommerce',     'official'),
  ('notion',           'Notion',           'ecommerce',     'zernio')
on conflict (slug) do update
  set name      = excluded.name,
      category  = excluded.category,
      provider  = excluded.provider,
      updated_at = now();
