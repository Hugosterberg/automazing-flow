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
import { describeZernioFailure, type ZernioModule } from "../providers/zernioModule.ts";

interface SettingsRoutesDeps {
  auth: AuthHelpers;
  envConfig: EnvConfig;
  integrationConfigChecks: Record<string, RequirementDefinition>;
  secretResolver: SecretResolver;
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
  zernio?: Pick<ZernioModule, "listProfiles" | "listInboxConversations">;
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
  {
    key: "APIAI_API_KEY",
    label: "apiai.me API key",
    description: "Your apiai.me API key for Content -> Create tools and pipelines.",
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
  const { auth, envConfig, integrationConfigChecks, secretResolver, requireMembership, zernio } = deps;

  /**
   * Live Zernio probe for the "Test" button: an env key being present says
   * nothing about whether Zernio actually accepts it or which add-ons the
   * plan includes. Verifies API access (profiles) and the Inbox add-on
   * (needed for DMs/auto-reply) against the real API.
   */
  async function probeZernioLive(): Promise<{
    ok: boolean;
    api: string;
    inbox: string;
    message: string;
  }> {
    if (!zernio) {
      return { ok: true, api: "not_probed", inbox: "not_probed", message: "Zernio is configured." };
    }
    const profilesResult = await zernio.listProfiles();
    if (!profilesResult.ok) {
      const failure = describeZernioFailure(profilesResult);
      return {
        ok: false,
        api: failure.message,
        inbox: "not_probed",
        message: `Zernio API check failed: ${failure.message}`,
      };
    }
    const inboxResult = await zernio.listInboxConversations({ limit: 1 });
    if (!inboxResult.ok) {
      const failure = describeZernioFailure(inboxResult);
      return {
        ok: true,
        api: "ok",
        inbox: failure.message,
        message: `Zernio API works, but the Inbox is unavailable: ${failure.message} DMs and auto-reply will not work until this is resolved.`,
      };
    }
    return {
      ok: true,
      api: "ok",
      inbox: "ok",
      message: "Zernio is configured and live: API and Inbox add-on both respond.",
    };
  }

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
  app.post("/api/settings/api-keys/test", async (req, res) => {
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

    // Zernio gets a LIVE probe on top of the env check — connect problems are
    // usually plan/add-on limits on Zernio's side, not missing keys.
    if (target === "zernio" && result.ok) {
      try {
        const live = await probeZernioLive();
        return res.json({
          target,
          label: definition.label,
          ok: live.ok,
          missing: [],
          missingAny: [],
          message: live.message,
          live: { api: live.api, inbox: live.inbox },
          authPath: live.ok ? definition.authPath || null : null,
        });
      } catch (e) {
        return res.json({
          target,
          label: definition.label,
          ok: false,
          missing: [],
          missingAny: [],
          message: `Zernio live check failed: ${e instanceof Error ? e.message : "unknown error"}`,
          authPath: null,
        });
      }
    }

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
