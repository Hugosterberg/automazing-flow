import { Banknote, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/apiBase";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";
import { formatCurrency, formatDateCustom } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFortnoxSummary } from "./useFortnoxSummary";

function startFortnoxConnect(businessProfileId: string | null) {
  const params = new URLSearchParams();
  params.set("app_origin", window.location.origin);
  appendOAuthProfileParams(params, businessProfileId);
  window.location.href = `${apiUrl("/api/auth/fortnox")}?${params.toString()}`;
}

function dueLabel(dueDate: string): string {
  if (!dueDate) return "";
  return formatDateCustom(`${dueDate}T12:00:00`, { day: "numeric", month: "short" });
}

/**
 * Fortnox bookkeeping snapshot: unpaid and overdue customer invoices with a
 * connect CTA when the profile has no Fortnox account. Read-only — replaces
 * the manual "log in to Fortnox to check what's outstanding" round-trip.
 */
export function FortnoxCard({ businessProfileId }: { businessProfileId: string | null }) {
  const { overview, isLoading, refetch } = useFortnoxSummary(businessProfileId);
  const today = new Date().toLocaleDateString("sv-SE");

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-4 w-4 text-primary" />
              Fakturor från Fortnox
            </CardTitle>
            <CardDescription>
              {overview?.connected
                ? `${overview.companyName} · obetalda kundfakturor utan inloggning i Fortnox.`
                : "Koppla Fortnox så bevakar automazing obetalda och förfallna kundfakturor åt dig."}
            </CardDescription>
          </div>
          {overview?.connected ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void refetch()}
              aria-label="Uppdatera fakturor"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar fakturaläget…
          </div>
        ) : !overview?.connected ? (
          <div className="space-y-2">
            <Button type="button" onClick={() => startFortnoxConnect(businessProfileId)}>
              Koppla Fortnox
            </Button>
            <p className="text-xs text-muted-foreground">
              Läsbehörighet till fakturor och företagsinformation. Förfallna fakturor dyker upp i
              Dagens brief så inget faller mellan stolarna.
            </p>
          </div>
        ) : overview.error ? (
          <div className="space-y-2">
            <p className="text-sm text-warning">
              {overview.error === "fortnox_token_expired"
                ? "Fortnox-kopplingen har gått ut — koppla om för att fortsätta bevaka fakturor."
                : "Kunde inte hämta fakturor från Fortnox just nu."}
            </p>
            {overview.error === "fortnox_token_expired" ? (
              <Button type="button" variant="outline" size="sm" onClick={() => startFortnoxConnect(businessProfileId)}>
                Koppla om Fortnox
              </Button>
            ) : null}
          </div>
        ) : overview.summary ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-xs text-muted-foreground">Obetalda</p>
                <p className="text-lg font-semibold tabular-nums">{overview.summary.unpaidCount}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(overview.summary.unpaidSum, overview.summary.currency)}
                </p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-2.5",
                  overview.summary.overdueCount > 0
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border/60"
                )}
              >
                <p className="text-xs text-muted-foreground">Förfallna</p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    overview.summary.overdueCount > 0 && "text-destructive"
                  )}
                >
                  {overview.summary.overdueCount}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(overview.summary.overdueSum, overview.summary.currency)}
                </p>
              </div>
            </div>

            {overview.summary.invoices.length > 0 ? (
              <ul className="space-y-1">
                {overview.summary.invoices.map((invoice) => {
                  const overdue = Boolean(invoice.dueDate) && invoice.dueDate < today;
                  return (
                    <li
                      key={invoice.invoiceNumber}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {invoice.customerName || `Faktura ${invoice.invoiceNumber}`}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {overdue ? (
                          <Badge variant="destructive" className="text-[10px]">
                            förföll {dueLabel(invoice.dueDate)}
                          </Badge>
                        ) : invoice.dueDate ? (
                          <span className="text-xs text-muted-foreground">
                            förfaller {dueLabel(invoice.dueDate)}
                          </span>
                        ) : null}
                        <span className="tabular-nums text-xs">
                          {formatCurrency(invoice.balance, invoice.currency)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Inga obetalda kundfakturor — allt är betalt. 🎉
              </p>
            )}

            <a
              href="https://apps.fortnox.se"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Öppna Fortnox
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
