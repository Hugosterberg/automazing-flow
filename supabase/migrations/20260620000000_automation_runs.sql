-- Automation run history: one row per cron/automation execution so the
-- Automations page can show whether each scheduled job actually ran, when, and
-- with what result. Mirrors the sync_runs / marketing_snapshots pattern.
--
-- Scoping: business_profile_id is NULLABLE on purpose.
--   * NULL  → a global execution (the Vercel cron sweeps every tenant in one
--             request, so its outcome is a single global fact).
--   * SET   → a per-tenant execution (e.g. the manual "run now" trigger which
--             runs the automation for one business profile).
-- Both are read together on the Automations page: the tenant sees the global
-- cron status plus any run scoped to their own profile.

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid references public.business_profiles(id) on delete cascade,
  automation_key text not null,
  status text not null check (status in ('ok', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

-- Latest-run-per-automation lookups (global rows and per-tenant rows).
create index if not exists automation_runs_key_time_idx
  on public.automation_runs(automation_key, finished_at desc);
create index if not exists automation_runs_bp_key_time_idx
  on public.automation_runs(business_profile_id, automation_key, finished_at desc);

alter table public.automation_runs enable row level security;

-- Members can read their tenant's runs plus the shared global cron runs.
-- Writes happen via the service role (the cron sweep + server routes), which
-- bypasses RLS, so no insert/update policy is exposed (same as
-- marketing_snapshots). History is append-only.
drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs
  for select using (
    business_profile_id is null or public.is_member(business_profile_id)
  );

comment on table public.automation_runs is
  'Per-execution automation/cron run history (status, timing, result summary). business_profile_id NULL = global sweep, SET = per-tenant run.';
