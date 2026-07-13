import { Link } from "react-router-dom";
import { Building2, Eye, ShoppingBag, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/features/marketing/format";
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
  const { companies } = useCompaniesOverview();
  if (companies.length < 2) return null;

  return (
    <section aria-label="Alla företag" className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
        Alla företag · senaste 7 dagarna
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {companies.map((company) => (
          <Card key={company.businessProfileId} className="border-border">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground truncate">{company.name}</p>
              <div className="grid grid-cols-3 gap-3">
                <Metric
                  icon={Eye}
                  label="Besökare"
                  value={company.visitors7d.toLocaleString("sv-SE")}
                  hint={`${company.pageviews7d.toLocaleString("sv-SE")} sidvisningar`}
                />
                <Metric
                  icon={ShoppingBag}
                  label="Försäljning"
                  value={company.revenue != null ? formatMoney(company.revenue, company.currency) : "—"}
                  hint={
                    company.orders != null
                      ? `${company.orders.toLocaleString("sv-SE")} ordrar`
                      : undefined
                  }
                />
                <Metric
                  icon={Users}
                  label="Följare"
                  value={company.followers != null ? company.followers.toLocaleString("sv-SE") : "—"}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground/80">
        Byt aktiv profil i sidhuvudet för att fördjupa dig i ett företag.{" "}
        <Link to="/connections" className="underline underline-offset-2 hover:text-foreground">
          Koppla fler källor
        </Link>{" "}
        för att fylla på siffrorna.
      </p>
    </section>
  );
}
