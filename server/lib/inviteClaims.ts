/**
 * Claim pending profile invites for a signed-in user.
 *
 * The primary claim path is the `handle_new_auth_user` Postgres trigger
 * (supabase/migrations/20260723120000_profile_invites.sql), which fires the
 * moment `auth.admin.inviteUserByEmail` creates the `auth.users` row — i.e.
 * before the invitee ever clicks the email link.
 *
 * That trigger only fires on INSERT, so it misses one case: a person invited
 * to a *second* profile while their `auth.users` row already exists (e.g.
 * they were invited once before, or they already had an account outside any
 * invite flow but teamRoutes didn't detect it in time). This helper is the
 * safety net for that case — call it whenever a session is established
 * (POST /api/auth/session) so any pending invite matching the user's email
 * gets claimed on next login at the latest.
 */
interface EqChain extends PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }> {
  eq: (col: string, val: unknown) => EqChain;
}

export async function claimPendingInvitesForUser(
  supabaseAdmin: {
    from: (table: string) => {
      select: (columns: string) => EqChain;
      upsert: (row: unknown, opts?: unknown) => Promise<{ error: { message?: string } | null }>;
      update: (row: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message?: string } | null }>;
      };
    };
  } | null,
  userId: string,
  email: string | null | undefined
): Promise<void> {
  if (!supabaseAdmin || !userId || !email) return;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;

  try {
    const { data: invites, error } = await supabaseAdmin
      .from("invites")
      .select("id,business_profile_id,role")
      .eq("status", "pending")
      .eq("email", normalizedEmail);

    if (error || !invites || invites.length === 0) return;

    for (const raw of invites) {
      const invite = raw as { id: string; business_profile_id: string; role: string };
      const { error: memErr } = await supabaseAdmin.from("memberships").upsert(
        { user_id: userId, business_profile_id: invite.business_profile_id, role: invite.role },
        { onConflict: "user_id,business_profile_id" }
      );
      if (memErr) {
        console.warn("[inviteClaims] failed to create membership for invite:", invite.id, memErr.message);
        continue;
      }
      await supabaseAdmin
        .from("invites")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id);
    }
  } catch (e) {
    // Best-effort: never block session establishment on invite claiming.
    console.warn("[inviteClaims] unexpected error:", e);
  }
}
