/**
 * /api/team/* — team membership management for a business profile.
 *
 * Routes:
 *   GET    /api/team/members                List active members + pending invites.
 *   POST   /api/team/invite                  Invite a user by email (creates a pending invite row).
 *   POST   /api/team/invite/:inviteId/resend Resend the invite email for a still-pending invite.
 *   DELETE /api/team/invite/:inviteId        Revoke a pending invite.
 *   DELETE /api/team/members/:userId         Remove an active member.
 *
 * Pending (not-yet-registered) invites live in public.invites, not
 * public.memberships — a membership row only ever represents someone who
 * actually has access today. See
 * supabase/migrations/20260723120000_profile_invites.sql for the schema and
 * the claim trigger that turns an invite into a membership on signup.
 */

interface RegisterTeamRoutesDeps {
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  supabaseAdmin: unknown | null;
  getSessionUserId: (req: unknown) => string | null;
}

type SbError = { message?: string } | null;
type Row = Record<string, unknown>;

// Supabase-js's real query builder is a thenable (awaiting it runs the
// query) that also exposes chainable filters — `.eq().eq().maybeSingle()`
// and `.eq().eq()` (then awaited directly) are both valid call shapes used
// below. Modelled as PromiseLike so `await` and `.then` work without a
// terminal method call.
interface EqChain extends PromiseLike<{ data: Row[] | null; error: SbError }> {
  eq: (col: string, val: unknown) => EqChain;
  maybeSingle: () => Promise<{ data: Row | null; error: SbError }>;
}

