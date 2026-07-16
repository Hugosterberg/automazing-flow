/**
 * Tiny ops endpoints: liveness probe + a dev debug-env echo.
 *
 * `/api/debug-env` is not authenticated; it only exposes boolean presence
 * and the non-secret Zernio base URL. Do not leak API keys here.
 */

import fs from "fs";
import path from "path";

interface MiscRoutesDeps {
  envPath: string;
  zernioApiBase: string;
  getZernioApiKey: () => string;
}

export function registerMiscRoutes(app, deps: MiscRoutesDeps) {
  const { envPath, zernioApiBase, getZernioApiKey } = deps;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  /**
   * Country of the incoming request, used by the client to pick the default
   * UI language (Swedish for SE, English otherwise). Vercel sets
   * `x-vercel-ip-country` on every edge request; locally the header is
   * absent and the client falls back to English.
   */
  app.get("/api/geo", (req, res) => {
    const raw = req.headers["x-vercel-ip-country"];
    const country = typeof raw === "string" && /^[A-Z]{2}$/.test(raw) ? raw : null;
    // Cache per-visitor at the edge for a day; the client caches in localStorage anyway.
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.json({ country });
  });

  app.get("/api/debug-env", (_req, res) => {
    res.json({
      envPath: path.resolve(envPath),
      envExists: fs.existsSync(envPath),
      zernioApiKeySet: Boolean(getZernioApiKey()),
      ZERNIO_API_BASE: zernioApiBase,
    });
  });
}
