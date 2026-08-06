import { describe, expect, it } from "vitest";
import { buildDailyBrief } from "@/features/daily-brief/buildDailyBrief";
import { initI18n, i18n } from "@/lib/i18n";

describe("buildDailyBrief shopify + ad comment signals", () => {
  it("surfaces cached store ops and ad comments", async () => {
    initI18n();
    await i18n.changeLanguage("en");
    const brief = buildDailyBrief({
      connectionIssues: [],
      overdueTasks: [],
      dueTodayTasks: [],
      newRecommendations: [],
      shopifyOps: {
        staleUnfulfilled: 2,
        pendingPayments: 1,
        abandonedCheckouts: 3,
      },
      metaAdCommentCount: 4,
    });
    expect(brief.items.some((i) => i.id === "shopify-stale-unfulfilled")).toBe(true);
    expect(brief.items.some((i) => i.id === "shopify-pending-payments")).toBe(true);
    expect(brief.items.some((i) => i.id === "shopify-abandoned")).toBe(true);
    expect(brief.items.some((i) => i.id === "meta-ad-comments")).toBe(true);
    expect(brief.items.find((i) => i.id === "shopify-stale-unfulfilled")?.to).toContain(
      "/ecommerce?tab=orders"
    );
    expect(brief.items.find((i) => i.id === "meta-ad-comments")?.to).toContain(
      "/marketing?tab=ads"
    );
  });

  it("surfaces Fortnox invoice suggestions and product content drafts", async () => {
    initI18n();
    await i18n.changeLanguage("en");
    const brief = buildDailyBrief({
      connectionIssues: [],
      overdueTasks: [],
      dueTodayTasks: [],
      newRecommendations: [],
      fortnoxInvoiceSuggestions: 2,
      productContentDrafts: 3,
    });
    expect(brief.items.some((i) => i.id === "fortnox-invoice-queue")).toBe(true);
    expect(brief.items.some((i) => i.id === "product-content-drafts")).toBe(true);
    expect(brief.items.find((i) => i.id === "fortnox-invoice-queue")?.to).toBe("/company?tab=economy");
    expect(brief.items.find((i) => i.id === "product-content-drafts")?.to).toBe(
      "/ecommerce?tab=products"
    );
  });
});
