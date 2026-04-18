-- Fix RLS infinite recursion (SQLSTATE 42P17) between business_profiles and
-- memberships introduced by 20260417120000_core_multitenant.sql.
--
-- Symptoms:
--   `select ... from business_profiles` (and any tenant-scoped read) raised
--   `infinite recursion detected in policy for relation "business_profiles"`.
--
-- Root cause:
--   * bp_select / bp_update used `exists (select 1 from memberships ...)`.
--   * mem_select_self / mem_insert_self / mem_delete_owner used
--     `exists (select 1 from business_profiles ...)`.
--   Postgres evaluates the referenced table's own RLS when policies join into
--   it, so the two policies call each other and the planner errors out.
--
-- Fix:
--   Replace the inline EXISTS with SECURITY DEFINER helpers. The helpers run
--   as the function owner and bypass RLS on the inner read, breaking the
--   cycle. `public.is_member(uuid)` and `public.is_member_with_role(uuid,
--   text[])` already exist (20260418000000_core_modules.sql). We add a
--   parallel `public.is_bp_owner(uuid)` for the memberships policies.
--
-- Behaviour is unchanged: same rows remain visible/writable to the same
-- users. Only the mechanism used to check membership/ownership changes.
--
-- Safe to run multiple times.

-- =========================================================================
-- 1. Helper: is_bp_owner(bp_id) — used by membership policies.
-- =========================================================================
create or replace function public.is_bp_owner(bp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_profiles bp
    where bp.id = bp_id
      and bp.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.is_bp_owner(uuid) from public;
grant execute on function public.is_bp_owner(uuid) to authenticated, service_role;

-- =========================================================================
-- 2. business_profiles policies — break recursion via public.is_member.
-- =========================================================================
-- Owners always see/update their own rows directly; non-owner members are
-- checked via the SECURITY DEFINER helper.

drop policy if exists bp_select on public.business_profiles;
create policy bp_select on public.business_profiles
  for select
  using (
    owner_user_id = auth.uid()
    or public.is_member(id)
  );

drop policy if exists bp_update on public.business_profiles;
create policy bp_update on public.business_profiles
  for update
  using (
    owner_user_id = auth.uid()
    or public.is_member_with_role(id, array['owner','admin'])
  );

-- bp_insert and bp_delete already key off owner_user_id = auth.uid() only,
-- so they are unaffected and left in place.

-- =========================================================================
-- 3. memberships policies — break recursion via public.is_bp_owner.
-- =========================================================================
drop policy if exists mem_select_self on public.memberships;
create policy mem_select_self on public.memberships
  for select
  using (
    user_id = auth.uid()
    or public.is_bp_owner(business_profile_id)
  );

drop policy if exists mem_insert_self on public.memberships;
create policy mem_insert_self on public.memberships
  for insert
  with check (
    user_id = auth.uid()
    or public.is_bp_owner(business_profile_id)
  );

drop policy if exists mem_delete_owner on public.memberships;
create policy mem_delete_owner on public.memberships
  for delete
  using (
    user_id = auth.uid()
    or public.is_bp_owner(business_profile_id)
  );

-- =========================================================================
-- 4. connected_accounts policies — break recursion via public.is_member.
-- =========================================================================
-- Legacy fallback (`business_profile_id is null and user_id = auth.uid()`)
-- is preserved so rows created before multi-tenancy keep working.

drop policy if exists conn_select on public.connected_accounts;
create policy conn_select on public.connected_accounts
  for select
  using (
    (business_profile_id is not null and public.is_member(business_profile_id))
    or (business_profile_id is null and user_id = auth.uid())
  );

drop policy if exists conn_insert on public.connected_accounts;
create policy conn_insert on public.connected_accounts
  for insert
  with check (
    (business_profile_id is not null and public.is_member(business_profile_id))
    or (business_profile_id is null and user_id = auth.uid())
  );

drop policy if exists conn_update on public.connected_accounts;
create policy conn_update on public.connected_accounts
  for update
  using (
    (business_profile_id is not null and public.is_member(business_profile_id))
    or (business_profile_id is null and user_id = auth.uid())
  );

drop policy if exists conn_delete on public.connected_accounts;
create policy conn_delete on public.connected_accounts
  for delete
  using (
    (business_profile_id is not null and public.is_member(business_profile_id))
    or (business_profile_id is null and user_id = auth.uid())
  );
