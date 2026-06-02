/**
 * Settings / integration configuration.
 *
 * Two surfaces:
 *   1. Global platform keys (OAuth app credentials, Zernio key, …) — owned by
 *      the platform operator and set via environment variables. The UI can only
 *      READ their configured/not-configured status here; it can never read the
 *      secret values and can never write them (env is read-only at runtime, and
 *      on Vercel the filesystem is read-only anyway).
 *   2. Per-tenant "bring-your-own" secrets — each business_profile may override
 *      a small allowlist of keys (Tripadvisor, Google Ads ids, PageSpeed, an own
 *      OpenAI key). These are encrypted at rest and gated by `requireMembership`.
 *
 * Security note: the previous version returned every .env value in plaintext to
 * any authenticated user and wrote a shared .env file. Both are removed.
 */

import type { AuthHelpers } from "../lib/authHelpers.ts";
import type { EnvConfig, RequirementDefinition } from "../lib/envConfig.ts";
import type { SecretResolver } from "../lib/secretResolver.ts";

interface SettingsRoutesDeps {
  auth: AuthHelpers;
  envConfig: EnvConfig;
  integrationConfigChecks: Record<string, RequirementDefinition>;
  secretResolver: SecretResolver;
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
}

/** Per-tenant overridable keys. Anything not listed here can only be set as a global env var. */
interface TenantSecretDef {
  key: string;
  label: string;
  description: string;
  inputType: "password" | "text";
}

const TENANT_SECRET_CATALOG: TenantSecretDef[] = [
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API key (your own)",
    description: "Optional. Use your own OpenAI key for AI features for this profile. Falls back to the platform key when empty.",
    inputType: "password",
  },
  {
    key: "TRIPADVISOR_API_KEY",
    label: "Tripadvisor API key",
    description: "Your Tripadvisor Content API key for this business.",
    inputType: "password",
  },
  {
    key: "TRIPADVISOR_LOCATION_ID",
    label: "Tripadvisor location id",
    description: "The Tripadvisor location id for this business.",
    inputType: "text",
  },
  {
    key: "GOOGLE_ADS_CUSTOMER_ID",
    label: "Google Ads customer id",
    description: "Your Google Ads customer id (no dashes) for campaign reads.",
    inputType: "text",
  },
  {
    key: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    label: "Google Ads login/MCC customer id",
    description: "Optional manager (MCC) customer id (no dashes).",
    inputType: "text",
  },
  {
    key: "PAGESPEED_API_KEY",
    label: "PageSpeed Insights key (your own)",
    description: "Optional. Your own PageSpeed Insights API key for Digital Brand audits.",
    inputType: "password",
  },
];

const TENANT_SECRET_KEYS = new Set(TENANT_SECRET_CATALOG.map((d) => d.key));

/** Flatten every env key referenced by the integration config checks for the global status view. */
function collectGlobalKeys(checks: Record<string, RequirementDefinition>): string[] {
  const keys = new Set<string>();
  for (const def of Object.values(checks)) {
    for (const k of def.required || []) keys.add(k);
    for (const group of def.requiredAny || []) for (const k of group) keys.add(k);
  }
  return [...keys].sort();
}

export function registerSettingsRoutes(app, deps: SettingsRoutesDeps) {
  const { auth, envConfig, integrationConfigChecks, secretResolver, requireMembership } = deps;

  // --- Global platform keys: status only, never values, never writable here. ---
  app.get("/api/settings/api-keys", (req, res) => {
    const userId = auth.getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const keys = collectGlobalKeys(integrationConfigChecks);
    const entries = keys.map((key) => ({ key, configured: envConfig.hasEnvValue(key), scope: "global" as const }));
    return res.json({ entries });
  });

  // --- Config probe (env-based) for a known integration target. Session only. ---
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
        ? `${definition.label} is configured.`
        : definition.message,
      authPath: result.ok ? definition.authPath || null : null,
    });
  });

  // --- Per-tenant secrets: configured status + values write. Membership-gated. ---
  app.get("/api/settings/secrets", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    let configuredKeys: string[] = [];
    try {
      configuredKeys = await secretResolver.listConfiguredKeys(businessProfileId);
    } catch (e) {
      console.warn("[settings] listConfiguredKeys failed:", e instanceof Error ? e.message : e);
    }
    const configuredSet = new Set(configuredKeys);
    const entries = TENANT_SECRET_CATALOG.map((def) => ({
      key: def.key,
      label: def.label,
      description: def.description,
      inputType: def.inputType,
      // configured = tenant has its own value OR a global env fallback exists
      configured: configuredSet.has(def.key) || envConfig.hasEnvValue(def.key),
      tenantOverride: configuredSet.has(def.key),
    }));
    return res.json({ storeEnabled: secretResolver.enabled, entries });
  });

  app.put("/api/settings/secrets", requireMembership, async (req, res) => {
    if (!secretResolver.enabled) {
      return res.status(503).json({
        error: "secret_store_unavailable",
        message: "Set SECRETS_ENCRYPTION_KEY and SUPABASE_SERVICE_ROLE_KEY to store per-profile secrets.",
      });
    }
    const userId = auth.getSessionUserId(req);
    const businessProfileId = String(req.businessProfileId || "").trim();
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (!rawEntries) {
      return res.status(400).json({ error: "entries must be an array" });
    }

    for (const entry of rawEntries) {
      const key = String(entry?.key || "").trim();
      if (!key) continue;
      if (!TENANT_SECRET_KEYS.has(key)) {
        return res.status(400).json({ error: `Key not allowed for per-profile secrets: ${key}` });
      }
    }

    try {
      for (const entry of rawEntries) {
        const key = String(entry?.key || "").trim();
        if (!key) continue;
        const value = String(entry?.value ?? "");
        if (value.trim().length === 0) {
          await secretResolver.deleteSecret(businessProfileId, key);
        } else {
          await secretResolver.setSecret(businessProfileId, key, value, userId);
        }
      }
    } catch (e) {
      console.error("[settings] secret write failed:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "secret_write_failed" });
    }

    const configuredKeys = await secretResolver.listConfiguredKeys(businessProfileId);
    return res.json({ ok: true, configuredKeys });
  });
}
