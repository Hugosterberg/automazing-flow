-- Swedish organisation number for registry lookups (Bolagsverket).

alter table public.business_profiles
  add column if not exists org_number text;

alter table public.leads
  add column if not exists org_number text;

create index if not exists business_profiles_org_number_idx
  on public.business_profiles (org_number)
  where org_number is not null;
