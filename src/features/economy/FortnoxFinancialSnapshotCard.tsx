import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchFortnoxFinancialSnapshot, type FortnoxFinancialSnapshot } from "./economyClient";

/**
 * Approximate P&L/balance snapshot built from Fortnox account balances (BAS
 * chart classes). Deliberately labelled "uppskattat" — it's a quick
 * directional read, not a substitute for Fortnox's own reports.
 */
export function FortnoxFinancialSnapshotCard({ businessProfileId }: { businessProfileId: string | null }) {
  const [snapshot, setSnapshot] = useState<FortnoxFinancialSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessProfileId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    fetchFortnoxFinancialSnapshot(businessProfileId)
      .then((result) => {
        if (ignore) return;
        setConnected(result.connected);
        setSnapshot(result.snapshot ?? null);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [businessProfileId]);

  if (!businessProfileId || !connected || (!loading && !snapshot)) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Ekonomisk översikt (uppskattad)
        </CardTitle>
        <CardDescription>
          Baserat på kontosaldon i Fortnox innevarande räkenskapsår — en snabb fingervisning, stäm av mot Fortnox egna rapporter för exakta siffror.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !snapshot ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar kontosaldon…
          </div>
        ) : snapshot ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-xs text-muted-foreground">Intäkter</p>
              <p className="text-base font-semibold tabular-nums">{formatCurrency(snapshot.revenue, snapshot.currency)}</p>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-xs text-muted-foreground">Kostnader</p>
              <p className="text-base font-semibold tabular-nums">{formatCurrency(snapshot.costs, snapshot.currency)}</p>
            </div>
            <div
              className={cn(
                "rounded-lg border p-2.5",
                snapshot.resultEstimate >= 0 ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"
              )}
            >
              <p className="text-xs text-muted-foreground">Resultat</p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  snapshot.resultEstimate >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {formatCurrency(snapshot.resultEstimate, snapshot.currency)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-xs text-muted-foreground">Tillgångar</p>
              <p className="text-base font-semibold tabular-nums">{formatCurrency(snapshot.assets, snapshot.currency)}</p>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-xs text-muted-foreground">Eget kapital & skulder</p>
              <p className="text-base font-semibold tabular-nums">
                {formatCurrency(snapshot.equityAndLiabilities, snapshot.currency)}
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