export function registerTeamRoutes(app, { requireMembership, supabaseAdmin, getSessionUserId }: RegisterTeamRoutesDeps) {
  const sb = () => supabaseAdmin as {
    from: (t: string) => {
      select: (c: string) => EqChain;
      insert: (row: unknown) => Promise<{ error: SbError }>;
      delete: () => { eq: (col: string, val: unknown) => EqChain };
      update: (row: unknown) => { eq: (col: string, val: unknown) => EqChain };
      upsert: (row: unknown, opts?: unknown) => Promise<{ error: SbError }>;
    };
    auth: {
      admin: {
        listUsers: () => Promise<{
          data: { users: { id: string; email?: string; user_metadata?: Record<string, unknown> }[] } | null;
          error: unknown;
        }>;
        inviteUserByEmail: (email: string, opts?: unknown) => Promise<{ data: unknown; error: SbError }>;
      };
    };
  };

  /**
   * The frontend origin to send the invitee's email link back to. Only
   * trusted when it matches the origin this very request arrived on — the
   * app and API share a domain in production (Vercel), so a mismatch means
   * a spoofed value. Mirrors the app_origin convention used by the OAuth
   * connect flows (see server/routes/oauthRoutes.ts) — falling back to
   * BASE_URL here would send invite links to the wrong host, the same bug
   * class already fixed for OAuth connects.
   */
  function safeAppOrigin(req): string | null {
    try {
      const raw = (req as { body?: Record<string, unknown> }).body?.app_origin;
      if (!raw) return null;
      const parsed = new URL(String(raw));
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

      const headers = (req as { headers?: Record<string, unknown> }).headers || {};
      const forwardedHost = String(headers["x-forwarded-host"] ?? "").split(",")[0].trim();
      const host = forwardedHost || String(headers.host ?? "").trim();
      if (!host) return null;
      const forwardedProto = String(headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
      const proto = forwardedProto || (req as { protocol?: string }).protocol || "https";
      const ownOrigin = `${proto}://${host}`;

      return parsed.origin === ownOrigin ? parsed.origin : null;
    } catch {
      return null;
    }
  }

  // GET /api/team/members — active members plus pending/revoked invites.
  app.get("/api/team/members", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");

    try {
      const [membershipsRes, invitesRes] = await Promise.all([
        sb().from("memberships").select("user_id,role,created_at").eq("business_profile_id", businessProfileId),
        sb()
          .from("invites")
          .select("id,email,role,status,invited_by,created_at,accepted_at,revoked_at")
          .eq("business_profile_id", businessProfileId),
      ]);

      if (membershipsRes.error) return res.status(500).json({ error: membershipsRes.error.message });
      if (invitesRes.error) return res.status(500).json({ error: invitesRes.error.message });

      const memberships = (membershipsRes.data ?? []) as Record<string, unknown>[];
      // Only pending invites are actionable in the UI; accepted ones are
      // represented by their resulting membership row, and revoked ones
      // have no ongoing relevance.
      const pendingInvites = ((invitesRes.data ?? []) as Record<string, unknown>[]).filter(
        (inv) => inv.status === "pending"
      );

      const { data: usersData, error: usersErr } = await sb().auth.admin.listUsers();
      if (usersErr) {
        return res.json({
          members: memberships.map((m) => ({
            userId: m.user_id,
            role: m.role,
            email: null,
            displayName: null,
            createdAt: m.created_at,
          })),
          pendingInvites: pendingInvites.map((inv) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            createdAt: inv.created_at,
          })),
        });
      }

      const userMap = new Map((usersData?.users ?? []).map((u) => [u.id, u]));

      const members = memberships.map((m) => {
        const authUser = userMap.get(m.user_id as string);
        return {
          userId: m.user_id,
          role: m.role,
          email: authUser?.email ?? null,
          displayName: (authUser?.user_metadata?.full_name as string | undefined) ?? null,
          createdAt: m.created_at,
        };
      });

      return res.json({
        members,
        pendingInvites: pendingInvites.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          createdAt: inv.created_at,
        })),
      });
    } catch (e) {
      console.error("[team/members] unexpected:", e);
      return res.status(500).json({ error: "list_members_failed" });
    }
  });

  // POST /api/team/invite — invite by email, create/refresh a pending invite.
  // Only owners/admins may invite — otherwise a viewer could escalate by
  // inviting their own second account as admin.
  app.post("/api/team/invite", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    const inviterRole = String((req as { membershipRole?: string }).membershipRole || "");
    if (!["owner", "admin"].includes(inviterRole)) {
      return res.status(403).json({ error: "insufficient_role" });
    }

    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    // The memberships/invites check constraints allow admin/editor/viewer.
    // "member" is a legacy alias from older UI builds — map it to editor
    // instead of letting Postgres reject the row with a 500.
    const rawRole = String((req as { body?: Record<string, unknown> }).body?.role || "editor");
    const role = rawRole === "member" ? "editor" : rawRole;
    const email = String((req as { body?: Record<string, unknown> }).body?.email || "").trim().toLowerCase();
    const inviterId = getSessionUserId(req);

    if (!email) return res.status(400).json({ error: "missing_email" });
    if (!["admin", "editor", "viewer"].includes(role)) return res.status(400).json({ error: "invalid_role" });

    try {
      // Try to find if the user already has an account.
      const { data: usersData } = await sb().auth.admin.listUsers();
      const existing = usersData?.users.find((u) => u.email?.toLowerCase() === email);

      if (existing) {
        // User exists — add them directly to memberships, no email needed.
        const { error: upsertErr } = await sb()
          .from("memberships")
          .upsert(
            { business_profile_id: businessProfileId, user_id: existing.id, role },
            { onConflict: "business_profile_id,user_id" }
          );
        if (upsertErr) return res.status(500).json({ error: upsertErr.message });

        // Record it in invites too (already accepted) so the access log/UI
        // history is consistent regardless of which path granted access.
        await sb()
          .from("invites")
          .upsert(
            {
              business_profile_id: businessProfileId,
              email,
              role,
              invited_by: inviterId,
              status: "accepted",
              accepted_at: new Date().toISOString(),
            },
            { onConflict: "business_profile_id,email" }
          );

        return res.json({ ok: true, invited: true, hadAccount: true });
      }

      // User doesn't exist yet — create/refresh the pending invite row
      // first, so the signup trigger (which fires the instant
      // inviteUserByEmail creates the auth.users row) can see it.
      const { error: inviteRowErr } = await sb()
        .from("invites")
        .upsert(
          { business_profile_id: businessProfileId, email, role, invited_by: inviterId, status: "pending" },
          { onConflict: "business_profile_id,email" }
        );
      if (inviteRowErr) return res.status(500).json({ error: inviteRowErr.message });

      const appOrigin = safeAppOrigin(req);
      const { error: inviteErr } = await sb().auth.admin.inviteUserByEmail(email, {
        data: { invited_to_business_profile: businessProfileId, invited_role: role },
        ...(appOrigin ? { redirectTo: `${appOrigin}/` } : {}),
      });
      if (inviteErr) return res.status(500).json({ error: inviteErr.message });

      return res.json({ ok: true, invited: true, hadAccount: false });
    } catch (e) {
      console.error("[team/invite] unexpected:", e);
      return res.status(500).json({ error: "invite_failed" });
    }
  });

  // POST /api/team/invite/:inviteId/resend — re-send the invite email.
  app.post("/api/team/invite/:inviteId/resend", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    const inviterRole = String((req as { membershipRole?: string }).membershipRole || "");
    if (!["owner", "admin"].includes(inviterRole)) {
      return res.status(403).json({ error: "insufficient_role" });
    }

    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    const inviteId = String((req as { params?: { inviteId?: string } }).params?.inviteId || "").trim();
    if (!inviteId) return res.status(400).json({ error: "missing_invite_id" });

    try {
      const { data, error } = await sb()
        .from("invites")
        .select("id,email,role,status,business_profile_id")
        .eq("id", inviteId)
        .eq("business_profile_id", businessProfileId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      const invite = data as { id: string; email: string; role: string; status: string } | null;
      if (!invite) return res.status(404).json({ error: "invite_not_found" });
      if (invite.status !== "pending") return res.status(400).json({ error: "invite_not_pending" });

      const appOrigin = safeAppOrigin(req);
      const { error: inviteErr } = await sb().auth.admin.inviteUserByEmail(invite.email, {
        data: { invited_to_business_profile: businessProfileId, invited_role: invite.role },
        ...(appOrigin ? { redirectTo: `${appOrigin}/` } : {}),
      });
      if (inviteErr) return res.status(500).json({ error: inviteErr.message });

      return res.json({ ok: true });
    } catch (e) {
      console.error("[team/invite/resend] unexpected:", e);
      return res.status(500).json({ error: "resend_failed" });
    }
  });

  // DELETE /api/team/invite/:inviteId — revoke a pending invite.
  app.delete("/api/team/invite/:inviteId", requireMembership, async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ error: "supabase_not_configured" });

    const inviterRole = String((req as { membershipRole?: string }).membershipRole || "");
    if (!["owner", "admin"].includes(inviterRole)) {
      return res.status(403).json({ error: "insufficient_role" });
    }

    const businessProfileId = String((req as { businessProfileId?: string }).businessProfileId || "");
    const inviteId = String((req as { params?: { inviteId?: string } }).params?.inviteId || "").trim();
    if (!inviteId) return res.status(400).json({ error: "missing_invite_id" });

    try {
      const { error } = await sb()
        .from("invites")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", inviteId)
        .eq("business_profile_id", businessProfileId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[team/invite/revoke] unexpected:", e);
      return res.status(500).json({ error: "revoke_failed" });
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
      const target = ((memberships ?? []) as Record<string, unknown>[]).find(
        (m) => String(m.user_id) === targetUserId
      );
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
