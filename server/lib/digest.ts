/**
 * Daily digest builder — turns a tenant's outstanding signals (connection
 * health, task urgency, fresh recommendations) into a ready-to-send email.
 *
 * Pure and side-effect free: it takes already-loaded, normalised inputs and
 * returns the subject + HTML + plaintext, so it's trivially testable and the
 * cron just feeds it Supabase data. Mirrors the home-page Daily Brief so the
 * inbox version and the in-app version tell the same story.
 */

import { escapeHtml } from "./htmlEscape.ts";

export interface DigestInput {
  businessName: string;
  /** Absolute app URL for the "open dashboard" link (no trailing slash). */
  appUrl?: string;
  connectionIssues: Array<{ label: string; health: string }>;
  unreadDms?: number;
  /** Open leads whose follow-up is overdue or due today. */
  leadsToFollowUp?: number;
  /** Outreach drafts waiting in the automated queue. */
  outreachQueuePending?: number;
  /** Blended ROAS below 1× over the last 7 days. */
  underwaterRoas?: number | null;
  /** ROAS week-over-week trend down from marketing snapshots. */
  marketingTrendDown?: boolean;
  /** Reviews awaiting a reply. */
  reviewsNeedingReply?: number;
  /** Shopify products low or out of stock. */
  lowStockCount?: number;
  /** Paid/fulfilled Shopify orders not yet invoiced in Fortnox. */
  unbilledOrdersCount?: number;
  /** Shopify refunds waiting for a Fortnox credit invoice. */
  pendingCreditInvoicesCount?: number;
  /** Scheduled automations whose last run failed. */
  failedAutomations?: Array<{ title: string }>;
  overdueTasks: Array<{ title: string }>;
  dueTodayTasks: Array<{ title: string }>;
  newRecommendations: Array<{ title: string }>;
}

export interface DigestSection {
  heading: string;
  items: string[];
}

export interface Digest {
  hasContent: boolean;
  actionCount: number;
  subject: string;
  sections: DigestSection[];
  html: string;
  text: string;
}

