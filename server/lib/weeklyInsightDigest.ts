/**
 * Weekly social/marketing insight digest — emailed when the social workflow is on.
 */

export interface WeeklyInsightDigestInput {
  businessName: string;
  appUrl?: string;
  portfolioGrade?: string | null;
  roasCurrent?: number | null;
  roasDelta?: number | null;
  postsPublished?: number;
  postsFailed?: number;
  topCaptionHint?: string | null;
}

export interface WeeklyInsightDigest {
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
    .replace(/"/g, "&quot;");
}

export function buildWeeklyInsightDigest(input: WeeklyInsightDigestInput): WeeklyInsightDigest {
  const bullets: string[] = [];

  if (input.portfolioGrade && input.portfolioGrade !== "—") {
    bullets.push(`Marketing portfolio grade: ${input.portfolioGrade}`);
  }
  if (input.roasCurrent != null && Number.isFinite(input.roasCurrent)) {
    const roas = `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(input.roasCurrent)}×`;
    const delta =
      input.roasDelta != null && Number.isFinite(input.roasDelta)
        ? ` (${input.roasDelta >= 0 ? "+" : ""}${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(input.roasDelta)}× vs last week)`
        : "";
    bullets.push(`Shopify ROAS: ${roas}${delta}`);
  }
  if ((input.postsPublished ?? 0) > 0 || (input.postsFailed ?? 0) > 0) {
    bullets.push(
      `Scheduled posts: ${input.postsPublished ?? 0} published${(input.postsFailed ?? 0) > 0 ? `, ${input.postsFailed} failed` : ""} this week`
    );
  }
  if (input.topCaptionHint) {
    bullets.push(`Content idea for next week: ${input.topCaptionHint}`);
  }

  const hasContent = bullets.length > 0;
  const subject = hasContent
    ? `${input.businessName}: weekly insight digest`
    : `${input.businessName}: weekly insight — all quiet`;

  const appUrl = (input.appUrl || "").replace(/\/$/, "");
  const listHtml = hasContent
    ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
    : `<p>No major shifts this week — keep your content rhythm steady.</p>`;

  const html =
    `<div style="font-family:sans-serif;max-width:560px">` +
    `<h2>${escapeHtml(input.businessName)} — weekly insight</h2>` +
    listHtml +
    (appUrl ? `<p><a href="${escapeHtml(appUrl)}/marketing">Marketing</a> · <a href="${escapeHtml(appUrl)}/social-media">Social</a></p>` : "") +
    `</div>`;

  const text = `${subject}\n\n${bullets.join("\n")}${appUrl ? `\n\nMarketing: ${appUrl}/marketing` : ""}`;

  return { hasContent, subject, html, text };
}
