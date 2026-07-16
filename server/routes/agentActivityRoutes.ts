/**
 * Ingest CMA / agent run results into `activity_events` so they appear in
 * Activity + Daily Brief (ROADMAP v2 — wire agent output into the product).
 *
 * Auth: same `CRON_SECRET` bearer used by cron routes (agents post after a run).
 * No new tables — reuses activity_events with module "agent".
 */
import type { Express, Request, Response } from "express";
import { logActivity } from "../lib/activityLog.ts";

type AgentActivityDeps = {
  supabaseAdmin: Parameters<typeof logActivity>[0];
};

function authorized(req: Request): boolean {
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) return false;
  const header = String(req.get("authorization") || "");
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const query = typeof req.query.secret === "string" ? req.query.secret.trim() : "";
  return bearer === expected || query === expected;
}

export function registerAgentActivityRoutes(app: Express, deps: AgentActivityDeps) {
  const { supabaseAdmin } = deps;

  app.post("/api/agent-activity", async (req: Request, res: Response) => {
    if (!authorized(req)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const businessProfileId = String(body.businessProfileId || body.business_profile_id || "").trim();
    const summary = String(body.summary || "").trim();
    if (!businessProfileId || !summary) {
      return res.status(400).json({
        error: "businessProfileId and summary are required",
      });
    }

    const severityRaw = String(body.severity || "success").toLowerCase();
    const severity =
      severityRaw === "error" || severityRaw === "warning" || severityRaw === "info"
        ? severityRaw
        : "success";

    const agentName = String(body.agent || body.agentName || "agent").trim() || "agent";
    const subjectId = String(body.runId || body.subjectId || body.subject_id || agentName).trim();
    const href = typeof body.href === "string" ? body.href.trim() : "";

    await logActivity(supabaseAdmin, {
      businessProfileId,
      module: "agent",
      eventType: String(body.eventType || "agent.run.completed"),
      subjectType: "agent_run",
      subjectId,
      severity,
      summary: summary.slice(0, 500),
      payload: {
        agent: agentName,
        href: href || null,
        ...(typeof body.payload === "object" && body.payload && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : {}),
      },
    });

    return res.json({ ok: true });
  });
}
