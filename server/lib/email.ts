/**
 * Minimal transactional email sender (Resend) — the shared backbone for every
 * outbound notification: daily digests now, and future alerts (urgent review,
 * ROAS drop, connection expired). No SDK dependency; a single fetch call.
 *
 * Degrades gracefully: with no RESEND_API_KEY it reports `{ ok:false, skipped:true }`
 * so callers (and crons) treat "email not configured" as a no-op rather than an
 * error. Set RESEND_API_KEY and optionally EMAIL_FROM to enable.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface EmailResult {
  ok: boolean;
  /** True when sending was skipped because email isn't configured. */
  skipped?: boolean;
  id?: string;
  error?: string;
}

const DEFAULT_FROM = "Automazing <onboarding@resend.dev>";

export function isEmailConfigured(): boolean {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return { ok: false, skipped: true };
  const to = String(params.to || "").trim();
  if (!to) return { ok: false, error: "missing_recipient" };

  const from = (params.from || process.env.EMAIL_FROM || DEFAULT_FROM).trim();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: params.subject,
        html: params.html,
        ...(params.text ? { text: params.text } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: body?.message || `resend_error_${res.status}` };
    return { ok: true, id: body?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "email_request_failed" };
  }
}
