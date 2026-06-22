/**
 * Stable account identity for OAuth token entries.
 *
 * Reconnecting a platform must overwrite the existing token entry, not mint a
 * new one — random per-connect ids were how the same mailbox/page piled up as
 * duplicates (each one fetched, synced and rendered separately). Some
 * callbacks already used `<prefix>_<sha1(identity)>`; this module makes that
 * the shared convention and adds pruning of legacy duplicates that still sit
 * in the token store under old random ids.
 */

import crypto from "crypto";

export function deterministicAccountId(prefix: string, identity: string): string {
  const hash = crypto.createHash("sha1").update(String(identity)).digest("hex").slice(0, 20);
  return `${prefix}_${hash}`;
}

export function profileScopedAccountId(
  prefix: string,
  externalIdentity: string,
  profileId: string | null | undefined
): string {
  return deterministicAccountId(prefix, `${externalIdentity}:${String(profileId || "").trim()}`);
}

type PruneTokenStore = {
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
  delete: (accountId: string) => Promise<unknown>;
};

/**
 * Deletes other token entries that provably point at the SAME external
 * account (same platform + a matching provider identity field), keeping
 * `keepAccountId`. Conservative by design: entries that carry none of the
 * matcher values are left alone, so a second mailbox/page is never touched.
 *
 * Never throws — pruning is cleanup, not a precondition for the OAuth flow.
 */
export async function pruneDuplicateAccountEntries(options: {
  tokenStore: PruneTokenStore;
  platform: string;
  keepAccountId: string;
  /** Provider identity fields to compare, e.g. [{ key: "username", value: "x@y.se" }]. */
  matchers: Array<{ key: string; value: string | null | undefined }>;
  /**
   * When set, only entries bound to this profile id (or to none) are pruned.
   * Used by Zernio flows where the same channel may legitimately be linked to
   * several business profiles — those sibling links must survive.
   */
  sameProfileId?: string | null;
}): Promise<number> {
  const { tokenStore, platform, keepAccountId } = options;
  const matchers = options.matchers
    .map((m) => ({ key: m.key, value: String(m.value ?? "").trim().toLowerCase() }))
    .filter((m) => m.value.length > 0);
  if (matchers.length === 0) return 0;

  let removed = 0;
  try {
    const entries = await tokenStore.entries();
    for (const [accountId, stored] of entries) {
      if (!stored || typeof stored !== "object") continue;
      if (accountId === keepAccountId) continue;
      if (String(stored.platform || "") !== platform) continue;
      const isSameExternalAccount = matchers.some(
        (m) => String(stored[m.key] ?? "").trim().toLowerCase() === m.value
      );
      if (!isSameExternalAccount) continue;
      if (options.sameProfileId !== undefined) {
        const entryProfileId = String(stored.profileId ?? "").trim();
        if (entryProfileId && entryProfileId !== String(options.sameProfileId ?? "").trim()) continue;
      }
      await tokenStore.delete(accountId);
      removed += 1;
    }
    if (removed > 0) {
      console.log(
        `[accounts] Pruned ${removed} duplicate ${platform} token entr${removed === 1 ? "y" : "ies"} (kept ${keepAccountId})`
      );
    }
  } catch (e) {
    console.warn("[accounts] Duplicate prune failed:", e instanceof Error ? e.message : e);
  }
  return removed;
}
