/**
 * Self-diagnostics: one structured report of what's configured, what's missing,
 * and what's broken — so problems that need fixing are obvious instead of
 * surfacing as a confusing runtime failure later.
 *
 * Two layers:
 *   - buildConfigChecks(snapshot): pure, env-presence checks (no secrets, just
 *     "is it set"). Unit-tested.
 *   - runDatabaseChecks(supabaseAdmin): probes that the expected tables/columns
 *     exist, so a not-yet-applied migration is reported as an actionable error.
 *
 * Surfaced via GET /api/diagnostics and `npm run diagnose`.
 */

export type CheckStatus = "ok" | "warn" | "error";

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it, when not ok. */
  fix?: string;
}

export interface DiagnosticsReport {
  generatedAt: string;
  ok: boolean;
  summary: { ok: number; warn: number; error: number };
  checks: DiagnosticCheck[];
}

export interface ConfigSnapshot {
  supabaseUrl: boolean;
  supabaseAnonKey: boolean;
  supabaseServiceRole: boolean;
  secretsEncryptionKey: boolean;
  authSessionSecret: boolean;
  cronSecret: boolean;
  openai: boolean;
  zernio: boolean;
  google: boolean;
  microsoft: boolean;
  meta: boolean;
  tiktok: boolean;
  resend: boolean;
  googleAdsDeveloperToken: boolean;
}

function check(
  id: string,
  label: string,
  present: boolean,
  okDetail: string,
  missing: { status: Exclude<CheckStatus, "ok">; detail: string; fix: string },
): DiagnosticCheck {
  return present
    ? { id, label, status: "ok", detail: okDetail }
    : { id, label, status: missing.status, detail: missing.detail, fix: missing.fix };
}

export function buildConfigChecks(s: ConfigSnapshot): DiagnosticCheck[] {
  return [
    check("supabase_url", "Supabase URL", s.supabaseUrl, "Set.", {
      status: "error",
      detail: "Not set — the app and API can't reach the database.",
      fix: "Set SUPABASE_URL (or VITE_SUPABASE_URL).",
    }),
    check("supabase_anon_key", "Supabase anon key", s.supabaseAnonKey, "Set.", {
      status: "error",
      detail: "Not set — auth token verification will fail.",
      fix: "Set SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY.",
    }),
    check("supabase_service_role", "Supabase service role", s.supabaseServiceRole, "Set — durable OAuth tokens + per-tenant secrets enabled.", {
      status: "error",
      detail: "Not set — OAuth tokens fall back to local disk and don't survive across serverless instances; per-tenant secrets and crons are disabled.",
      fix: "Set SUPABASE_SERVICE_ROLE_KEY.",
    }),
    check("secrets_encryption_key", "Secrets encryption key", s.secretsEncryptionKey, "Set — per-tenant integration secrets are encrypted at rest.", {
      status: "warn",
      detail: "Not set — per-tenant integration secrets are disabled; the app uses env keys only.",
      fix: "Set SECRETS_ENCRYPTION_KEY (32 bytes base64/hex, or any long passphrase).",
    }),
    check("auth_session_secret", "Auth session secret", s.authSessionSecret, "Set — sessions are stable across restarts/instances.", {
      status: "warn",
      detail: "Not set — a random per-instance secret is used, so users get logged out across deploys/instances.",
      fix: "Set AUTH_SESSION_SECRET.",
    }),
    check("cron_secret", "Cron secret", s.cronSecret, "Set — scheduled jobs can run.", {
      status: "warn",
      detail: "Not set — every /api/cron/* endpoint fails closed (401), so digests, marketing alerts and housekeeping won't run.",
      fix: "Set CRON_SECRET (Vercel sets this for Cron automatically once configured).",
    }),
    check("openai", "OpenAI", s.openai, "Set — AI drafts, summaries and lead suggestions use the model.", {
      status: "warn",
      detail: "Not set — AI features fall back to heuristics.",
      fix: "Set OPENAI_API_KEY (or a per-tenant key in integration settings).",
    }),
    check("zernio", "Zernio", s.zernio, "Set — social inbox/reviews/publishing available.", {
      status: "warn",
      detail: "Not set — Zernio-backed channels (DMs, reviews, publishing) won't work.",
      fix: "Set ZERNIO_API_KEY.",
    }),
    check("google", "Google OAuth", s.google, "Set — Gmail/Drive/Calendar/YouTube/GBP/Ads connect + refresh.", {
      status: "warn",
      detail: "Not set — Google connections can't be created or refreshed.",
      fix: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    }),
    check("microsoft", "Microsoft OAuth", s.microsoft, "Set — Outlook mail/calendar connect + refresh.", {
      status: "warn",
      detail: "Not set — Outlook connections can't be created or refreshed.",
      fix: "Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET.",
    }),
    check("meta", "Meta / Instagram", s.meta, "Set — Instagram + Meta Business (ads) connect.", {
      status: "warn",
      detail: "Not set — native Instagram/Meta connections are unavailable.",
      fix: "Set INSTAGRAM_CLIENT_ID/SECRET (and META_APP_ID/SECRET for Business).",
    }),
    check("tiktok", "TikTok", s.tiktok, "Set — TikTok connect + refresh.", {
      status: "warn",
      detail: "Not set — native TikTok connections are unavailable.",
      fix: "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET.",
    }),
    check("resend", "Email (Resend)", s.resend, "Set — daily digest + marketing alert emails are delivered.", {
      status: "warn",
      detail: "Not set — automated emails (digest, marketing alerts) no-op silently.",
      fix: "Set RESEND_API_KEY (and optionally EMAIL_FROM).",
    }),
    check("google_ads_developer_token", "Google Ads reporting", s.googleAdsDeveloperToken, "Set — Google Ads campaigns/spend load.", {
      status: "warn",
      detail: "Not set — Google Ads reporting shows a 'needs developer token' note (Meta ads still work).",
      fix: "Set GOOGLE_ADS_DEVELOPER_TOKEN (and optionally GOOGLE_ADS_LOGIN_CUSTOMER_ID).",
    }),
  ];
}

