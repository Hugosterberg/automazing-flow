/**
 * Weekly performance report email — a Monday-morning recap of the last 7 days
 * (marketing trend, leads won/new, follow-ups due, tasks completed). Pure
 * builder; the cron gathers the numbers and sends via the shared email lib.
 */

export interface WeeklyReportInput {
  businessName: string;
  appUrl?: string;
  currency?: string | null;
  roasCurrent?: number | null;
  roasPrevious?: number | null;
  spendThisWeek?: number | null;
  revenueThisWeek?: number | null;
  leadsWon: number;
  leadsNew: number;
  followUpsDue: number;
  tasksCompleted: number;
}

export interface WeeklyReport {
  hasContent: boolean;
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("sv-SE", { style: "currency", currency: currency || "SEK", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency || ""}`.trim();
  }
}

function roasLine(current: number | null | undefined, previous: number | null | undefined): string | null {
  if (current == null || !Number.isFinite(current)) return null;
  const fmt = (n: number) => `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(n)}×`;
  if (previous == null || !Number.isFinite(previous)) return `ROAS ${fmt(current)}`;
  const delta = current - previous;
  const arrow = delta > 0.05 ? "▲" : delta < -0.05 ? "▼" : "→";
  const sign = delta > 0 ? "+" : "";
  return `ROAS ${fmt(current)} ${arrow} ${sign}${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(delta)}× vs last week`;
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const rows: string[] = [];
  const text: string[] = [];

  const roas = roasLine(input.roasCurrent, input.roasPrevious);
  if (roas) {
    const detail = `${money(input.revenueThisWeek, input.currency)} revenue on ${money(input.spendThisWeek, input.currency)} ad spend`;
    rows.push(`<li><strong>${escapeHtml(roas)}</strong> — ${escapeHtml(detail)}</li>`);
    text.push(`${roas} (${detail})`);
  }
  if (input.leadsWon > 0) {
    rows.push(`<li>${input.leadsWon} lead${input.leadsWon === 1 ? "" : "s"} won 🎉</li>`);
    text.push(`${input.leadsWon} leads won`);
  }
  if (input.leadsNew > 0) {
    rows.push(`<li>${input.leadsNew} new lead${input.leadsNew === 1 ? "" : "s"} added</li>`);
    text.push(`${input.leadsNew} new leads`);
  }
  if (input.tasksCompleted > 0) {
    rows.push(`<li>${input.tasksCompleted} task${input.tasksCompleted === 1 ? "" : "s"} completed</li>`);
    text.push(`${input.tasksCompleted} tasks completed`);
  }
  if (input.followUpsDue > 0) {
    rows.push(`<li>${input.followUpsDue} lead follow-up${input.followUpsDue === 1 ? "" : "s"} due this week</li>`);
    text.push(`${input.followUpsDue} follow-ups due`);
  }

  const hasContent = rows.length > 0;
  const subject = hasContent
    ? `${input.businessName}: your week in review`
    : `${input.businessName}: a quiet week`;
  const appUrl = (input.appUrl || "").replace(/\/$/, "");

  const body = hasContent
    ? `<ul style="margin:12px 0;padding-left:18px;color:#374151;font-size:14px;line-height:1.7">${rows.join("")}</ul>`
    : `<p style="color:#374151;font-size:14px">No standout activity in the last 7 days. A good week to line up new leads or content.</p>`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">` +
    `<p style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;margin:0">Week in review</p>` +
    `<h2 style="margin:4px 0 0;font-size:20px;color:#111827">${escapeHtml(input.businessName)}</h2>` +
    body +
    (appUrl
      ? `<p style="margin:20px 0 8px"><a href="${escapeHtml(appUrl)}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Open dashboard</a></p>`
      : "") +
    `</div>`;

  return {
    hasContent,
    subject,
    html,
    text: `${subject}\n\n${text.map((t) => `- ${t}`).join("\n") || "No standout activity this week."}${appUrl ? `\n\n${appUrl}` : ""}`,
  };
}
