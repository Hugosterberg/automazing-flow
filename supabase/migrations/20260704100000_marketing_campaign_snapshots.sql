-- Per-campaign daily snapshots for week-over-week grade/score trends, plus
-- portfolio score on the existing marketing_snapshots table.

alter table public.marketing_snapshots
  add column if not exists portfolio_score integer,
  add column if not exists portfolio_grade text,
  add column if not exists campaigns_poor integer;

create table if not exists public.marketing_campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  snapshot_date date not null,
  platform text not null check (platform in ('meta_business', 'google_ads')),
  campaign_id text not null,
  campaign_name text not null,
  spend numeric,
  roas numeric,
  score integer,
  grade text,
  impressions bigint,
  clicks bigint,
  conversions numeric,
  created_at timestamptz not null default now(),
  unique (business_profile_id, snapshot_date, platform, campaign_id)
);

create index if not exists marketing_campaign_snapshots_bp_date_idx
  on public.marketing_campaign_snapshots(business_profile_id, snapshot_date desc);

create index if not exists marketing_campaign_snapshots_campaign_idx
  on public.marketing_campaign_snapshots(business_profile_id, platform, campaign_id, snapshot_date desc);

alter table public.marketing_campaign_snapshots enable row level security;

drop policy if exists marketing_campaign_snapshots_select on public.marketing_campaign_snapshots;
create policy marketing_campaign_snapshots_select on public.marketing_campaign_snapshots
  for select using (public.is_member(business_profile_id));

comment on table public.marketing_campaign_snapshots is
  'Daily per-campaign KPIs and letter grades for week-over-week trend on the Marketing page.';
