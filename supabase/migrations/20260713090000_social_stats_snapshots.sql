-- Daily social stats snapshots: one row per connected social/review account per
-- day, captured by the social-stats-snapshot cron from the already-ingested
-- connected_accounts.stats blob. Turns the point-in-time KPI cards on the
-- Social page into trends (week-over-week followers / engagement / rating).

create table if not exists public.social_stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  account_id text not null references public.connected_accounts(id) on delete cascade,
  snapshot_date date not null,
  platform text not null,
  followers integer,
  following integer,
  media_count integer,
  avg_likes numeric,
  avg_comments numeric,
  avg_views numeric,
  engagement_rate numeric,
  average_rating numeric,
  review_count integer,
  -- When the underlying connected_accounts.stats blob was last refreshed, so
  -- trend readers can tell a fresh datapoint from a re-captured stale one.
  stats_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, snapshot_date)
);

create index if not exists social_stats_snapshots_bp_date_idx
  on public.social_stats_snapshots(business_profile_id, snapshot_date desc);

create index if not exists social_stats_snapshots_account_date_idx
  on public.social_stats_snapshots(account_id, snapshot_date desc);

alter table public.social_stats_snapshots enable row level security;

-- Members can read their tenant's history; writes happen via the service role
-- (the cron), which bypasses RLS, so no insert/update policy is exposed.
drop policy if exists social_stats_snapshots_select on public.social_stats_snapshots;
create policy social_stats_snapshots_select on public.social_stats_snapshots
  for select using (public.is_member(business_profile_id));

comment on table public.social_stats_snapshots is
  'Daily social KPIs per connected account (followers, engagement, ratings) for week-over-week trends.';
