-- Sales leads: companies/contacts to follow up with. A lightweight CRM pipeline
-- scoped per business profile, queried directly from the client under RLS
-- (same model as tasks).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('new', 'contacted', 'qualified', 'won', 'lost');
  end if;
end $$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  company text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  source text,
  status public.lead_status not null default 'new',
  notes text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_bp_status_idx on public.leads(business_profile_id, status);
create index if not exists leads_followup_idx
  on public.leads(business_profile_id, next_follow_up_at)
  where next_follow_up_at is not null;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
  before update on public.leads
  for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select using (public.is_member(business_profile_id));

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert with check (public.is_member(business_profile_id));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update using (public.is_member(business_profile_id))
  with check (public.is_member(business_profile_id));

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete using (
    public.is_member_with_role(business_profile_id, array['owner','admin','editor'])
  );

comment on table public.leads is
  'Sales leads / outreach pipeline per business profile. Status: new→contacted→qualified→won/lost.';
