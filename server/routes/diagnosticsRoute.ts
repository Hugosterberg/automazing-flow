/**
 * GET /api/diagnostics — a structured health report (config presence + schema)
 * so misconfiguration and pending migrations are easy to spot. Returns only
 * booleans/status, never secret values. Requires a signed-in session.
 */

import {
  buildConfigChecks,
  runDatabaseChecks,
  snapshotFromEnv,
  summarize,
} from "../lib/diagnostics.ts";

type DiagnosticsRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  supabaseAdmin: unknown;
};

export function registerDiagnosticsRoute(app: import("express").Express, deps: DiagnosticsRouteDeps) {
  app.get("/api/diagnostics", async (req, res) => {
    if (!deps.getSessionUserId(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    try {
      const configChecks = buildConfigChecks(snapshotFromEnv());
      const dbChecks = await runDatabaseChecks(deps.supabaseAdmin);
      const report = summarize([...configChecks, ...dbChecks]);
      // 200 always — the report body carries the status; a non-200 would make
      // a healthy "warn-only" environment look like an endpoint failure.
      return res.json(report);
    } catch (e) {
      console.error("[diagnostics] failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "diagnostics_failed" });
    }
  });
}
