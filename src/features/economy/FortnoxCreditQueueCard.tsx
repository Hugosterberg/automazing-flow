import { useCallback, useEffect, useState } from "react";
import { Loader2, ReceiptText, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import {
  createFortnoxCreditInvoiceFromRefund,
  dismissFortnoxCreditSuggestion,
  fetchFortnoxCreditQueue,
  type FortnoxCreditQueueItem,
} from "./economyClient";

/**
 * Suggested Fortnox credit invoices for Shopify refunds on orders already
 * billed in Fortnox (populated by the fortnox-refund-credit-suggest cron).
 * Same "suggest, then approve" model as the invoice queue — a credit invoice
 * is a new financial document, so it never gets created without a click.
 */
export function FortnoxCreditQueueCard({ businessProfileId }: { businessProfileId: string | null }) {
  const [queue, setQueue] = useState<FortnoxCreditQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyRefundId, setBusyRefundId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessProfileId) {
      setQueue([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchFortnoxCreditQueue(businessProfileId);
      setQueue(list);
    } finally {
      setLoading(false);
    }
  }, [businessProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  function refundTotal(item: FortnoxCreditQueueItem): number {
    return item.lineItems.reduce((sum, li) => sum + li.subtotal, 0);
  }

  async function handleCreate(item: FortnoxCreditQueueItem) {
    if (!businessProfileId) return;
    setBusyRefundId(item.refundId);
    try {
      const result = await createFortnoxCreditInvoiceFromRefund(businessProfileId, item.refundId);
      if (!result.ok) {
        toast.error(`Kunde inte skapa kreditfakturan: ${result.error || "okänt fel"}`);
        await load();
        return;
      }
      toast.success(`Kreditfaktura ${result.creditInvoiceNumber} skapad i Fortnox.`);
      setQueue((prev) => prev.filter((q) => q.refundId !== item.refundId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skapa kreditfakturan.");
    } finally {
      setBusyRefundId(null);
    }
  }

  async function handleDismiss(item: FortnoxCreditQueueItem) {
    if (!businessProfileId) return;
    setBusyRefundId(item.refundId);
    try {
      await dismissFortnoxCreditSuggestion(businessProfileId, item.refundId);
      setQueue((prev) => prev.filter((q) => q.refundId !== item.refundId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte avfärda förslaget.");
    } finally {
      setBusyRefundId(null);
    }
  }

  if (!businessProfileId || (!loading && queue.length === 0)) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ReceiptText className="h-4 w-4 text-primary" />
          Kreditfakturaförslag
        </CardTitle>
        <CardDescription>
          Shopify-återbetalningar på ordrar som redan har en Fortnox-faktura. Ingen kreditfaktura skapas utan ditt godkännande.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && queue.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar förslag…
          </div>
        ) : (
          queue.map((item) => (
            <div
              key={item.refundId}
              className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.orderName} · mot faktura {item.invoiceReference}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(refundTotal(item), "SEK")}
                  {item.status === "failed" && item.error ? (
                    <span className="ml-2 text-destructive">Misslyckades förra försöket: {item.error}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.status === "failed" ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Försök igen
                  </Badge>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={busyRefundId === item.refundId}
                  onClick={() => void handleDismiss(item)}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Avfärda
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={busyRefundId === item.refundId}
                  onClick={() => void handleCreate(item)}
                >
                  {busyRefundId === item.refundId ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  Skapa kreditfaktura
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