function titles(rows: Array<{ title: string }>, max = 5): string[] {
  return rows
    .map((r) => r.title.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function buildDigest(input: DigestInput): Digest {
  const sections: DigestSection[] = [];
  const unreadDms = Math.max(0, Math.trunc(input.unreadDms ?? 0));
  const leadsToFollowUp = Math.max(0, Math.trunc(input.leadsToFollowUp ?? 0));
  const outreachQueuePending = Math.max(0, Math.trunc(input.outreachQueuePending ?? 0));
  const reviewsNeedingReply = Math.max(0, Math.trunc(input.reviewsNeedingReply ?? 0));
  const lowStockCount = Math.max(0, Math.trunc(input.lowStockCount ?? 0));
  const unbilledOrdersCount = Math.max(0, Math.trunc(input.unbilledOrdersCount ?? 0));
  const pendingCreditInvoicesCount = Math.max(0, Math.trunc(input.pendingCreditInvoicesCount ?? 0));
  const failedAutomations = input.failedAutomations ?? [];
  const underwaterRoas = input.underwaterRoas;
  const hasUnderwaterRoas =
    underwaterRoas != null && Number.isFinite(underwaterRoas) && underwaterRoas < 1;
  const hasTrendDown = Boolean(input.marketingTrendDown && !hasUnderwaterRoas);

  if (input.connectionIssues.length > 0) {
    sections.push({
      heading: `${input.connectionIssues.length} connection(s) need attention`,
      items: input.connectionIssues.slice(0, 8).map((c) => `${c.label} — ${c.health}`),
    });
  }
  if (unreadDms > 0) {
    sections.push({
      heading: `${unreadDms} unread message(s)`,
      items: ["Customers are waiting for a reply in your inbox."],
    });
  }
  if (leadsToFollowUp > 0) {
    sections.push({
      heading: `${leadsToFollowUp} lead(s) to follow up`,
      items: ["A follow-up is due — keep deals moving in Sales."],
    });
  }
  if (outreachQueuePending > 0) {
    sections.push({
      heading: `${outreachQueuePending} outreach draft(s) ready`,
      items: ["Automated follow-up copy is queued — review and send from Sales."],
    });
  }
  if (hasUnderwaterRoas) {
    sections.push({
      heading: `Ads underwater (ROAS ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(underwaterRoas!)}×)`,
      items: ["Revenue is below ad spend — review campaigns on Marketing."],
    });
  } else if (hasTrendDown) {
    sections.push({
      heading: "Ad ROAS dipped this week",
      items: ["Week-over-week return on ad spend is down — check Marketing."],
    });
  }
  if (reviewsNeedingReply > 0) {
    sections.push({
      heading: `${reviewsNeedingReply} review(s) need a reply`,
      items: ["Respond to recent customer feedback while it's still fresh."],
    });
  }
  if (lowStockCount > 0) {
    sections.push({
      heading: `${lowStockCount} product(s) low or out of stock`,
      items: ["Check inventory before ads or orders outrun the shelves — see Ecommerce."],
    });
  }
  if (unbilledOrdersCount > 0) {
    sections.push({
      heading: `${unbilledOrdersCount} order(s) not yet invoiced in Fortnox`,
      items: ["Suggested invoices are waiting for your approval — see Company → Economy."],
    });
  }
  if (pendingCreditInvoicesCount > 0) {
    sections.push({
      heading: `${pendingCreditInvoicesCount} refund(s) awaiting a Fortnox credit invoice`,
      items: ["Suggested credit invoices are waiting for your approval — see Company → Economy."],
    });
  }
  if (failedAutomations.length > 0) {
    sections.push({
      heading: `${failedAutomations.length} automation(s) failed`,
      items: failedAutomations.slice(0, 5).map((a) => `${a.title} — review on Automations`),
    });
  }
  if (input.overdueTasks.length > 0) {
    sections.push({ heading: `${input.overdueTasks.length} task(s) overdue`, items: titles(input.overdueTasks) });
  }
  if (input.dueTodayTasks.length > 0) {
    sections.push({ heading: `${input.dueTodayTasks.length} task(s) due today`, items: titles(input.dueTodayTasks) });
  }
  if (input.newRecommendations.length > 0) {
    sections.push({
      heading: `${input.newRecommendations.length} new recommendation(s)`,
      items: titles(input.newRecommendations),
    });
  }

  const actionCount =
    input.connectionIssues.length +
    unreadDms +
    leadsToFollowUp +
    outreachQueuePending +
    (hasUnderwaterRoas ? 1 : 0) +
    (hasTrendDown ? 1 : 0) +
    reviewsNeedingReply +
    // One "go check inventory" action regardless of how many SKUs are low —
    // counting them raw made the subject line read "47 things need attention"
    // for what is really a handful of areas. The section heading still shows
    // the real product count.
    (lowStockCount > 0 ? 1 : 0) +
    unbilledOrdersCount +
    pendingCreditInvoicesCount +
    failedAutomations.length +
    input.overdueTasks.length +
    input.dueTodayTasks.length +
    input.newRecommendations.length;
  const hasContent = actionCount > 0;

  const subject = hasContent
    ? `${input.businessName}: ${actionCount} ${actionCount === 1 ? "thing needs" : "things need"} attention today`
    : `${input.businessName}: you're all caught up`;

  const appUrl = (input.appUrl || "").replace(/\/$/, "");
  const ctaHtml = appUrl
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(appUrl)}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Open dashboard</a></p>`
    : "";

  const sectionsHtml = hasContent
    ? sections
        .map(
          (s) =>
            `<h3 style="margin:20px 0 6px;font-size:15px;color:#111827">${escapeHtml(s.heading)}</h3>` +
            `<ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.6">` +
            s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("") +
            `</ul>`,
        )
        .join("")
    : `<p style="color:#374151;font-size:14px">Connections are healthy, tasks are under control, and there's nothing new to review. Have a good day.</p>`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">` +
    `<p style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;margin:0">Today's brief</p>` +
    `<h2 style="margin:4px 0 0;font-size:20px;color:#111827">${escapeHtml(input.businessName)}</h2>` +
    `<p style="color:#6b7280;font-size:13px;margin:4px 0 0">${escapeHtml(subject)}</p>` +
    sectionsHtml +
    ctaHtml +
    `</div>`;

  const textSections = hasContent
    ? sections.map((s) => `${s.heading}\n${s.items.map((i) => `  - ${i}`).join("\n")}`).join("\n\n")
    : "You're all caught up — nothing needs attention right now.";
  const text = `${subject}\n\n${textSections}${appUrl ? `\n\nOpen dashboard: ${appUrl}` : ""}`;

  return { hasContent, actionCount, subject, sections, html, text };
}
