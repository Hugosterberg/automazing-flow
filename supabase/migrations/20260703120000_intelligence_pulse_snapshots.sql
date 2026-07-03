-- Daily market pulse snapshots: one row per business profile per day per topic,
-- captured by the market-pulse-snapshot cron (LunarCrush MCP). Lets the home
-- dashboard load sentiment without a live MCP call on every cold start.

create table if not exists public.intelligence_pulse_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  snapshot_date date not null,
  topic text not null default 'bitcoin',
  provider text,
  tool text,
  text text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_profile_id, snapshot_date, topic)
);

create index if not exists intelligence_pulse_snapshots_bp_date_idx
  on public.intelligence_pulse_snapshots(business_profile_id, snapshot_date desc);

alter table public.intelligence_pulse_snapshots enable row level security;

drop policy if exists intelligence_pulse_snapshots_select on public.intelligence_pulse_snapshots;
create policy intelligence_pulse_snapshots_select on public.intelligence_pulse_snapshots
  for select using (public.is_member(business_profile_id));

comment on table public.intelligence_pulse_snapshots is
  'Daily LunarCrush market pulse text per business profile and topic for the home dashboard.';
