/**
 * POST /api/tasks/ai-assist — AI preparation of a task so a human can finish
 * it as fast as possible: summary, step plan, research notes, an optional
 * ready-to-use draft and blocking questions. Uses the tenant's OpenAI key
 * when available, otherwise a heuristic fallback so the button always works.
 *
 * Membership-guarded (the tenant's key is spent) and rate-limited per user.
 * The endpoint only generates — the client persists the result onto the task
 * via Supabase under RLS, same as every other task write.
 */

import { rateLimitMiddleware } from "../lib/rateLimit.ts";
import {
  buildTaskAssistPrompt,
  heuristicTaskAssist,
  parseTaskAssist,
  type TaskAssistContext,
} from "../ai/taskAssist.ts";

type TaskRouteDeps = {
  getSessionUserId: (req: { headers?: { cookie?: string } }) => string | null;
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  secretResolver?: {
    resolve: (businessProfileId: string | null | undefined, key: string) => Promise<string | null>;
  };
};

function cleanStrings(raw: unknown, max: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => String(s ?? "").trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, max);
}

export function registerTaskRoutes(app: import("express").Express, deps: TaskRouteDeps) {
  const { getSessionUserId, requireMembership } = deps;
  const limitAssist = rateLimitMiddleware(
    "tasks:ai-assist",
    (req) => getSessionUserId(req),
    10,
    60_000
  );

  app.post("/api/tasks/ai-assist", requireMembership, async (req, res) => {
    if (!limitAssist(req, res)) return;

    const body = (req.body ?? {}) as {
      business_profile_id?: string;
      title?: string;
      description?: string;
      priority?: string;
      dueAt?: string;
      checklist?: unknown;
      comments?: unknown;
      businessName?: string;
      businessDescription?: string;
      location?: string;
    };

    const title = String(body.title || "").trim().slice(0, 300);
    if (!title) {
      return res.status(400).json({ error: "missing_title", message: "Task title is required." });
    }

    const ctx: TaskAssistContext = {
      title,
      description: String(body.description || "").slice(0, 2000),
      priority: String(body.priority || "").slice(0, 20),
      dueAt: String(body.dueAt || "").slice(0, 40),
      checklist: cleanStrings(body.checklist, 20, 200),
      comments: cleanStrings(body.comments, 10, 500),
      businessName: String(body.businessName || "").slice(0, 200),
      businessDescription: String(body.businessDescription || "").slice(0, 1000),
      location: String(body.location || "").slice(0, 200),
    };

    const openaiKey = String(
      (deps.secretResolver
        ? await deps.secretResolver.resolve(body.business_profile_id, "OPENAI_API_KEY")
        : process.env.OPENAI_API_KEY) || ""
    ).trim();
    if (!openaiKey) {
      return res.json({ result: heuristicTaskAssist(ctx), source: "heuristic" });
    }

    try {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildTaskAssistPrompt(ctx) }],
          temperature: 0.4,
          max_tokens: 1400,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!aiRes.ok) {
        const detail = (await aiRes.text().catch(() => "")).slice(0, 300);
        console.warn("[tasks/ai-assist] OpenAI request failed:", aiRes.status, detail);
        return res.json({ result: heuristicTaskAssist(ctx), source: "heuristic" });
      }
      const aiData = (await aiRes.json().catch(() => ({}))) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = aiData?.choices?.[0]?.message?.content ?? "{}";
      const result = parseTaskAssist(content);
      if (!result) {
        return res.json({ result: heuristicTaskAssist(ctx), source: "heuristic" });
      }
      return res.json({ result, source: "ai" });
    } catch (error) {
      console.warn(
        "[tasks/ai-assist] Falling back to heuristic:",
        error instanceof Error ? error.message : error
      );
      return res.json({ result: heuristicTaskAssist(ctx), source: "heuristic" });
    }
  });
}
