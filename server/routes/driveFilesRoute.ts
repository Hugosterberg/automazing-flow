/**
 * GET /api/accounts/:accountId/drive/files/:fileId/:mode
 *
 * Proxies Google Drive file/thumbnail responses through the server so the
 * browser never holds the user's access token. Preserves Range/Content-Range
 * headers so the <video> element can seek.
 */

import { fetchGoogleDriveFileResponse } from "../providers/googleDrive.ts";
import type { AuthHelpers } from "../lib/authHelpers.ts";
import { accountInBusinessProfile, readRequestBusinessProfileId } from "../lib/profileScope.ts";

interface DriveFilesRouteDeps {
  auth: AuthHelpers;
  tokenStore: {
    get: (id: string) => Promise<Record<string, unknown> | null>;
    set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  };
}

export function registerDriveFilesRoute(app, deps: DriveFilesRouteDeps) {
  const { auth, tokenStore } = deps;

  app.get("/api/accounts/:accountId/drive/files/:fileId/:mode", async (req, res) => {
    const userId = auth.getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { accountId, fileId, mode } = req.params;
    if (mode !== "content" && mode !== "thumbnail") {
      return res.status(404).json({ error: "Unknown Drive file mode" });
    }

    const stored = await tokenStore.get(accountId);
    if (!stored || stored.platform !== "google_drive") {
      return res.status(404).json({ error: "Drive account not connected" });
    }
    const access = auth.getStoredAccountAccess(stored, userId);
    if (!access.allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (access.migrate) {
      await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
    }
    const businessProfileId = readRequestBusinessProfileId(req);
    if (!businessProfileId) {
      return res.status(400).json({ error: "business_profile_id is required" });
    }
    if (!accountInBusinessProfile(stored, businessProfileId)) {
      return res.status(404).json({ error: "Drive account not connected for this business profile" });
    }

    try {
      const upstream = await fetchGoogleDriveFileResponse({
        accessToken: stored.accessToken as string,
        refreshToken: stored.refreshToken as string | undefined,
        accountId,
        tokenStore,
        stored,
        googleClientId: process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
        fileId,
        mode,
        rangeHeader: req.headers.range,
      });

      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status || 502).end();
      }

      const contentType = upstream.headers.get("content-type");
      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");
      const acceptRanges = upstream.headers.get("accept-ranges");

      if (contentType) res.setHeader("Content-Type", contentType);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentRange) res.setHeader("Content-Range", contentRange);
      if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);
      // Drive thumbnails/content are immutable per file id and auth-scoped, so
      // let the browser cache them privately (overrides the global no-store)
      // instead of re-proxying the same bytes on every render.
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.status(upstream.status);

      return res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      console.error("Google Drive file proxy error:", err);
      return res.status(502).json({ error: "Could not fetch Google Drive file" });
    }
  });
}
