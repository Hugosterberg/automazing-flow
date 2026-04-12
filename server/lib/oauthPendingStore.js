/**
 * OAuth CSRF / PKCE pending state: shared store for serverless (Supabase) or in-memory fallback (local dev).
 */

const DEFAULT_PENDING_TTL_MS = 30 * 60 * 1000;
/** In-memory fallback: drop stale rows so long dev sessions do not grow the Map forever */
const MEMORY_PENDING_MAX_AGE_MS = DEFAULT_PENDING_TTL_MS + 15 * 60 * 1000;

function isZernioRecoverablePlatform(platform) {
  return (
    platform === "facebook" ||
    platform === "google_business" ||
    platform === "whatsapp" ||
    platform === "google_calendar" ||
    platform === "outlook_calendar" ||
    platform === "google_reviews" ||
    platform === "tripadvisor"
  );
}

function filterZernioCandidates(entries, callbackUserIdStr) {
  const now = Date.now();
  const recentWindowMs = 20 * 60 * 1000;
  return entries.filter(([, value]) => {
    if (!value || typeof value !== "object") return false;
    if (!isZernioRecoverablePlatform(value.platform)) return false;
    const createdAt = Number(value.createdAt || 0);
    if (!createdAt || now - createdAt > recentWindowMs) return false;
    if (!callbackUserIdStr) return true;
    const pendingUserId = String(value.userId || "");
    const sameUser = pendingUserId === callbackUserIdStr;
    const localToLocalMismatch =
      pendingUserId.startsWith("local_") && callbackUserIdStr.startsWith("local_");
    return sameUser || localToLocalMismatch;
  });
}

/**
 * @param {{ supabaseAdmin: import("@supabase/supabase-js").SupabaseClient | null, fallbackMap?: Map<string, unknown> }} opts
 */
export function createOAuthPendingStore({ supabaseAdmin, fallbackMap }) {
  const useDb = Boolean(supabaseAdmin);
  const map = fallbackMap || new Map();

  return {
    /**
     * @param {string} state
     * @param {Record<string, unknown>} value
     * @param {number} [ttlMs]
     */
    async set(state, value, ttlMs = DEFAULT_PENDING_TTL_MS) {
      const s = String(state);
      if (!useDb) {
        await this.deleteExpired();
        map.set(s, value);
        return;
      }
      const expires_at = new Date(Date.now() + ttlMs).toISOString();
      const { error } = await supabaseAdmin.from("oauth_pending_states").upsert(
        { state: s, payload: value, expires_at },
        { onConflict: "state" }
      );
      if (error) console.error("[oauthPendingStore] set:", error.message);
    },

    /** @param {string} state */
    async get(state) {
      if (!state) return null;
      const s = String(state);
      if (!useDb) {
        const v = map.get(s) ?? null;
        if (v && typeof v === "object") {
          const createdAt = Number(v.createdAt || 0);
          if (createdAt && Date.now() - createdAt > MEMORY_PENDING_MAX_AGE_MS) {
            map.delete(s);
            return null;
          }
        }
        return v;
      }
      const { data, error } = await supabaseAdmin
        .from("oauth_pending_states")
        .select("payload, expires_at")
        .eq("state", s)
        .maybeSingle();
      if (error) {
        console.error("[oauthPendingStore] get:", error.message);
        return null;
      }
      if (!data) return null;
      if (new Date(data.expires_at) < new Date()) {
        await supabaseAdmin.from("oauth_pending_states").delete().eq("state", s);
        return null;
      }
      return data.payload;
    },

    /** @param {string} state */
    async delete(state) {
      if (!state) return;
      const s = String(state);
      if (!useDb) {
        map.delete(s);
        return;
      }
      await supabaseAdmin.from("oauth_pending_states").delete().eq("state", s);
    },

    /**
     * When Zernio drops/changes `state` on redirect, recover the latest matching pending row for this user.
     * @param {string} [callbackUserIdStr]
     * @returns {Promise<Array<[string, Record<string, unknown>]>>}
     */
    async listZernioRecentForUser(callbackUserIdStr) {
      if (!useDb) {
        return filterZernioCandidates(Array.from(map.entries()), callbackUserIdStr);
      }
      const { data, error } = await supabaseAdmin
        .from("oauth_pending_states")
        .select("state, payload, expires_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("[oauthPendingStore] listZernioRecentForUser:", error.message);
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      const pairs = rows.map((row) => [row.state, row.payload]).filter(([st, pl]) => st && pl);
      return filterZernioCandidates(pairs, callbackUserIdStr);
    },

    /**
     * Remove expired OAuth state rows (Supabase) or stale in-memory entries (local fallback).
     * @returns {Promise<{ removed: number }>}
     */
    async deleteExpired() {
      if (!useDb) {
        const now = Date.now();
        let removed = 0;
        for (const [k, v] of [...map.entries()]) {
          const createdAt = v && typeof v === "object" ? Number(v.createdAt || 0) : 0;
          if (createdAt && now - createdAt > MEMORY_PENDING_MAX_AGE_MS) {
            map.delete(k);
            removed += 1;
          }
        }
        return { removed };
      }
      const { data, error } = await supabaseAdmin
        .from("oauth_pending_states")
        .delete()
        .lt("expires_at", new Date().toISOString())
        .select("state");
      if (error) {
        console.error("[oauthPendingStore] deleteExpired:", error.message);
        return { removed: 0 };
      }
      const n = Array.isArray(data) ? data.length : 0;
      if (n > 0) console.log(`[oauthPendingStore] deleteExpired: removed ${n} row(s)`);
      return { removed: n };
    },
  };
}
