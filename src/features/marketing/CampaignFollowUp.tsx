import { CalendarClock, Send, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMarketingCampaigns } from "./useMarketingCampaigns";
import { formatMoney, formatRoas } from "./format";

export interface FollowUpCampaign {
  id: string;
  title: string;
  /** yyyy-mm-dd or empty when not set. */
  startDate: string;
  endDate: string;
  budget: string;
  channel: string;
}

const DAY_MS = 86_400_000;

function isSocialChannel(channel: string): boolean {
  const lower = channel.toLowerCase();
  return (
    lower.includes("social") ||
    lower.includes("organisk") ||
    lower.includes("organic") ||
    lower.includes("instagram") ||
    lower.includes("facebook")
  );
}

/**
 * Follow-up section for campaigns the user has marked as active ("Aktiv") on
 * the Marketing page. Each campaign gets a card with period countdown and the
 * blended ad performance (ROAS / spend / revenue) from the connected ad
 * platforms, so an active campaign never runs without a visible result check.
 */
export function CampaignFollowUp({
  campaigns,
  onUseCampaignCta,
}: {
  campaigns: FollowUpCampaign[];
  onUseCampaignCta?: (cta: string, campaignTitle: string) => void;
}) {
  const { t } = useTranslation("marketing");
  const { performance, connected } = useMarketingCampaigns();
  if (campaigns.length === 0) return null;

  const nowMs = Date.now();
  const anyAdsConnected = connected.meta_business || connected.google_ads;
  const hasPerformance = performance != null && performance.adSpend != null;

  function periodLabel(startDate: string, endDate: string): { text: string; ended: boolean } {
    if (endDate) {
      const end = Date.parse(`${endDate}T23:59:59`);
      if (Number.isFinite(end)) {
        if (end < nowMs) return { text: t("followUp.periodEnded"), ended: true };
        const daysLeft = Math.ceil((end - nowMs) / DAY_MS);
        return { text: t("followUp.daysLeft", { count: daysLeft }), ended: false };
      }
    }
    if (startDate) {
      const start = Date.parse(`${startDate}T00:00:00`);
      if (Number.isFinite(start) && start <= nowMs) {
        const day = Math.max(1, Math.floor((nowMs - start) / DAY_MS) + 1);
        return { text: t("followUp.dayCount", { day }), ended: false };
      }
    }
    return { text: t("followUp.noPeriod"), ended: false };
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {t("followUp.title")}
        </CardTitle>
        <CardDescription>
          {hasPerformance
            ? t("followUp.descriptionWithPerformance", { days: performance.windowDays })
            : anyAdsConnected
              ? t("followUp.descriptionNoData")
              : t("followUp.descriptionNotConnected")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasPerformance ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2.5">
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                performance.roas != null && performance.roas < 1 ? "text-warning" : "text-foreground"
              )}
            >
              ROAS {formatRoas(performance.roas)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatMoney(performance.adSpend, performance.adSpendCurrency)} {t("followUp.spend")}
              {performance.revenue != null
                ? ` · ${formatMoney(performance.revenue, performance.revenueCurrency)} ${t("followUp.revenue")}`
                : ""}
              {performance.orders != null ? ` · ${performance.orders} ${t("followUp.orders")}` : ""}
            </p>
          </div>
        ) : null}
        {campaigns.map((campaign) => {
          const period = periodLabel(campaign.startDate, campaign.endDate);
          return (
            <div
              key={campaign.id}
              className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{campaign.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {[campaign.channel, campaign.budget].filter(Boolean).join(" · ") || t("followUp.missingDetails")}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                  period.ended
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                <CalendarClock className="h-3 w-3" aria-hidden />
                {period.text}
              </span>
              {onUseCampaignCta && isSocialChannel(campaign.channel) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => onUseCampaignCta(campaign.channel, campaign.title)}
                >
                  <Send className="h-3 w-3 mr-1" />
                  {t("followUp.createPost")}
                </Button>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
