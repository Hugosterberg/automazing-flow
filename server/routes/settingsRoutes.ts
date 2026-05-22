/**
 * /api/settings/api-keys — read, upsert, and probe the local .env.local file.
 *
 * All routes require a valid session; the read/write surface is intentionally
 * narrow and validated against a conservative env-key regex so the endpoint
 * can't be coerced into writing arbitrary keys.
 */

import type { AuthHelpers } from "../lib/authHelpers.ts";
import type { EnvConfig, RequirementDefinition } from "../lib/envConfig.ts";

interface SettingsRoutesDeps {
  auth: AuthHelpers;
  envConfig: EnvConfig;
  integrationConfigChecks: Record<string, RequirementDefinition>;
}

export function registerSettingsRoutes(app, deps: SettingsRoutesDeps) {
  const { auth, envConfig, integrationConfigChecks } = deps;

  app.get("/api/settings/api-keys", (req, res) => {
    const userId = auth.getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    return res.json({ entries: envConfig.readEnvEntries() });
  });

  app.put("/api/settings/api-keys", (req, res) => {
    const userId = auth.getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (!rawEntries) {
      return res.status(400).json({ error: "entries must be an array" });
    }

    const updates: Record<string, string> = {};
    for (const entry of rawEntries) {
      const key = String(entry?.key || "").trim();
      const value = String(entry?.value ?? "");
      if (!key) continue;
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        return res.status(400).json({ error: `Invalid env key: ${key}` });
      }
      updates[key] = value;
    }

    envConfig.upsertEnvEntries(updates);
    return res.json({ ok: true, entries: envConfig.readEnvEntries() });
  });

  app.post("/api/settings/api-keys/test", (req, res) => {
    const userId = auth.getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const target = String(req.body?.target || "").trim();
    const definition = integrationConfigChecks[target];
    if (!definition) {
      return res.status(400).json({ error: `Unknown test target: ${target}` });
    }

    const result = envConfig.evaluateRequirementSet(definition);
    return res.json({
      target,
      label: definition.label,
      ok: result.ok,
      missing: result.missing,
      missingAny: result.missingAny,
      message: result.ok
        ? `${definition.label} is configured in .env.local.`
        : definition.message,
      authPath: result.ok ? definition.authPath || null : null,
    });
  });
}
