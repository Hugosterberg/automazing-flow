/**
 * Express middleware factory: enforce that the authenticated user is a member
 * of the business profile referenced in the request (query / body / params).
 *
 * Attaches `req.businessProfileId` and `req.membershipRole` on success.
 *
 * Dev-time fallbacks:
 *   - Local-mode user ids (prefix `local_`) bypass the DB check and pass through.
 *     Multi-tenancy enforcement relies on RLS in cloud mode.
 *   - If supabaseServiceClient is not configured the middleware fails closed
 *     (503) except for local-mode users.
 *
 * This is one of two tenant-scoping mechanisms in the app, by design, not
 * duplication: this one gates routes backed by Postgres/RLS (`memberships`
 * rows). Routes that instead fan out over the OAuth token store (marketing
 * campaigns, unified inbox, unread counts) use `server/lib/profileScope.ts`
 * to narrow to the active profile, because token-store accounts aren't rows
 * in a membership-checked table. Adding a new tenant-scoped route: use this
 * middleware if it reads/writes Supabase tables; use profileScope helpers if
 * it reads live provider data from the token store instead.
 */
export function createRequireMembership({ supabaseServiceClient, getSessionUserId }) {
  return async function requireMembership(req, res, next) {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const businessProfileId = String(
      req.query?.business_profile_id ||
        req.body?.business_profile_id ||
        req.params?.businessProfileId ||
        ""
    ).trim();

    if (!businessProfileId) {
      return res.status(400).json({ error: "missing_business_profile_id" });
    }

    // Local-dev users don't have a row in auth.users; skip DB check.
    if (String(userId).startsWith("local_")) {
      req.businessProfileId = businessProfileId;
      req.membershipRole = "owner";
      return next();
    }

    if (!supabaseServiceClient) {
      return res
        .status(503)
        .json({ error: "supabase_service_role_not_configured" });
    }

    try {
      const { data, error } = await supabaseServiceClient
        .from("memberships")
        .select("role")
        .eq("user_id", userId)
        .eq("business_profile_id", businessProfileId)
        .maybeSingle();

      if (error) {
        console.warn("[requireMembership] supabase error:", error.message);
        return res.status(500).json({ error: "membership_lookup_failed" });
      }

      if (!data) {
        return res.status(403).json({ error: "forbidden_business_profile" });
      }

      req.businessProfileId = businessProfileId;
      req.membershipRole = data.role;
      return next();
    } catch (e) {
      console.error("[requireMembership] unexpected:", e);
      return res.status(500).json({ error: "membership_check_failed" });
    }
  };
}
