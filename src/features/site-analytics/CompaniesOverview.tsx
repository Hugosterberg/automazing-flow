import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Eye, ShoppingBag, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/features/marketing/format";
import { formatNumber } from "@/lib/format";
import { useCompaniesOverview } from "./useSiteAnalytics";

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p className="text-sm font-semibold tabular-nums truncate" title={value}>
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] text-muted-foreground/80 truncate" title={hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Alla företag" — one row per business profile the user belongs to, with the
 * last 7 days of website visitors, store sales (Shopify via the marketing
 * snapshots) and total followers. Skipped entirely with fewer than two
 * companies — the rest of the Insights page already covers the single-company
 * case in more depth.
 */
export function CompaniesOverview() {
  const { t } = useTranslation("insights");
  const { companies } = useCompaniesOverview();
  if (companies.length < 2) return null;

  return (
    <section aria-label={t("companiesOverview.ariaLabel")} className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t("companiesOverview.heading")}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {companies.map((company) => (
          <Card key={company.businessProfileId} className="border-border">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground truncate">{company.name}</p>
              <div className="grid grid-cols-3 gap-3">
                <Metric
                  icon={Eye}
                  label={t("companiesOverview.visitors")}
                  value={formatNumber(company.visitors7d)}
                  hint={t("companiesOverview.pageviewsHint", { count: company.pageviews7d })}
                />
                <Metric
                  icon={ShoppingBag}
                  label={t("companiesOverview.sales")}
                  value={company.revenue != null ? formatMoney(company.revenue, company.currency) : "—"}
                  hint={
                    company.orders != null
                      ? t("companiesOverview.ordersHint", { count: company.orders })
                      : undefined
                  }
                />
                <Metric
                  icon={Users}
                  label={t("companiesOverview.followers")}
                  value={company.followers != null ? formatNumber(company.followers) : "—"}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground/80">
        {t("companiesOverview.footerBefore")}{" "}
        <Link to="/connections" className="underline underline-offset-2 hover:text-foreground">
          {t("companiesOverview.footerLink")}
        </Link>{" "}
        {t("companiesOverview.footerAfter")}
      </p>
    </section>
  );
}
