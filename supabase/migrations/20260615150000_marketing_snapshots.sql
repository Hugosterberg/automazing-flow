-- Daily marketing snapshots: one row per business profile per day, captured by
-- the marketing-snapshot cron. Turns the point-in-time Marketing view into a
-- trend (week-over-week ROAS / spend / revenue).

create table if not exists public.marketing_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  snapshot_date date not null,
  ad_spend numeric,
  revenue numeric,
  orders integer,
  roas numeric,
  currency text,
  created_at timestamptz not null default now(),
  unique (business_profile_id, snapshot_date)
);

create index if not exists marketing_snapshots_bp_date_idx
  on public.marketing_snapshots(business_profile_id, snapshot_date desc);

alter table public.marketing_snapshots enable row level security;

-- Members can read their tenant's history; writes happen via the service role
-- (the cron), which bypasses RLS, so no insert/update policy is exposed.
drop policy if exists marketing_snapshots_select on public.marketing_snapshots;
create policy marketing_snapshots_select on public.marketing_snapshots
  for select using (public.is_member(business_profile_id));

comment on table public.marketing_snapshots is
  'Daily marketing KPIs per business profile (ad spend, revenue, orders, ROAS) for week-over-week trends.';
