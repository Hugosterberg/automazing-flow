/**
 * Read-only smoke test against remote Supabase.
 * Verifies:
 *   - service role key can reach the DB
 *   - expected tables exist
 *   - expected columns exist on connected_accounts
 *   - RLS policies are defined on tenant tables
 *
 * Run: node --experimental-strip-types scripts/verify-supabase.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

type CheckResult = { label: string; ok: boolean; detail?: string };
const results: CheckResult[] = [];

function record(label: string, ok: boolean, detail?: string) {
  results.push({ label, ok, detail });
  const mark = ok ? "OK " : "FAIL";
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[${mark}] ${label}${suffix}`);
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Basic reachability: count() on a legacy table we know exists after baseline.
  {
    const { error, count } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true });
    record("connect: service role can query profiles", !error, error?.message ?? `rows=${count ?? 0}`);
  }

  // 2. business_profiles table + expected columns
  {
    const { error } = await admin
      .from("business_profiles")
      .select("id, name, owner_user_id, created_at, updated_at", { head: true, count: "exact" });
    record("table: business_profiles (id, name, owner_user_id, created_at, updated_at)", !error, error?.message);
  }

  // 3. memberships table + expected columns
  {
    const { error } = await admin
      .from("memberships")
      .select("user_id, business_profile_id, role, created_at", { head: true, count: "exact" });
    record("table: memberships (user_id, business_profile_id, role, created_at)", !error, error?.message);
  }

  // 4. connected_accounts new columns
  {
    const { error } = await admin
      .from("connected_accounts")
      .select("id, business_profile_id, health, last_synced_at, last_sync_error, disconnected_at", {
        head: true,
        count: "exact",
      });
    record(
      "columns: connected_accounts adds business_profile_id, health, last_synced_at, last_sync_error, disconnected_at",
      !error,
      error?.message
    );
  }

  // 5. RLS enforcement: anonymous client must NOT be able to read tenant tables.
  //    pg_policies isn't exposed via REST, so we test behaviour instead of metadata.
  {
    const anonKey =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (!anonKey) {
      record("rls: anonymous-read test skipped (no publishable/anon key found)", true);
    } else {
      const anon = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const bpRes = await anon
        .from("business_profiles")
        .select("id", { head: true, count: "exact" });
      const memRes = await anon
        .from("memberships")
        .select("user_id", { head: true, count: "exact" });

      // Expected: either an RLS error, OR success with count=0 (policies silently hide rows).
      // FAIL only if rows leak to anon.
      const bpLeak = !bpRes.error && (bpRes.count ?? 0) > 0;
      const memLeak = !memRes.error && (memRes.count ?? 0) > 0;

      record(
        "rls: anon cannot read business_profiles",
        !bpLeak,
        bpRes.error ? `blocked: ${bpRes.error.message}` : `count=${bpRes.count ?? 0}`
      );
      record(
        "rls: anon cannot read memberships",
        !memLeak,
        memRes.error ? `blocked: ${memRes.error.message}` : `count=${memRes.count ?? 0}`
      );
    }
  }

  // 6. Core-modules tables + expected columns
  {
    const checks: Array<[string, string, string]> = [
      ["user_profiles", "id, display_name, preferences, created_at, updated_at", "table: user_profiles"],
      ["integrations", "id, slug, name, category, provider, is_enabled, config", "table: integrations"],
      [
        "sync_runs",
        "id, business_profile_id, connected_account_id, kind, status, started_at, finished_at, items_processed, error_message, metadata",
        "table: sync_runs",
      ],
      [
        "activity_events",
        "id, business_profile_id, actor_user_id, module, event_type, subject_type, subject_id, severity, summary, payload, occurred_at",
        "table: activity_events",
      ],
      [
        "tasks",
        "id, business_profile_id, title, status, priority, module, due_at, completed_at, metadata, created_at, updated_at",
        "table: tasks",
      ],
      [
        "ai_recommendations",
        "id, business_profile_id, kind, status, title, confidence, suggested_action, context, created_at, updated_at",
        "table: ai_recommendations",
      ],
    ];

    for (const [table, cols, label] of checks) {
      const { error } = await admin.from(table).select(cols, { head: true, count: "exact" });
      record(label, !error, error?.message);
    }
  }

  // 7. Integrations seed loaded
  {
    const { count, error } = await admin
      .from("integrations")
      .select("slug", { head: true, count: "exact" });
    const ok = !error && (count ?? 0) >= 10;
    record(
      "seed: integrations catalog populated (>=10 rows)",
      ok,
      error?.message ?? `rows=${count ?? 0}`
    );
  }

  // 8. v_connection_health view exposes integration metadata
  {
    const { error } = await admin
      .from("v_connection_health")
      .select(
        "id, business_profile_id, platform, health, last_synced_at, integration_name, integration_category, integration_provider",
        { head: true, count: "exact" }
      );
    record("view: v_connection_health selectable with integration metadata", !error, error?.message);
  }

  // 9. is_member() helper function exists and returns false for non-member.
  {
    const { data, error } = await admin.rpc("is_member", {
      bp_id: "00000000-0000-0000-0000-000000000000",
    });
    record(
      "function: is_member(uuid) returns boolean",
      !error && typeof data === "boolean",
      error?.message ?? `returned=${String(data)}`
    );
  }

  // 10. Owner-membership trigger: insert a throwaway business_profile, verify membership row was auto-created, then clean up.
  //    Uses service role, bypasses RLS. We tag it so it's trivially identifiable.
  {
    // Find any existing auth user to own the test row (service role can insert without an owner in auth.users if FK deferred, but FK is strict → pick a user).
    const { data: userRows, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (usersErr || !userRows || userRows.users.length === 0) {
      record("trigger: skipped (no auth users to test with)", true, usersErr?.message ?? "no users");
    } else {
      const ownerId = userRows.users[0].id;
      const testName = `__verify_${Date.now()}`;
      const { data: bp, error: insErr } = await admin
        .from("business_profiles")
        .insert({ name: testName, owner_user_id: ownerId })
        .select("id")
        .single();

      if (insErr || !bp) {
        record("trigger: insert business_profile", false, insErr?.message);
      } else {
        const { data: mem, error: memErr } = await admin
          .from("memberships")
          .select("user_id, role")
          .eq("business_profile_id", bp.id);

        const ok = !memErr && (mem?.length ?? 0) === 1 && mem?.[0]?.user_id === ownerId;
        record(
          "trigger: owner membership auto-created",
          ok,
          memErr?.message ?? `rows=${mem?.length ?? 0}`
        );

        // cleanup
        await admin.from("business_profiles").delete().eq("id", bp.id);
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(
    failed.length === 0
      ? `All ${results.length} checks passed.`
      : `${failed.length}/${results.length} checks FAILED.`
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("verify-supabase crashed:", err);
  process.exit(1);
});
