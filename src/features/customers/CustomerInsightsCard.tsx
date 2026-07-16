import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Users, Mail, Sigma } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { summarizeCustomers } from "./customerInsights";
import { formatNumber as formatNumberBase } from "@/lib/format";

function formatNumber(n: number): string {
  return formatNumberBase(n, { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}

/** At-a-glance insights over the uploaded customer list (totals, emails, sums). */
export function CustomerInsightsCard({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Record<string, string>>;
}) {
  const { t } = useTranslation("customers");
  const insights = useMemo(() => summarizeCustomers(columns, rows), [columns, rows]);
  if (insights.total === 0) return null;

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Users className="h-4 w-4 text-primary mb-1.5" aria-hidden />
            <p className="text-2xl font-semibold tabular-nums">{formatNumber(insights.total)}</p>
            <p className="text-xs text-muted-foreground">{t("insights.customers")}</p>
          </div>
          {insights.emailColumn ? (
            <div>
              <Mail className="h-4 w-4 text-info mb-1.5" aria-hidden />
              <p className="text-2xl font-semibold tabular-nums">{formatNumber(insights.emailCount)}</p>
              <p className="text-xs text-muted-foreground">{t("insights.withEmail")}</p>
            </div>
          ) : null}
          {insights.numericColumns.slice(0, insights.emailColumn ? 2 : 3).map((c) => (
            <div key={c.name}>
              <Sigma className="h-4 w-4 text-success mb-1.5" aria-hidden />
              <p className="text-2xl font-semibold tabular-nums">{formatNumber(c.sum)}</p>
              <p className="text-xs text-muted-foreground truncate" title={t("insights.sumColumnTitle", { name: c.name, avg: formatNumber(c.avg) })}>
                {t("insights.sumColumn", { name: c.name })}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
