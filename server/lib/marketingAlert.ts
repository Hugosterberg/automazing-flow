/**
 * Marketing watchdog alert — turns a tenant's gathered marketing data into an
 * email when something needs attention: ad spend running underwater (blended
 * ROAS < 1×) or campaigns running while the store is out of stock.
 *
 * Pure and side-effect free so the firing logic is testable; the cron feeds it
 * `gatherMarketingData` output and sends the result via the shared email lib.
 */

export interface MarketingAlertInput {
  businessName: string;
  appUrl?: string;
  currency?: string | null;
  /** Blended ROAS (revenue ÷ ad spend), or null when not computable. */
  roas: number | null;
  adSpend: number | null;
  revenue: number | null;
  inventory: {
    activeCampaigns: number;
    outOfStock: number;
    lowStock: number;
    threshold: number;
    examples: string[];
  } | null;
}

export interface MarketingAlert {
  hasAlert: boolean;
  reasons: string[];
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
    return new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: currency || "SEK",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency || ""}`.trim();
  }
}

function roasLabel(roas: number): string {
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(roas)}×`;
}

export function buildMarketingAlert(input: MarketingAlertInput): MarketingAlert {
  const reasons: string[] = [];

  const underwater = input.roas != null && Number.isFinite(input.roas) && input.roas < 1;
  if (underwater && input.roas != null) {
    reasons.push(
      `ROAS is ${roasLabel(input.roas)} — ad spend ${money(input.adSpend, input.currency)} is outrunning revenue ${money(
        input.revenue,
        input.currency,
      )} over the last 7 days.`,
    );
  }

  if (input.inventory) {
    const { outOfStock, lowStock, threshold, examples, activeCampaigns } = input.inventory;
    const stockBits: string[] = [];
    if (outOfStock > 0) stockBits.push(`${outOfStock} out of stock`);
    if (lowStock > 0) stockBits.push(`${lowStock} low (≤ ${threshold})`);
    reasons.push(
      `${activeCampaigns} campaign(s) running while ${stockBits.join(" and ")}` +
        `${examples.length ? ` (e.g. ${examples.join(", ")})` : ""}.`,
    );
  }

  const hasAlert = reasons.length > 0;
  const subject = `${input.businessName}: marketing needs attention`;
  const appUrl = (input.appUrl || "").replace(/\/$/, "");

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">` +
    `<p style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#b45309;margin:0">Marketing alert</p>` +
    `<h2 style="margin:4px 0 12px;font-size:20px;color:#111827">${escapeHtml(input.businessName)}</h2>` +
    `<ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.6">` +
    reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("") +
    `</ul>` +
    (appUrl
      ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(appUrl)}/marketing" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Review marketing</a></p>`
      : "") +
    `</div>`;

  const text = `${subject}\n\n${reasons.map((r) => `- ${r}`).join("\n")}${appUrl ? `\n\n${appUrl}/marketing` : ""}`;

  return { hasAlert, reasons, subject, html, text };
}
