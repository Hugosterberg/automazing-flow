import { describe, expect, it } from "vitest";
import {
  buildConfigChecks,
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
