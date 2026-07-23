-- Real pending-invite tracking for team/profile access.
--
-- POST /api/team/invite already sent a Supabase invite email and stashed
-- { invited_to_business_profile, invited_role } in the invitee's user
-- metadata, claimed on signup by handle_new_auth_user() (see
-- 20260611120000_claim_team_invites.sql). That works for exactly one
-- outstanding invite per person and is invisible until accepted: the app
-- code also referenced a public.memberships.invited_email column to show
-- pending invites in the UI, but that column was never migrated in, so
-- GET /api/team/members / POST /api/team/invite would error against a real
-- schema and "invite a not-yet-registered person" silently did nothing
-- beyond sending the email.
--
-- This migration adds a first-class public.invites table:
--   * one row per (business_profile_id, email), so re-inviting the same
--     person just updates their row instead of erroring;
--   * a real 'pending' | 'accepted' | 'revoked' status so the UI can list,
--     resend, and cancel outstanding invites;
--   * claimed by email match (not just user metadata), so a person invited
--     to several profiles before they ever sign up joins all of them, not
--     just the last one.
--
-- Builds on:
--   * 20260417120000_core_multitenant.sql (business_profiles, memberships)
--   * 20260418000000_core_modules.sql     (is_member_with_role helper)
--   * 20260611120000_claim_team_invites.sql (handle_new_auth_user, replaced
--     here to additionally claim from public.invites; the metadata path is
--     kept so invite emails already sent before this migration still work)
--
-- Safe to run multiple times.

-- =========================================================================
-- 1. invites table
-- =========================================================================
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (business_profile_id, email)
);

comment on table public.invites is
  'Pending/accepted/revoked invitations granting a user access to a business_profile. One row per (profile, email); re-inviting updates the existing row. Claimed into public.memberships by handle_new_auth_user() on signup and by the /api/auth/session claim safety-net for already-registered invitees.';

create index if not exists invites_bp_status_idx
  on public.invites(business_profile_id, status);
create index if not exists invites_pending_email_idx
  on public.invites(email)
  where status = 'pending';

-- =========================================================================
-- 2. RLS — only owner/admin members of the profile may see or manage its
--    invites. In practice all app access goes through server routes using
--    the service role (which bypasses RLS), but every tenant table in this
--    project carries RLS as defense in depth, so this one does too.
-- =========================================================================
alter table public.invites enable row level security;

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (
    public.is_member_with_role(business_profile_id, array['owner', 'admin'])
  );

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (
    public.is_member_with_role(business_profile_id, array['owner', 'admin'])
  );

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update using (
    public.is_member_with_role(business_profile_id, array['owner', 'admin'])
  );

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete using (
    public.is_member_with_role(business_profile_id, array['owner', 'admin'])
  );

-- =========================================================================
-- 3. handle_new_auth_user(): claim pending invites by email match, in
--    addition to the existing metadata-based claim (kept for invite emails
--    sent before this migration).
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
  invited_bp uuid;
  invited_role text;
  pending_invite record;
begin
  insert into public.user_profiles (id, display_name, avatar_url)
  values (new.id, display, avatar)
  on conflict (id) do nothing;

  -- Legacy claim path: invites sent before this migration only stashed a
  -- single (business_profile, role) pair in the invitee's user metadata.
  -- Keep honouring it for invite emails already in flight.
  begin
    invited_bp := nullif(meta ->> 'invited_to_business_profile', '')::uuid;
  exception when others then
    invited_bp := null;
  end;
  if invited_bp is not null then
    invited_role := case coalesce(meta ->> 'invited_role', 'editor')
      when 'admin' then 'admin'
      when 'viewer' then 'viewer'
      else 'editor'
    end;
    insert into public.memberships (user_id, business_profile_id, role)
    select new.id, bp.id, invited_role
    from public.business_profiles bp
    where bp.id = invited_bp
    on conflict (user_id, business_profile_id) do nothing;
  end if;

  -- Current claim path: match every pending public.invites row by email.
  -- Unlike the metadata path, this supports someone being invited to
  -- several profiles before they ever create an account.
  if new.email is not null then
    for pending_invite in
      select * from public.invites
      where status = 'pending'
        and email = lower(new.email)
    loop
      insert into public.memberships (user_id, business_profile_id, role)
      values (new.id, pending_invite.business_profile_id, pending_invite.role)
      on conflict (user_id, business_profile_id) do nothing;

      update public.invites
      set status = 'accepted', accepted_at = now()
      where id = pending_invite.id;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;
