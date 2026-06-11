-- Claim team invites on signup.
--
-- POST /api/team/invite for a not-yet-registered email sends a Supabase
-- invite with { invited_to_business_profile, invited_role } in the user
-- metadata — but nothing ever consumed that metadata, so invited users
-- signed up into an empty workspace instead of joining the team.
--
-- This migration extends the existing auth.users insert trigger
-- (20260420000000_user_profiles_bootstrap.sql) to also create the membership
-- row from the invite metadata, and backfills users who were invited before
-- the fix landed.
--
-- Safe to run multiple times.

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
begin
  insert into public.user_profiles (id, display_name, avatar_url)
  values (new.id, display, avatar)
  on conflict (id) do nothing;

  -- Claim a pending team invite (set by POST /api/team/invite). The role is
  -- clamped to the non-owner roles the check constraint allows; "member" is a
  -- legacy alias for editor. Invalid/missing business profiles are ignored.
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

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public;

-- Backfill: users who accepted an invite before this migration landed.
insert into public.memberships (user_id, business_profile_id, role)
select
  u.id,
  bp.id,
  case coalesce(u.raw_user_meta_data ->> 'invited_role', 'editor')
    when 'admin' then 'admin'
    when 'viewer' then 'viewer'
    else 'editor'
  end
from auth.users u
join public.business_profiles bp
  on bp.id::text = u.raw_user_meta_data ->> 'invited_to_business_profile'
where u.raw_user_meta_data ->> 'invited_to_business_profile' is not null
on conflict (user_id, business_profile_id) do nothing;
