/**
 * Intelligence features built on connected MCP servers.
 *
 *   GET  /api/intelligence/pulse          — market pulse (LunarCrush): crypto
 *        sentiment for the home dashboard. Quiet by design: available:false
 *        when no provider is connected, never a hard error.
 *   POST /api/intelligence/lead-research  — research a lead/company through
 *        the tenant's connected research providers (Exa, Sprouts).
 *
 * Both resolve the tenant's own connected accounts via mcpAccess — no global
 * keys, no cross-tenant reads. Tool names differ per vendor, so tools are
 * picked by pattern and arguments are shaped from the tool's own inputSchema.
 */

import {
  findMcpAccountForProfile,
  listToolsForStored,
  callToolForStored,
  pickTool,
} from "../lib/mcpAccess.ts";
import { readRequestBusinessProfileId } from "../lib/profileScope.ts";
import type { McpToolDescriptor } from "../lib/mcpClient.ts";

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

interface IntelligenceRouteDeps {
  tokenStore: TokenStoreLike;
  getSessionUserId: (req: unknown) => string | null;
  getStoredAccountAccess: (
    stored: Record<string, unknown> | null | undefined,
    userId: string
  ) => { allowed: boolean; migrate: boolean; reason: string };
}

/**
 * The first inputSchema property whose name matches a candidate (in order).
 * Falls back to the first required property so we can still fill something.
 */
function argNameForTool(tool: McpToolDescriptor, candidates: string[]): string | null {
  const properties =
    tool.inputSchema && typeof tool.inputSchema === "object"
      ? ((tool.inputSchema as Record<string, unknown>).properties as Record<string, unknown> | undefined)
      : undefined;
  const names = properties ? Object.keys(properties) : [];
  for (const candidate of candidates) {
    const hit = names.find((n) => n.toLowerCase() === candidate);
    if (hit) return hit;
  }
  const required = (tool.inputSchema as Record<string, unknown> | undefined)?.required;
  if (Array.isArray(required) && typeof required[0] === "string") return required[0];
  return names[0] ?? null;
}

/** Cap MCP text passed back to the UI — dashboards need a summary, not a dump. */
function trimText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Per-instance response cache. Serverless instances are short-lived, so this
 * is a best-effort cost saver (LunarCrush rate limits), not a datastore.
 */
const pulseCache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const PULSE_CACHE_MS = 15 * 60 * 1000;

export function registerIntelligenceRoutes(app, deps: IntelligenceRouteDeps) {
  const { tokenStore, getSessionUserId, getStoredAccountAccess } = deps;

  app.get("/api/intelligence/pulse", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const topic = String(req.query.topic || "bitcoin").trim().toLowerCase() || "bitcoin";

    const cacheKey = `${businessProfileId || "global"}:${topic}`;
    const cached = pulseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PULSE_CACHE_MS) {
      return res.json(cached.payload);
    }

    try {
      const account = await findMcpAccountForProfile({
        tokenStore,
        businessProfileId,
        platforms: ["lunarcrush"],
      });
      if (!account) {
        return res.json({ available: false, reason: "not_connected" });
      }
      const access = getStoredAccountAccess(account, userId);
      if (!access.allowed) {
        return res.json({ available: false, reason: "not_connected" });
      }

      const toolsRes = await listToolsForStored(tokenStore, account);
      if (toolsRes.ok === false) {
        return res.json({ available: false, reason: "provider_error", message: toolsRes.message });
      }
      const tool = pickTool(toolsRes.tools, [/^topic$/i, /topic/i, /^coin/i, /sentiment/i, /search/i]);
      if (!tool) {
        return res.json({ available: false, reason: "no_matching_tool" });
      }
      const argName = argNameForTool(tool, ["topic", "symbol", "coin", "query", "q"]);
      const callRes = await callToolForStored(
        tokenStore,
        account,
        tool.name,
        argName ? { [argName]: topic } : {}
      );
      if (callRes.ok === false || callRes.isError) {
        return res.json({
          available: false,
          reason: "provider_error",
          message: callRes.ok === false ? callRes.message : trimText(callRes.text, 300),
        });
      }

      const payload = {
        available: true,
        topic,
        tool: tool.name,
        text: trimText(callRes.text, 4_000),
        fetchedAt: new Date().toISOString(),
      };
      pulseCache.set(cacheKey, { at: Date.now(), payload });
      return res.json(payload);
    } catch (err) {
      console.error("[intelligence] pulse failed:", err);
      return res.json({ available: false, reason: "provider_error" });
    }
  });

  app.post("/api/intelligence/lead-research", async (req, res) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    const businessProfileId = readRequestBusinessProfileId(req);
    const name = String(req.body?.name || "").trim();
    const company = String(req.body?.company || "").trim();
    const website = String(req.body?.website || "").trim();
    if (!name && !company && !website) {
      return res.status(400).json({ error: "Provide a lead name, company, or website to research." });
    }

    try {
      // Preference order: Exa (general web research) then Sprouts (B2B data).
      const account = await findMcpAccountForProfile({
        tokenStore,
        businessProfileId,
        platforms: ["exa", "sprouts"],
      });
      if (!account) {
        return res.status(409).json({
          error: "No research provider connected. Connect Exa or Sprouts under Connections → Intelligence & MCP.",
        });
      }
      const access = getStoredAccountAccess(account, userId);
      if (!access.allowed) {
        return res.status(403).json({ error: "Account belongs to another user" });
      }

      const toolsRes = await listToolsForStored(tokenStore, account);
      if (toolsRes.ok === false) {
        return res.status(502).json({ error: toolsRes.message });
      }
      const tool = pickTool(toolsRes.tools, [
        /web_search/i,
        /^search/i,
        /prospect/i,
        /company/i,
        /search/i,
      ]);
      if (!tool) {
        return res.status(502).json({ error: "The connected provider exposes no search tool." });
      }

      const query = [company || name, website, "company overview news"]
        .filter(Boolean)
        .join(" ");
      const argName = argNameForTool(tool, ["query", "q", "search", "text", "prompt", "name"]);
      const callRes = await callToolForStored(
        tokenStore,
        account,
        tool.name,
        argName ? { [argName]: query } : {}
      );
      if (callRes.ok === false) {
        return res.status(502).json({ error: callRes.message });
      }
      if (callRes.isError) {
        return res.status(502).json({ error: trimText(callRes.text, 500) || "Provider returned an error." });
      }

      return res.json({
        provider: String(account.platform || ""),
        tool: tool.name,
        query,
        text: trimText(callRes.text, 20_000),
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[intelligence] lead-research failed:", err);
      return res.status(500).json({ error: "Lead research failed." });
    }
  });
}