export function snapshotFromEnv(env: NodeJS.ProcessEnv = process.env): ConfigSnapshot {
  const has = (...keys: string[]) => keys.some((k) => String(env[k] || "").trim().length > 0);
  const all = (...keys: string[]) => keys.every((k) => String(env[k] || "").trim().length > 0);
  return {
    supabaseUrl: has("SUPABASE_URL", "VITE_SUPABASE_URL"),
    supabaseAnonKey: has(
      "SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_ANON_KEY",
    ),
    supabaseServiceRole: has("SUPABASE_SERVICE_ROLE_KEY"),
    secretsEncryptionKey: has("SECRETS_ENCRYPTION_KEY"),
    authSessionSecret: has("AUTH_SESSION_SECRET"),
    cronSecret: has("CRON_SECRET"),
    openai: has("OPENAI_API_KEY"),
    zernio: has("ZERNIO_API_KEY", "LATE_API_KEY"),
    google: all("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    microsoft: all("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"),
    meta: has("INSTAGRAM_CLIENT_ID", "META_APP_ID"),
    tiktok: all("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"),
    resend: has("RESEND_API_KEY"),
    googleAdsDeveloperToken: has("GOOGLE_ADS_DEVELOPER_TOKEN"),
  };
}

/** Tables/columns the app expects, mapped to the migration that creates them. */
const DB_PROBES: Array<{ id: string; label: string; table: string; column: string; migration: string }> = [
  { id: "db_profile_documents", label: "profile_documents table", table: "profile_documents", column: "key", migration: "20260615130000_profile_documents.sql" },
  { id: "db_leads", label: "leads table", table: "leads", column: "company", migration: "20260615140000_leads.sql" },
  { id: "db_notification_settings", label: "automation_settings.notification_email", table: "automation_settings", column: "notification_email", migration: "20260615120000_notification_settings.sql" },
];

type ProbeClient = {
  from: (table: string) => {
    select: (cols: string, opts: { head: true; count: "exact" }) => {
      limit: (n: number) => Promise<{ error: { message?: string; code?: string } | null }>;
    };
  };
};

export async function runDatabaseChecks(supabaseAdmin: unknown): Promise<DiagnosticCheck[]> {
  if (!supabaseAdmin) {
    return [
      {
        id: "db_connection",
        label: "Database checks",
        status: "warn",
        detail: "Skipped — no service role client, so schema can't be verified.",
        fix: "Set SUPABASE_SERVICE_ROLE_KEY to enable schema diagnostics.",
      },
    ];
  }
  const client = supabaseAdmin as ProbeClient;
  const checks: DiagnosticCheck[] = [];
  for (const probe of DB_PROBES) {
    try {
      const { error } = await client.from(probe.table).select(probe.column, { head: true, count: "exact" }).limit(1);
      if (error) {
        const msg = String(error.message || "");
        const missing = error.code === "42P01" || error.code === "42703" || /does not exist|could not find/i.test(msg);
        checks.push({
          id: probe.id,
          label: probe.label,
          status: "error",
          detail: missing ? "Missing — the migration hasn't been applied." : `Query failed: ${msg}`,
          fix: missing ? `Apply migration ${probe.migration} (npm run supabase:db:push).` : "Check database connectivity and permissions.",
        });
      } else {
        checks.push({ id: probe.id, label: probe.label, status: "ok", detail: "Present." });
      }
    } catch (e) {
      checks.push({
        id: probe.id,
        label: probe.label,
        status: "error",
        detail: `Probe error: ${e instanceof Error ? e.message : String(e)}`,
        fix: `Apply migration ${probe.migration} if the table is missing.`,
      });
    }
  }
  return checks;
}

export function summarize(checks: DiagnosticCheck[]): DiagnosticsReport {
  const summary = { ok: 0, warn: 0, error: 0 };
  for (const c of checks) summary[c.status] += 1;
  return {
    generatedAt: new Date().toISOString(),
    ok: summary.error === 0,
    summary,
    checks,
  };
}
