/**
 * Marketing watchdog alert — emails when ad performance needs attention:
 * underwater ROAS, inventory conflicts, poor campaign grades, and score drops.
 */

import type { MarketingRecommendation } from "./marketingAnalytics.ts";
import { escapeHtml } from "./htmlEscape.ts";

export interface MarketingAlertCampaign {
  name: string;
  grade: string;
  score: number;
  spend: number | null;
  roas: number | null;
  topAction?: string;
}

export interface MarketingAlertInput {
  businessName: string;
  appUrl?: string;
  currency?: string | null;
  roas: number | null;
  adSpend: number | null;
  revenue: number | null;
  portfolioGrade?: string | null;
  portfolioScore?: number | null;
  portfolioScoreDelta?: number | null;
  campaignsPoor?: number;
  poorCampaigns?: MarketingAlertCampaign[];
  recommendations?: MarketingRecommendation[];
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
      `ROAS ${roasLabel(input.roas)} — annonsspend ${money(input.adSpend, input.currency)} överstiger intäkter ${money(
        input.revenue,
        input.currency,
      )} (7 dagar).`,
    );
  }

  if (input.inventory) {
    const { outOfStock, lowStock, threshold, examples, activeCampaigns } = input.inventory;
    const stockBits: string[] = [];
    if (outOfStock > 0) stockBits.push(`${outOfStock} slut i lager`);
    if (lowStock > 0) stockBits.push(`${lowStock} lågt lager (≤ ${threshold})`);
    reasons.push(
      `${activeCampaigns} kampanj(er) körs medan ${stockBits.join(" och ")}` +
        `${examples.length ? ` (t.ex. ${examples.join(", ")})` : ""}.`,
    );
  }

  if (input.portfolioScoreDelta != null && input.portfolioScoreDelta <= -15) {
    reasons.push(
      `Marknadsföringsbetyg sjönk ${Math.abs(Math.round(input.portfolioScoreDelta))} poäng vs förra veckan` +
        (input.portfolioGrade ? ` (nu ${input.portfolioGrade})` : "") +
        ".",
    );
  }

  const criticalRecs = (input.recommendations ?? []).filter((r) => r.severity === "critical");
  for (const rec of criticalRecs.slice(0, 2)) {
    reasons.push(`${rec.title}: ${rec.action}`);
  }

  const poor = input.poorCampaigns ?? [];
  for (const c of poor.slice(0, 3)) {
    if (reasons.some((r) => r.includes(c.name))) continue;
    reasons.push(
      `${c.name} — betyg ${c.grade} (${c.score} poäng)` +
        (c.roas != null ? `, ROAS ${roasLabel(c.roas)}` : "") +
        (c.topAction ? `. ${c.topAction}` : ""),
    );
  }

  if (
    reasons.length === 0 &&
    (input.campaignsPoor ?? 0) > 0 &&
    (input.portfolioGrade === "D" || input.portfolioGrade === "F")
  ) {
    reasons.push(
      `${input.campaignsPoor} kampanj(er) behöver åtgärd — portföljbetyg ${input.portfolioGrade}.`,
    );
  }

  const hasAlert = reasons.length > 0;
  const subject =
    underwater || (input.campaignsPoor ?? 0) > 0
      ? `${input.businessName}: marknadsföring behöver åtgärd`
      : `${input.businessName}: marknadsföringsvarning`;
  const appUrl = (input.appUrl || "").replace(/\/$/, "");

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">` +
    `<p style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#b45309;margin:0">Marknadsföringsvarning</p>` +
    `<h2 style="margin:4px 0 12px;font-size:20px;color:#111827">${escapeHtml(input.businessName)}</h2>` +
    (input.portfolioGrade && input.portfolioGrade !== "—"
      ? `<p style="margin:0 0 12px;font-size:14px;color:#374151">Portföljbetyg: <strong>${escapeHtml(input.portfolioGrade)}</strong>` +
        (input.portfolioScore != null ? ` (${input.portfolioScore} poäng)` : "") +
        `</p>`
      : "") +
    `<ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.6">` +
    reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("") +
    `</ul>` +
    (appUrl
      ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(appUrl)}/marketing" style="background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Öppna marknadsföring</a></p>`
      : "") +
    `</div>`;

  const text = `${subject}\n\n${reasons.map((r) => `- ${r}`).join("\n")}${appUrl ? `\n\n${appUrl}/marketing` : ""}`;

  return { hasAlert, reasons, subject, html, text };
}

export function extractPoorCampaignsForAlert(
  platforms: Array<{
    platform: "meta_business" | "google_ads";
    campaigns: Array<{
      id: string;
      name: string;
      spend7d?: number;
      roas7d?: number;
      score?: { grade: string; score: number; verdict: string; actions: string[] };
    }>;
  }>,
): MarketingAlertCampaign[] {
  const poor: MarketingAlertCampaign[] = [];
  for (const group of platforms) {
    for (const c of group.campaigns) {
      if (!c.score || c.score.verdict !== "poor") continue;
      if ((c.spend7d ?? 0) < 100) continue;
      poor.push({
        name: c.name,
        grade: c.score.grade,
        score: c.score.score,
        spend: c.spend7d ?? null,
        roas: c.roas7d ?? null,
        topAction: c.score.actions[0],
      });
    }
  }
  return poor.sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
}
