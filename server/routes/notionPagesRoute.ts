/**
 * POST /api/notion/:accountId/pages — create a Notion page under a given
 * page_id or database_id parent. Validates that the stored account is a
 * Notion integration owned by the caller.
 */

import { createNotionPage } from "../providers/notion.ts";
import type { AuthHelpers } from "../lib/authHelpers.ts";
import { accountInBusinessProfile, readRequestBodyBusinessProfileId } from "../lib/profileScope.ts";

interface NotionPagesRouteDeps {
  auth: AuthHelpers;
  tokenStore: {
    get: (id: string) => Promise<Record<string, unknown> | null>;
  };
}

export function registerNotionPagesRoute(app, deps: NotionPagesRouteDeps) {
  const { auth, tokenStore } = deps;

  app.post("/api/notion/:accountId/pages", async (req, res) => {
    const userId = auth.getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { accountId } = req.params;
    const stored = await tokenStore.get(accountId);
    if (!stored) {
      return res.status(404).json({ error: "Account not connected" });
    }
    if (stored.ownerUserId && stored.ownerUserId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (stored.platform !== "notion") {
      return res.status(400).json({ error: "Account is not a Notion integration" });
    }
    const businessProfileId = readRequestBodyBusinessProfileId(req);
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }
    if (!accountInBusinessProfile(stored, businessProfileId)) {
      return res.status(404).json({ error: "Account not connected for this business profile" });
    }

    const parentId = String(req.body?.parentId || "").trim();
    const parentTypeRaw = String(req.body?.parentType || "").trim();
    const parentType = parentTypeRaw === "database_id" ? "database_id" : "page_id";
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();

    if (!parentId || !title) {
      return res.status(400).json({ error: "parentId and title are required" });
    }

    const result = await createNotionPage(stored.accessToken as string, {
      parentId,
      parentType,
      title,
      content,
    });

    if (result?.error) {
      return res.status(result.status || 500).json({ error: result.error, details: result.details });
    }

    res.json({ ok: true, page: result });
  });
}
