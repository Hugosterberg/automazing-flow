-- Auto-bootstrap a public.user_profiles row whenever a new auth user is
-- created, plus a one-shot backfill for users that signed up before this
-- migration landed.
--
-- Builds on:
--   * 20260418000000_core_modules.sql  (defines public.user_profiles)
--   * 20260419000000_schema_tidy_ups.sql (adds default_business_profile_id)
--
-- Design notes:
-- * The trigger is SECURITY DEFINER so it can insert into public.user_profiles
--   regardless of RLS — auth.users INSERTs run as the supabase_auth_admin role,
--   not as the user being created, so RLS using auth.uid() wouldn't match.
-- * We keep the function idempotent with ON CONFLICT DO NOTHING: re-running
--   (e.g. if auth.users fires multiple triggers for the same row) is safe.
-- * raw_user_meta_data is the JSONB field Supabase populates from OAuth
--   provider claims. We pull the common display-name keys opportunistically;
--   anything missing is fine — the user can fill it in later from settings.
--
-- Safe to run multiple times.

-- =========================================================================
-- 1. Trigger function: public.handle_new_auth_user
-- =========================================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  display text := nullif(
    coalesce(
      meta ->> 'full_name',
      meta ->> 'name',
      meta ->> 'display_name'
    ),
    ''
  );
  avatar text := nullif(meta ->> 'avatar_url', '');
begin
  insert into public.user_profiles (id, display_name, avatar_url)
  values (new.id, display, avatar)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Lock down direct execution: only the trigger itself (as postgres owner)
-- or service_role should invoke this. Authenticated users have no reason to.
revoke all on function public.handle_new_auth_user() from public;

-- =========================================================================
-- 2. Trigger on auth.users
-- =========================================================================
-- AFTER INSERT so the auth user is definitely persisted before we derive
-- the profile row from it. We don't fire on UPDATE — user metadata changes
-- (e.g. new avatar from Google) should flow through a dedicated sync path,
-- not silently overwrite edits the user made in their profile settings.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =========================================================================
-- 3. Backfill: create user_profiles rows for existing auth users
-- =========================================================================
-- Idempotent. Uses the same metadata-extraction rules as the trigger so
-- users signed up before this migration get the same treatment as new ones.
insert into public.user_profiles (id, display_name, avatar_url)
select
  u.id,
  nullif(
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      u.raw_user_meta_data ->> 'display_name'
    ),
    ''
  ) as display_name,
  nullif(u.raw_user_meta_data ->> 'avatar_url', '') as avatar_url
from auth.users u
where not exists (
  select 1 from public.user_profiles p where p.id = u.id
);
