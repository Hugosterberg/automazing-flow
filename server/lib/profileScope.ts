/**
 * Tenant (business profile) scoping for token-store-backed live endpoints.
 *
 * DB-backed data is isolated by Postgres RLS on `business_profile_id`, but the
 * provider-live endpoints (marketing campaigns, unified inbox, unread counts)
 * fan out over the OAuth token store, which is keyed by account id and only
 * carries the owning user. Each stored account is tagged with `profileId` (the
 * business_profile_id set at OAuth connect), so these helpers let those routes
 * additionally narrow to the caller's *active* profile — otherwise one user's
 * profiles would see each other's ad accounts, mailboxes and DMs.
 */

/** A stored token account, as far as profile scoping cares. */
export type ProfileScopedAccount = Record<string, unknown>;

/**
 * Active business-profile id from a request's query (`?business_profile_id=` or
 * the short `?bp=`). "default"/empty → null, meaning no tenant scope was
 * requested and the endpoint falls back to user-wide behaviour.
 */
export function readRequestBusinessProfileId(req: {
  query?: Record<string, unknown>;
}): string | null {
  const raw = req?.query?.business_profile_id ?? req?.query?.bp ?? "";
  const normalized = String(raw || "").trim();
  if (!normalized || normalized === "default") return null;
  return normalized;
}

/**
 * Whether a stored token account belongs to the active business profile.
 *
 * - No active profile requested → user scope (every owned account).
 * - Account tagged with a profileId → must match exactly.
 * - Account with no profileId → rejected when a profile scope is requested.
 *   Legacy/unassigned tokens must not bleed into every profile.
 */
export function accountInBusinessProfile(
  stored: ProfileScopedAccount | null | undefined,
  businessProfileId: string | null,
): boolean {
  if (!businessProfileId) return true;
  const pid = String((stored && stored.profileId) ?? "").trim();
  return pid === businessProfileId;
}
