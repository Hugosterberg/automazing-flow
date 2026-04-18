-- Core multi-tenant schema: business_profiles + memberships + connection health.
-- Additive only: legacy public.profiles and existing columns on public.connected_accounts are left intact.
-- Safe to run multiple times (idempotent guards).

-- -------------------------------------------------------------------------
-- 1. business_profiles (= tenant)
-- -------------------------------------------------------------------------
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  company text,
  email text,
  phone text,
  location text,
  notes text,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_profiles_owner_idx
  on public.business_profiles(owner_user_id);

-- -------------------------------------------------------------------------
-- 2. memberships (user ↔ business_profile, role)
-- -------------------------------------------------------------------------
create table if not exists public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (user_id, business_profile_id)
);

create index if not exists memberships_user_idx
  on public.memberships(user_id);
create index if not exists memberships_bp_idx
  on public.memberships(business_profile_id);

-- -------------------------------------------------------------------------
-- 3. connected_accounts: add tenant FK + health fields (all nullable/defaults,
--    so existing rows and existing code keep working).
-- -------------------------------------------------------------------------
alter table public.connected_accounts
  add column if not exists business_profile_id uuid references public.business_profiles(id) on delete cascade;

alter table public.connected_accounts
  add column if not exists health text not null default 'healthy'
    check (health in ('healthy','expired','failed','disconnected','pending','missing'));

alter table public.connected_accounts
  add column if not exists last_synced_at timestamptz;

alter table public.connected_accounts
  add column if not exists last_sync_error text;

create index if not exists connected_accounts_bp_idx
  on public.connected_accounts(business_profile_id);
create index if not exists connected_accounts_bp_active_idx
  on public.connected_accounts(business_profile_id, disconnected_at);

comment on column public.connected_accounts.business_profile_id is
  'Tenant FK. Nullable during migration; new rows must set this.';
comment on column public.connected_accounts.health is
  'Derived connection health. Written by server during connect/reconcile.';

-- -------------------------------------------------------------------------
-- 4. RLS: only members of a business profile can read/write its rows.
-- -------------------------------------------------------------------------
alter table public.business_profiles enable row level security;
alter table public.memberships       enable row level security;
alter table public.connected_accounts enable row level security;

-- business_profiles
drop policy if exists bp_select on public.business_profiles;
create policy bp_select on public.business_profiles
  for select
  using (
    exists (
      select 1 from public.memberships m
      where m.business_profile_id = public.business_profiles.id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists bp_insert on public.business_profiles;
create policy bp_insert on public.business_profiles
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists bp_update on public.business_profiles;
create policy bp_update on public.business_profiles
  for update
  using (
    exists (
      select 1 from public.memberships m
      where m.business_profile_id = public.business_profiles.id
        and m.user_id = auth.uid()
        and m.role in ('owner','admin')
    )
  );

drop policy if exists bp_delete on public.business_profiles;
create policy bp_delete on public.business_profiles
  for delete
  using (owner_user_id = auth.uid());

-- memberships: each user can see/create their own rows; owners manage the rest.
drop policy if exists mem_select_self on public.memberships;
create policy mem_select_self on public.memberships
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.business_profiles bp
      where bp.id = public.memberships.business_profile_id
        and bp.owner_user_id = auth.uid()
    )
  );

drop policy if exists mem_insert_self on public.memberships;
create policy mem_insert_self on public.memberships
  for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.business_profiles bp
      where bp.id = public.memberships.business_profile_id
        and bp.owner_user_id = auth.uid()
    )
  );

drop policy if exists mem_delete_owner on public.memberships;
create policy mem_delete_owner on public.memberships
  for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.business_profiles bp
      where bp.id = public.memberships.business_profile_id
        and bp.owner_user_id = auth.uid()
    )
  );

-- connected_accounts: membership-gated. Keep a fallback for legacy rows that
-- don't yet have business_profile_id so existing code paths still function.
drop policy if exists conn_select on public.connected_accounts;
create policy conn_select on public.connected_accounts
  for select
  using (
    (
      business_profile_id is not null
      and exists (
        select 1 from public.memberships m
        where m.business_profile_id = public.connected_accounts.business_profile_id
          and m.user_id = auth.uid()
      )
    )
    or (business_profile_id is null and user_id = auth.uid())
  );

drop policy if exists conn_insert on public.connected_accounts;
create policy conn_insert on public.connected_accounts
  for insert
  with check (
    (
      business_profile_id is not null
      and exists (
        select 1 from public.memberships m
        where m.business_profile_id = public.connected_accounts.business_profile_id
          and m.user_id = auth.uid()
      )
    )
    or (business_profile_id is null and user_id = auth.uid())
  );

drop policy if exists conn_update on public.connected_accounts;
create policy conn_update on public.connected_accounts
  for update
  using (
    (
      business_profile_id is not null
      and exists (
        select 1 from public.memberships m
        where m.business_profile_id = public.connected_accounts.business_profile_id
          and m.user_id = auth.uid()
      )
    )
    or (business_profile_id is null and user_id = auth.uid())
  );

drop policy if exists conn_delete on public.connected_accounts;
create policy conn_delete on public.connected_accounts
  for delete
  using (
    (
      business_profile_id is not null
      and exists (
        select 1 from public.memberships m
        where m.business_profile_id = public.connected_accounts.business_profile_id
          and m.user_id = auth.uid()
      )
    )
    or (business_profile_id is null and user_id = auth.uid())
  );

-- -------------------------------------------------------------------------
-- 5. Helper trigger: auto-create an owner membership when a business_profile
--    is inserted, so the owner always has access (avoids race in clients).
-- -------------------------------------------------------------------------
create or replace function public.create_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memberships (user_id, business_profile_id, role)
  values (new.owner_user_id, new.id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists business_profiles_owner_membership on public.business_profiles;
create trigger business_profiles_owner_membership
  after insert on public.business_profiles
  for each row execute function public.create_owner_membership();
