-- First-party website visitor tracking. One site key per business profile
-- (embedded in the tenant's website via the /api/track.js snippet) and one row
-- per pageview. Ingest happens on the server via the service role after the
-- site key is resolved; members read their tenant's history via RLS.

create table if not exists public.site_tracking_sites (
  business_profile_id uuid primary key references public.business_profiles(id) on delete cascade,
  site_key text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.site_tracking_sites enable row level security;

drop policy if exists site_tracking_sites_select on public.site_tracking_sites;
create policy site_tracking_sites_select on public.site_tracking_sites
  for select using (public.is_member(business_profile_id));

comment on table public.site_tracking_sites is
  'Per-tenant site key for the first-party visitor tracking snippet. Writes via service role.';

create table if not exists public.site_visit_events (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  -- Daily-rotating hash of ip+ua+site (never the raw values) — cookieless
  -- unique-visitor counting without storing anything personally identifiable.
  session_hash text not null,
  path text not null,
  referrer_host text,
  device text,
  created_at timestamptz not null default now()
);

create index if not exists site_visit_events_bp_created_idx
  on public.site_visit_events(business_profile_id, created_at desc);

alter table public.site_visit_events enable row level security;

drop policy if exists site_visit_events_select on public.site_visit_events;
create policy site_visit_events_select on public.site_visit_events
  for select using (public.is_member(business_profile_id));

comment on table public.site_visit_events is
  'Raw pageview events from the tracking snippet (hashed visitor, path, referrer host). Writes via service role.';
