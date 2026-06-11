/**
 * /api/team/* — team membership management for a business profile.
 *
 * Routes:
 *   GET  /api/team/members           List members for the active business profile.
 *   POST /api/team/invite            Invite a user by email (creates pending membership).
 *   DELETE /api/team/members/:userId Remove a member.
 */

interface RegisterTeamRoutesDeps {
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  supabaseAdmin: unknown | null;
  getSessionUserId: (req: unknown) => string | null;
}

export function registerTeamRoutes(app, { requireMembership, supabaseAdmin, getSessionUserId }: RegisterTeamRoutesDeps) {
  const sb = () => supabaseAdmin as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
      };
      insert: (row: unknown) => Promise<{ error: { message?: string } | null }>;
      delete: () => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message?: string } | null }>;
        };
      };
      upsert: (row: unknown, opts?: unknown) => Promise<{ error: { message?: string } | null }>;
    };
    auth: {
      admin: {
        listUsers: () => Promise<{ data: { users: { id: string; email?: string; user_metadata?: Record<string, unknown> }[] }; error: unknown }>;
        inviteUserByEmail: (email: string, opts?: unknown) => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };

  // GET /api/team/members — list members with their roles and email
  app.get("/api/team/members", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");

    try {
      // 1. Fetch memberships for this business profile
      const { data: memberships, error: membErr } = await sb()
        .from("memberships")
        .select("user_id,role,invited_email,created_at")
        .eq("business_profile_id", businessProfileId);

      if (membErr) return res.status(500).json({ error: membErr.message });

      // 2. Fetch all auth users (admin) to resolve emails for those with user_id
      const { data: { users }, error: usersErr } = await sb().auth.admin.listUsers();
      if (usersErr) {
        // Don't fail hard — return memberships without resolved emails
        return res.json({ members: (memberships ?? []).map((m: Record<string, unknown>) => ({ ...m, email: m.invited_email ?? null, displayName: null })) });
      }

      const userMap = new Map(users.map((u) => [u.id, u]));

      const members = (memberships ?? []).map((m: Record<string, unknown>) => {
        const authUser = userMap.get(m.user_id as string);
        return {
          userId: m.user_id,
          role: m.role,
          invitedEmail: m.invited_email ?? null,
          email: authUser?.email ?? m.invited_email ?? null,
          displayName: (authUser?.user_metadata?.full_name as string | undefined) ?? null,
          createdAt: m.created_at,
        };
      });

      return res.json({ members });
    } catch (e) {
      console.error("[team/members] unexpected:", e);
      return res.status(500).json({ error: "list_members_failed" });
    }
  });

  // POST /api/team/invite — invite by email, create pending membership.
  // Only owners/admins may invite — otherwise a viewer could escalate by
  // inviting their own second account as admin.
  app.post("/api/team/invite", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    const inviterRole = String((req as { membershipRole?: string }).membershipRole || "");
    if (!["owner", "admin"].includes(inviterRole)) {
      return res.status(403).json({ error: "insufficient_role" });
    }

    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    // The memberships check constraint allows owner/admin/editor/viewer.
    // "member" is a legacy alias from older UI builds — map it to editor
    // instead of letting Postgres reject the row with a 500.
    const rawRole = String((req as { body?: Record<string, unknown> }).body?.role || "editor");
    const role = rawRole === "member" ? "editor" : rawRole;
    const email = String((req as { body?: Record<string, unknown> }).body?.email || "").trim().toLowerCase();

    if (!email) return res.status(400).json({ error: "missing_email" });
    if (!["admin", "editor", "viewer"].includes(role)) return res.status(400).json({ error: "invalid_role" });

    try {
      // Try to find if the user already has an account
      const { data: { users } } = await sb().auth.admin.listUsers();
      const existing = users.find((u) => u.email?.toLowerCase() === email);

      if (existing) {
        // User exists — add them directly to memberships
        const { error: upsertErr } = await sb()
          .from("memberships")
          .upsert(
            { business_profile_id: businessProfileId, user_id: existing.id, role, invited_email: email },
            { onConflict: "business_profile_id,user_id" }
          );
        if (upsertErr) return res.status(500).json({ error: upsertErr.message });
        return res.json({ ok: true, invited: true, hadAccount: true });
      }

      // User doesn't exist — send Supabase invite
      const { error: inviteErr } = await sb().auth.admin.inviteUserByEmail(email, {
        data: { invited_to_business_profile: businessProfileId, invited_role: role },
      });
      if (inviteErr) return res.status(500).json({ error: inviteErr.message });

      // Also create a pending membership row (no user_id yet, just email)
      // We use the invited_email column for matching when they accept
      // Use upsert with a placeholder user_id — real ID assigned when they accept
      // Instead: store pending invite in a separate pass via invited_email only
      // The actual membership row will be created when they sign in and we detect the metadata
      return res.json({ ok: true, invited: true, hadAccount: false });
    } catch (e) {
      console.error("[team/invite] unexpected:", e);
      return res.status(500).json({ error: "invite_failed" });
    }
  });

  // DELETE /api/team/members/:userId — remove a member (owner/admin only)
  app.delete("/api/team/members/:userId", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    const membershipRole = String((req as { membershipRole?: string }).membershipRole || "");
    if (!["owner", "admin"].includes(membershipRole)) {
      return res.status(403).json({ error: "insufficient_role" });
    }

    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    const targetUserId = String((req as { params?: { userId?: string } }).params?.userId || "").trim();
    const currentUserId = getSessionUserId(req);

    if (!targetUserId) return res.status(400).json({ error: "missing_user_id" });
    if (targetUserId === currentUserId) return res.status(400).json({ error: "cannot_remove_self" });

    try {
      // The owner can never be removed — otherwise an admin could lock the
      // owner out of their own business profile.
      const { data: memberships, error: lookupErr } = await sb()
        .from("memberships")
        .select("user_id,role")
        .eq("business_profile_id", businessProfileId);
      if (lookupErr) return res.status(500).json({ error: lookupErr.message });
      const target = (memberships ?? []).find(
        (m) => String((m as Record<string, unknown>).user_id) === targetUserId
      ) as Record<string, unknown> | undefined;
      if (!target) return res.status(404).json({ error: "member_not_found" });
      if (String(target.role) === "owner") {
        return res.status(403).json({ error: "cannot_remove_owner" });
      }

      const { error } = await sb()
        .from("memberships")
        .delete()
        .eq("business_profile_id", businessProfileId)
        .eq("user_id", targetUserId);

      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[team/remove] unexpected:", e);
      return res.status(500).json({ error: "remove_failed" });
    }
  });
}
