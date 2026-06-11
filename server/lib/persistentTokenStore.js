/**
 * OAuth token + connection metadata: Supabase (durable) with file+Map fallback (local dev).
 */

import fs from "fs";

function rowUserId(payload) {
  if (!payload || typeof payload !== "object") return "";
  const u = payload.ownerUserId;
  return u != null && u !== "" ? String(u) : "";
}

/**
 * @param {{
 *   supabaseAdmin: import("@supabase/supabase-js").SupabaseClient | null,
 *   filePath: string,
 *   normalizeStoredAccount: (stored: unknown) => Record<string, unknown> | undefined,
 * }} opts
 */
export function createPersistentTokenStore({ supabaseAdmin, filePath, normalizeStoredAccount }) {

  const memory = new Map();

  function loadFileIntoMemory() {
    try {
      if (!filePath || !fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, "utf8");
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) return;
      for (const [k, v] of entries) {
        const n = normalizeStoredAccount(v);
        if (k != null && n) memory.set(String(k), n);
      }
      console.log(`[tokenStore] Loaded ${memory.size} account(s) from file fallback`);
    } catch (e) {
      console.warn("[tokenStore] Could not read file store:", e?.message || e);
    }
  }

  function saveFileFromMemory() {
    if (!filePath || supabaseAdmin) return;
    try {
      fs.writeFileSync(filePath, JSON.stringify([...memory.entries()]), "utf8");
    } catch (e) {
      console.warn("[tokenStore] Could not save file store:", e?.message || e);
    }
  }

  if (!supabaseAdmin) {
    loadFileIntoMemory();
  }

  return {
    usesDatabase: Boolean(supabaseAdmin),

    /** One-shot: migrate empty DB from tokens.json; safe to call on every cold start. */
    async init() {
      if (!supabaseAdmin || !filePath || !fs.existsSync(filePath)) return;
      const { count, error: countErr } = await supabaseAdmin
        .from("oauth_token_entries")
        .select("*", { count: "exact", head: true });
      if (countErr) {
        console.warn("[tokenStore] init count check:", countErr.message);
        return;
      }
      if ((count ?? 0) > 0) return;

      let raw;
      try {
        raw = fs.readFileSync(filePath, "utf8");
      } catch {
        return;
      }
      let entries;
      try {
        entries = JSON.parse(raw);
      } catch {
        return;
      }
      if (!Array.isArray(entries) || entries.length === 0) return;

      const rows = [];
      for (const [k, v] of entries) {
        const n = normalizeStoredAccount(v);
        if (k == null || !n) continue;
        const account_id = String(k);
        rows.push({
          account_id,
          user_id: rowUserId(n),
          payload: n,
          updated_at: new Date().toISOString(),
        });
      }
      if (rows.length === 0) return;

      const { error } = await supabaseAdmin.from("oauth_token_entries").upsert(rows, { onConflict: "account_id" });
      if (error) {
        console.warn("[tokenStore] migrate from file failed:", error.message);
        return;
      }
      console.log(`[tokenStore] Migrated ${rows.length} account(s) from file to Supabase`);
    },

    /** @param {string} accountId */
    async get(accountId) {
      const id = String(accountId);
      if (!supabaseAdmin) {
        const v = memory.get(id);
        return v ? normalizeStoredAccount(v) : undefined;
      }
      const { data, error } = await supabaseAdmin
        .from("oauth_token_entries")
        .select("payload")
        .eq("account_id", id)
        .maybeSingle();
      if (error) {
        console.error(`[tokenStore] get ${id}:`, error.message);
        return undefined;
      }
      if (!data?.payload) return undefined;
      return normalizeStoredAccount(data.payload);
    },

    /**
     * @param {string} accountId
     * @param {Record<string, unknown>} value
     */
    async set(accountId, value) {
      const id = String(accountId);
      const normalized = normalizeStoredAccount(value) || value;
      if (!supabaseAdmin) {
        memory.set(id, normalized);
        saveFileFromMemory();
        return;
      }
      const { error } = await supabaseAdmin.from("oauth_token_entries").upsert(
        {
          account_id: id,
          user_id: rowUserId(normalized),
          payload: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      );
      // A failed write means a refreshed token may be lost on this instance —
      // include the account id so the affected connection can be identified.
      if (error) console.error(`[tokenStore] set ${id} failed (token update may be lost):`, error.message);
    },

    /** @param {string} accountId */
    async delete(accountId) {
      const id = String(accountId);
      if (!supabaseAdmin) {
        const ok = memory.delete(id);
        saveFileFromMemory();
        return ok;
      }
      const { error } = await supabaseAdmin.from("oauth_token_entries").delete().eq("account_id", id);
      if (error) console.error(`[tokenStore] delete ${id}:`, error.message);
      return true;
    },

    /** @returns {Promise<Array<[string, Record<string, unknown>]>>} */
    async entries() {
      if (!supabaseAdmin) {
        return [...memory.entries()].map(([k, v]) => [k, normalizeStoredAccount(v) || v]);
      }
      const { data, error } = await supabaseAdmin.from("oauth_token_entries").select("account_id, payload");
      if (error) {
        console.error("[tokenStore] entries:", error.message);
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map((r) => {
          const pl = normalizeStoredAccount(r.payload) || r.payload;
          return r.account_id && pl ? [String(r.account_id), pl] : null;
        })
        .filter(Boolean);
    },
  };
}
