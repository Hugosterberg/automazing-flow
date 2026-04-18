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

  app.get("/api/debug-env", (_req, res) => {
    res.json({
      envPath: path.resolve(envPath),
      envExists: fs.existsSync(envPath),
      zernioApiKeySet: Boolean(getZernioApiKey()),
      ZERNIO_API_BASE: zernioApiBase,
    });
  });
}
