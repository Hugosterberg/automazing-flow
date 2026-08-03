import { useMemo } from "react";
import { m } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BarChart3, Globe2, Megaphone, Share2, Star, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { pageFadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { platformLabel } from "@/lib/platformLabels";
import { formatNumber, formatShortDate } from "@/lib/format";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useWorkspaceMode } from "@/features/workspace-mode";
import { useSocialInsights, type AccountInsight } from "@/features/insights";
import { formatStatChange } from "@/features/social/socialStatsTrend";
import { MarketingTrendChart, useMarketingTrend } from "@/features/marketing";
import { CompaniesOverview, SiteAnalyticsSection, useTrackingSite } from "@/features/site-analytics";
import { useIsMobile } from "@/hooks/use-mobile";

const REVIEW_PLATFORMS = new Set(["google_reviews", "tripadvisor", "judgeme", "google_business"]);

function formatChartDate(iso: string): string {
  return formatShortDate(`${iso}T00:00:00`) || iso;
}

/** "12,3k" instead of "12 345" so the y-axis stays narrow on mobile. */
const compactNumber = new Intl.NumberFormat("sv-SE", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function DeltaChip({ delta, spanDays, decimals = 0, suffix = "" }: {
  delta: number | undefined;
  spanDays: number | undefined;
  decimals?: number;
  suffix?: string;
}) {
  if (delta == null || !spanDays) return null;
  const text = formatStatChange(delta, spanDays, { decimals, suffix });
  if (!text) return null;
  return (
    <span
      className={cn(
        "text-[11px] font-medium tabular-nums",
        text.startsWith("−") ? "text-destructive" : "text-success"
      )}
    >
      {text}
    </span>
  );
}

function AccountRow({
  insight,
  username,
}: {
  insight: AccountInsight;
  username: string | null;
}) {
  const { t } = useTranslation("insights");
  const isReview = REVIEW_PLATFORMS.has(insight.platform);
  const latest = insight.latest;
  const headline = isReview
    ? latest?.averageRating != null
      ? `${latest.averageRating.toFixed(1)} ★`
      : "–"
    : latest?.followers != null
      ? formatNumber(latest.followers)
      : "–";
  const sub = isReview
    ? latest?.reviewCount != null
      ? t("social.reviewsCount", { count: latest.reviewCount })
      : ""
    : t("social.followers");
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {platformLabel(insight.platform)}
          {username ? <span className="text-muted-foreground font-normal"> · {username}</span> : null}
        </p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className="text-base font-semibold tabular-nums">{headline}</p>
        {isReview ? (
          <DeltaChip
            delta={insight.trend?.deltas.reviewCount}
            spanDays={insight.trend?.spanDays}
          />
        ) : (
          <DeltaChip
            delta={insight.trend?.deltas.followers}
            spanDays={insight.trend?.spanDays}
          />
        )}
      </div>
    </li>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  to,
  linkLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  to: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        {title}
      </h2>
      <Link
        to={to}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
      >
        {linkLabel}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * /insights — one read-only view over the data the app ingests from every
 * source, as trends instead of point-in-time numbers: aggregated follower
 * history + per-account deltas (social_stats_snapshots), the daily
 * marketing/ROAS history (marketing_snapshots) and review ratings. Charts stay
 * in the feature components; this page only composes.
 */
export default function InsightsPage() {
  const { t } = useTranslation("insights");
  const { t: tCommon } = useTranslation("common");
  const isMobile = useIsMobile();
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;
  const { mode } = useWorkspaceMode();

  const followerChartConfig = useMemo<ChartConfig>(
    () => ({
      followers: {
        label: t("social.followersTotal"),
        color: "hsl(var(--info))",
      },
    }),
    [t]
  );

  const { followerSeries, accounts, isLoading } = useSocialInsights(businessProfileId);
  const { snapshots: marketingSnapshots } = useMarketingTrend();
  const { site: trackingSite } = useTrackingSite(businessProfileId);

  const usernameByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of legacy.accounts) {
      map.set(account.id, account.displayName || account.username);
    }
    return map;
  }, [legacy.accounts]);

  const socialAccounts = accounts.filter((a) => !REVIEW_PLATFORMS.has(a.platform));
  const reviewAccounts = accounts.filter(
    (a) => REVIEW_PLATFORMS.has(a.platform) && a.latest?.averageRating != null
  );
  const hasMarketing = mode === "business" && marketingSnapshots.length >= 2;
  // The website section always renders its own setup/empty state, so the
  // page-level empty card only covers the snapshot-driven sections.
  const isEmpty =
    !isLoading &&
    socialAccounts.length === 0 &&
    reviewAccounts.length === 0 &&
    !hasMarketing &&
    !trackingSite?.siteKey;

  const [searchParams, setSearchParams] = useSearchParams();
  type InsightsTab = "overview" | "social" | "marketing" | "reviews" | "website";
  const INSIGHTS_TAB_VALUES: InsightsTab[] = ["overview", "social", "marketing", "reviews", "website"];
  const rawInsightsTab = searchParams.get("tab");
  const insightsTab: InsightsTab =
    rawInsightsTab && (INSIGHTS_TAB_VALUES as string[]).includes(rawInsightsTab)
      ? (rawInsightsTab as InsightsTab)
      : "overview";

  function setInsightsTab(tab: InsightsTab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  return (
    <m.div {...pageFadeUp} transition={{ duration: 0.3 }} className="space-y-6 max-w-5xl w-full">
      <PageHeader
        icon={BarChart3}
        title={t("page.title")}
        description={t("page.description")}
      />

      <PageSmartBar
        title={t("smartBar.title")}
        steps={
          isMobile
            ? [t("smartBar.step1"), t("smartBar.step2"), t("smartBar.step3Mobile")]
            : [t("smartBar.step1"), t("smartBar.step2"), t("smartBar.step3Desktop")]
        }
        tip={t("smartBar.tip")}
        liveHintOverride={isEmpty ? t("smartBar.liveEmpty") : null}
        extraActions={isEmpty ? [{ label: t("smartBar.openConnections"), to: "/connections" }] : []}
      />

      <PageModeTabs
        value={insightsTab}
        aria-label={t("tabs.ariaLabel")}
        onChange={setInsightsTab}
        options={[
          { value: "overview", label: t("tabs.overview") },
          { value: "social", label: t("tabs.social"), count: socialAccounts.length },
          { value: "marketing", label: t("tabs.marketing") },
          { value: "reviews", label: t("tabs.reviews"), count: reviewAccounts.length },
          { value: "website", label: t("tabs.website") },
        ]}
      />

      <div className="app-workspace-shell !min-h-0 space-y-4 p-3 sm:p-4">
        {insightsTab === "overview" ? (
        <div className="app-workspace-stats grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("tabs.social")}</p>
            <p className="text-xs font-semibold tabular-nums">{socialAccounts.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("tabs.reviews")}</p>
            <p className="text-xs font-semibold tabular-nums">{reviewAccounts.length}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("tabs.marketing")}</p>
            <p className="text-xs font-semibold tabular-nums">{hasMarketing ? t("overview.yes") : "—"}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{t("tabs.website")}</p>
            <p className="text-xs font-semibold tabular-nums">{trackingSite?.siteKey ? t("overview.yes") : "—"}</p>
          </div>
        </div>
        ) : null}

      {insightsTab === "overview" ? <CompaniesOverview /> : null}

      {insightsTab === "website" && businessProfileId ? (
        <section aria-label={t("website.sectionLabel")} className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Globe2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t("sections.website")}
          </h2>
          <SiteAnalyticsSection businessProfileId={businessProfileId} />
        </section>
      ) : null}

      {insightsTab === "overview" && isEmpty ? (
        <Card className="border-dashed border-border bg-muted/10">
          <CardContent className="py-10 text-center space-y-2">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40 mx-auto" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("empty.noHistory")}</p>
            <p className="text-xs text-muted-foreground/80 max-w-sm mx-auto leading-relaxed">
              {t("empty.historyBeforeConnections")}{" "}
              <Link to="/connections" className="text-primary underline underline-offset-2">
                {tCommon("nav.connections")}
              </Link>
              {t("empty.historyBetween")}{" "}
              <Link to="/automations" className="text-primary underline underline-offset-2">
                {tCommon("nav.automations")}
              </Link>
              {t("empty.historyAfter")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {(insightsTab === "social") && (socialAccounts.length > 0 || followerSeries.length >= 2) ? (
        <section aria-label={t("sections.social")} className="space-y-2">
          <SectionHeading
            icon={Share2}
            title={t("sections.social")}
            to="/social-media"
            linkLabel={tCommon("nav.social-media")}
          />
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-info" aria-hidden />
                {t("social.followersTotal")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("social.accountSummary", { count: socialAccounts.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {followerSeries.length >= 2 ? (
                <ChartContainer config={followerChartConfig} className="aspect-[16/9] sm:aspect-[16/5] w-full">
                  <AreaChart data={followerSeries} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="insightsFollowerFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-followers)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-followers)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={(value: number) => compactNumber.format(value)}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      domain={["auto", "auto"]}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(value: string) => formatChartDate(value)}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="followers"
                      stroke="var(--color-followers)"
                      strokeWidth={2}
                      fill="url(#insightsFollowerFill)"
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/70 px-3 py-2.5">
                  {t("social.chartPending")}
                </p>
              )}
              {socialAccounts.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {socialAccounts.map((insight) => (
                    <AccountRow
                      key={insight.accountId}
                      insight={insight}
                      username={usernameByAccountId.get(insight.accountId) ?? null}
                    />
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {insightsTab === "marketing" && hasMarketing ? (
        <section aria-label={t("tabs.marketing")} className="space-y-2">
          <SectionHeading
            icon={Megaphone}
            title={t("sections.marketing")}
            to="/marketing"
            linkLabel={tCommon("nav.marketing")}
          />
          {/* MarketingTrendChart draws its own framed box — no Card wrapper,
              a double border reads as a mistake. */}
          <MarketingTrendChart />
        </section>
      ) : null}

      {insightsTab === "reviews" && reviewAccounts.length > 0 ? (
        <section aria-label={t("sections.reviews")} className="space-y-2">
          <SectionHeading
            icon={Star}
            title={t("sections.reviews")}
            to="/reviews"
            linkLabel={tCommon("nav.reviews")}
          />
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {reviewAccounts.map((insight) => (
              <AccountRow
                key={insight.accountId}
                insight={insight}
                username={usernameByAccountId.get(insight.accountId) ?? null}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {insightsTab === "social" && socialAccounts.length === 0 && followerSeries.length < 2 ? (
        <p className="text-sm text-muted-foreground">{t("social.emptyTab")}</p>
      ) : null}
      {insightsTab === "marketing" && !hasMarketing ? (
        <p className="text-sm text-muted-foreground">{t("marketing.emptyTab")}</p>
      ) : null}
      {insightsTab === "reviews" && reviewAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reviews.emptyTab")}</p>
      ) : null}
      {insightsTab === "website" && !businessProfileId ? (
        <p className="text-sm text-muted-foreground">{t("website.emptyTab")}</p>
      ) : null}
      </div>
    </m.div>
  );
}
