-- =========================================================================
-- Security fix: close a privilege-escalation hole in memberships INSERT RLS.
--
-- The previous `mem_insert_self` policy allowed an INSERT when
--   user_id = auth.uid()  OR  public.is_bp_owner(business_profile_id)
--
-- The `user_id = auth.uid()` branch let ANY authenticated user insert a
-- membership row for themselves into ANY business_profile_id — including a
-- tenant they neither own nor belong to. Using the anon key directly, an
-- attacker who learned another tenant's business_profile_id could insert
--   { user_id: <self>, business_profile_id: <victim>, role: 'owner' }
-- and immediately gain full member/owner access to that tenant's data
-- (every tenant table keys its policies off public.is_member()).
--
-- No legitimate flow needs a client-side self-insert: the owner membership is
-- created by the SECURITY DEFINER trigger `create_owner_membership` on
-- business_profile insert, and team invites are claimed by the SECURITY
-- DEFINER function `handle_new_auth_user` — both bypass RLS. The frontend
-- never inserts into memberships directly, and server-side team management
-- runs under the service role. So the self-insert branch was pure attack
-- surface.
--
-- Restrict INSERT to business-profile owners only. Owners legitimately add
-- members to their OWN profile; nobody can add themselves to someone else's.
-- =========================================================================

drop policy if exists mem_insert_self on public.memberships;

create policy mem_insert_owner on public.memberships
  for insert
  with check (public.is_bp_owner(business_profile_id));
