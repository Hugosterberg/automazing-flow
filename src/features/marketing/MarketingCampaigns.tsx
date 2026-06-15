import { BarChart3, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useMarketingCampaigns,
  type AdAccountCampaigns,
  type AdCampaign,
} from "./useMarketingCampaigns";
import { formatMoney, formatNumber as formatCount } from "./format";

const PLATFORM_LABEL: Record<AdAccountCampaigns["platform"], string> = {
  meta_business: "Meta",
  google_ads: "Google Ads",
};

/** "OUTCOME_SALES" / "SEARCH" → "Sales" / "Search". */
function prettyObjective(value: string | undefined): string {
  if (!value) return "";
  const cleaned = value.replace(/^OUTCOME_/i, "").replace(/_/g, " ").toLowerCase().trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function isRunning(status: string): boolean {
  const s = status.toUpperCase();
  return s === "ACTIVE" || s === "ENABLED";
}

function CampaignRow({ campaign, currency }: { campaign: AdCampaign; currency?: string }) {
  const budget = campaign.dailyBudget ?? campaign.lifetimeBudget;
  const budgetLabel = campaign.dailyBudget != null ? "/dag" : campaign.lifetimeBudget != null ? " totalt" : "";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full shrink-0",
              isRunning(campaign.status) ? "bg-success" : "bg-muted-foreground/50"
            )}
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {[
            isRunning(campaign.status) ? "Aktiv" : campaign.status.toLowerCase(),
            prettyObjective(campaign.objective),
            budget != null ? `${formatMoney(budget, currency)}${budgetLabel}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatMoney(campaign.spend7d, currency)}
        </p>
        {campaign.roas7d != null ? (
          <p
            className={cn(
              "text-[11px] font-medium tabular-nums",
              campaign.roas7d >= 1 ? "text-success" : "text-warning"
            )}
            title={`ROAS = försäljning ${formatMoney(campaign.conversionValue7d, currency)} ÷ spend ${formatMoney(
              campaign.spend7d,
              currency
            )}`}
          >
            ROAS {new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(campaign.roas7d)}×
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            7 dgr{campaign.clicks7d != null ? ` · ${formatCount(campaign.clicks7d)} klick` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function PlatformGroup({ group }: { group: AdAccountCampaigns }) {
  const totalSpend = group.campaigns.reduce((sum, c) => sum + (c.spend7d ?? 0), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-foreground">
          {PLATFORM_LABEL[group.platform]}
          <span className="text-muted-foreground font-normal"> · {group.accountName}</span>
        </p>
        {group.campaigns.length > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatMoney(totalSpend, group.currency)} senaste 7 dgr
          </p>
        ) : null}
      </div>
      {group.campaigns.length > 0 ? (
        <div className="space-y-2">
          {group.campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} currency={group.currency} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3.5 py-3">
          {group.note ?? "Inga aktiva kampanjer just nu."}
        </p>
      )}
    </div>
  );
}

/**
 * Live active-campaign overview for the Marketing page: pulls running campaigns
 * and trailing-7-day spend from the connected Meta and Google Ads accounts.
 * Renders nothing until at least one ad platform is connected, so it stays out
 * of the way for users who only do organic marketing.
 */
export function MarketingCampaigns() {
  const { platforms, connected, isLoading, refetch } = useMarketingCampaigns();
  const anyConnected = connected.meta_business || connected.google_ads;

  if (!isLoading && !anyConnected && platforms.length === 0) {
    return null;
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Aktiva kampanjer
            </CardTitle>
            <CardDescription>Pågående annonsering och spend från Meta &amp; Google Ads.</CardDescription>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="shrink-0"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            <span className="sr-only">Uppdatera kampanjer</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && platforms.length === 0 ? (
          <div className="space-y-2" aria-hidden>
            <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
            <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          </div>
        ) : (
          platforms.map((group) => <PlatformGroup key={group.platform + group.accountName} group={group} />)
        )}
      </CardContent>
    </Card>
  );
}
