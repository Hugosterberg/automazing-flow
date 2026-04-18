/**
 * .env file read/write helpers plus the config-requirement evaluator used by
 * /api/settings/api-keys/test.
 *
 * Factory-based so the envPath is captured once and the handler callers don't
 * need to thread it through every call.
 */

import fs from "fs";
import dotenv from "dotenv";

export interface EnvConfigDeps {
  envPath: string;
}

export interface RequirementDefinition {
  label: string;
  required?: string[];
  requiredAny?: string[][];
  authPath?: string;
  message: string;
}

export interface RequirementResult {
  ok: boolean;
  missing: string[];
  missingAny: string[][];
}

export interface EnvConfig {
  readEnvEntries(): Record<string, string>;
  serializeEnvValue(value: unknown): string;
  upsertEnvEntries(updates: Record<string, string>): void;
  hasEnvValue(key: string): boolean;
  evaluateRequirementSet(definition: RequirementDefinition): RequirementResult;
}

export function createEnvConfig(deps: EnvConfigDeps): EnvConfig {
  const { envPath } = deps;

  function readEnvEntries(): Record<string, string> {
    if (!fs.existsSync(envPath)) return {};
    let raw = fs.readFileSync(envPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return dotenv.parse(raw);
  }

  function serializeEnvValue(value: unknown): string {
    const normalized = String(value ?? "");
    if (normalized.length === 0) return '""';
    if (/[\s#"'`]/.test(normalized)) {
      return JSON.stringify(normalized);
    }
    return normalized;
  }

  function upsertEnvEntries(updates: Record<string, string>): void {
    const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const lines = raw.length > 0 ? raw.replace(/^\uFEFF/, "").split(/\r?\n/) : [];
    const nextLines = [...lines];

    for (const [key, value] of Object.entries(updates)) {
      const serialized = `${key}=${serializeEnvValue(value)}`;
      const idx = nextLines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
      if (idx >= 0) {
        nextLines[idx] = serialized;
      } else {
        nextLines.push(serialized);
      }
      process.env[key] = String(value ?? "");
    }

    const content = `${nextLines
      .filter((line, index, arr) => !(index === arr.length - 1 && line === ""))
      .join("\n")}\n`;
    fs.writeFileSync(envPath, content, "utf8");
  }

  function hasEnvValue(key: string): boolean {
    return String(process.env[key] || "").trim().length > 0;
  }

  function evaluateRequirementSet(definition: RequirementDefinition): RequirementResult {
    const missing = (definition.required || []).filter((key) => !hasEnvValue(key));
    const missingAny = (definition.requiredAny || []).filter(
      (group) => !group.some((key) => hasEnvValue(key))
    );

    return {
      ok: missing.length === 0 && missingAny.length === 0,
      missing,
      missingAny,
    };
  }

  return {
    readEnvEntries,
    serializeEnvValue,
    upsertEnvEntries,
    hasEnvValue,
    evaluateRequirementSet,
  };
}

export const INTEGRATION_CONFIG_CHECKS: Record<string, RequirementDefinition> = {
  openai: {
    label: "OpenAI",
    required: ["OPENAI_API_KEY"],
    message: "Required for AI analysis and AI-assisted generation.",
  },
  zernio: {
    label: "Zernio",
    requiredAny: [["ZERNIO_API_KEY", "LATE_API_KEY"]],
    message: "Required for Zernio-backed social and review integrations.",
  },
  google_drive: {
    label: "Google Drive OAuth",
    required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    authPath: "/api/auth/google_drive",
    message: "Required to connect Google Drive and browse Drive media in Content.",
  },
  notion: {
    label: "Notion OAuth",
    required: ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET", "NOTION_APP_URL"],
    authPath: "/api/auth/notion",
    message: "Required to connect Notion. NOTION_APP_URL must match your callback host.",
  },
  shopify: {
    label: "Shopify OAuth",
    required: ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"],
    authPath: "/api/auth/shopify",
    message: "Required to connect Shopify. SHOPIFY_APP_URL must match your public app URL.",
  },
  instagram_direct: {
    label: "Instagram Direct Fallback",
    required: ["INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"],
    authPath: "/api/auth/instagram",
    message: "Used only for the direct Instagram fallback without Zernio.",
  },
  tiktok: {
    label: "TikTok OAuth",
    required: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    authPath: "/api/auth/tiktok",
    message: "Required for official TikTok OAuth.",
  },
  x: {
    label: "X / Twitter OAuth",
    required: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    authPath: "/api/auth/x",
    message: "Required for X / Twitter OAuth.",
  },
  microsoft: {
    label: "Microsoft OAuth",
    required: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    authPath: "/api/auth/outlook",
    message: "Required for Outlook and Outlook Calendar.",
  },
  tripadvisor: {
    label: "Tripadvisor API",
    required: ["TRIPADVISOR_API_KEY", "TRIPADVISOR_LOCATION_ID"],
    message: "Required for Tripadvisor API requests.",
  },
};
