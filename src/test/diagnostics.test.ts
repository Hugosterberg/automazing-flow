import { describe, expect, it } from "vitest";
import {
  buildConfigChecks,
  buildOriginChecks,
  snapshotFromEnv,
  summarize,
  type ConfigSnapshot,
} from "../../server/lib/diagnostics";

const FULL: ConfigSnapshot = {
  supabaseUrl: true,
  supabaseAnonKey: true,
  supabaseServiceRole: true,
  secretsEncryptionKey: true,
  authSessionSecret: true,
  cronSecret: true,
  openai: true,
  zernio: true,
  google: true,
  microsoft: true,
  meta: true,
  tiktok: true,
  resend: true,
  googleAdsDeveloperToken: true,
};

describe("buildConfigChecks", () => {
  it("reports all green when everything is configured", () => {
    const report = summarize(buildConfigChecks(FULL));
    expect(report.summary.error).toBe(0);
    expect(report.summary.warn).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("flags missing core Supabase config as blocking errors with fixes", () => {
    const checks = buildConfigChecks({ ...FULL, supabaseServiceRole: false, supabaseUrl: false });
    const serviceRole = checks.find((c) => c.id === "supabase_service_role");
    expect(serviceRole?.status).toBe("error");
    expect(serviceRole?.fix).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(summarize(checks).ok).toBe(false);
  });

  it("treats optional integrations as warnings, not errors", () => {
    const checks = buildConfigChecks({ ...FULL, resend: false, openai: false, googleAdsDeveloperToken: false });
    const report = summarize(checks);
    expect(report.summary.error).toBe(0);
    expect(report.summary.warn).toBe(3);
    expect(report.ok).toBe(true); // warnings don't block
    expect(checks.find((c) => c.id === "resend")?.status).toBe("warn");
  });

  it("summarises counts and overall ok state", () => {
    const report = summarize(buildConfigChecks({ ...FULL, supabaseUrl: false, cronSecret: false }));
    expect(report.summary.error).toBe(1); // supabase url
    expect(report.summary.warn).toBe(1); // cron secret
    expect(report.ok).toBe(false);
  });
});

describe("buildOriginChecks", () => {
  const base = "https://app.example.com";
  const api = "https://api.example.com";

  it("passes when you view from BASE_URL", () => {
    const checks = buildOriginChecks({ baseUrl: base, apiBaseUrl: api, corsOrigins: "", requestOrigin: base });
    expect(checks.find((c) => c.id === "oauth_origin_allowlisted")?.status).toBe("ok");
    expect(checks.find((c) => c.id === "oauth_base_url")?.status).toBe("ok");
  });

  it("passes when the viewing origin is in CORS_ORIGINS", () => {
    const preview = "https://preview-123.vercel.app";
    const checks = buildOriginChecks({
      baseUrl: base,
      apiBaseUrl: api,
      corsOrigins: `${preview}, https://other.example.com`,
      requestOrigin: `${preview}/connections`,
    });
    expect(checks.find((c) => c.id === "oauth_origin_allowlisted")?.status).toBe("ok");
  });

  it("flags a non-allowlisted viewing origin as the logout-causing error", () => {
    const rogue = "https://staging.example.com";
    const checks = buildOriginChecks({ baseUrl: base, apiBaseUrl: api, corsOrigins: "", requestOrigin: rogue });
    const origin = checks.find((c) => c.id === "oauth_origin_allowlisted");
    expect(origin?.status).toBe("error");
    expect(origin?.detail).toMatch(/logged out/i);
    expect(origin?.fix).toMatch(/CORS_ORIGINS/);
    expect(summarize(checks).ok).toBe(false);
  });

  it("errors when BASE_URL is unset or invalid", () => {
    const checks = buildOriginChecks({ baseUrl: "", apiBaseUrl: api, corsOrigins: "", requestOrigin: api });
    expect(checks.find((c) => c.id === "oauth_base_url")?.status).toBe("error");
  });

  it("warns (not errors) when the browser origin is unknown", () => {
    const checks = buildOriginChecks({ baseUrl: base, apiBaseUrl: api, corsOrigins: "", requestOrigin: null });
    expect(checks.find((c) => c.id === "oauth_origin_allowlisted")?.status).toBe("warn");
  });

  it("warns when CORS_ORIGINS is empty", () => {
    const checks = buildOriginChecks({ baseUrl: base, apiBaseUrl: api, corsOrigins: "", requestOrigin: base });
    expect(checks.find((c) => c.id === "oauth_cors_origins")?.status).toBe("warn");
  });
});

describe("snapshotFromEnv", () => {
  it("derives presence flags from env, requiring both halves of OAuth pairs", () => {
    const snap = snapshotFromEnv({
      SUPABASE_URL: "https://x.supabase.co",
      GOOGLE_CLIENT_ID: "id",
      // GOOGLE_CLIENT_SECRET intentionally missing
      ZERNIO_API_KEY: "z",
      OPENAI_API_KEY: "  ", // whitespace-only counts as unset
    } as NodeJS.ProcessEnv);
    expect(snap.supabaseUrl).toBe(true);
    expect(snap.google).toBe(false); // needs both id + secret
    expect(snap.zernio).toBe(true);
    expect(snap.openai).toBe(false); // whitespace trimmed away
    expect(snap.resend).toBe(false);
  });
});
