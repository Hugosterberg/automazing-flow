import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutomationEnableHint } from "@/features/automation/AutomationEnableHint";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import {
  createFortnoxInvoiceFromOrder,
  dismissFortnoxInvoiceSuggestion,
  fetchFortnoxInvoiceQueue,
  type FortnoxInvoiceQueueItem,
} from "./economyClient";

/**
 * Suggested Fortnox invoices for paid + fulfilled Shopify orders that
 * haven't been billed yet (populated by the fortnox-invoice-suggest cron).
 * Nothing is created in Fortnox until the user explicitly approves a row —
 * this is a real financial action, so it never happens automatically.
 */
export function FortnoxInvoiceQueueCard({ businessProfileId }: { businessProfileId: string | null }) {
  const [queue, setQueue] = useState<FortnoxInvoiceQueueItem[]>([]);
  const [loading, setLoading] = useState(() => Boolean(businessProfileId));
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessProfileId) {
      setQueue([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchFortnoxInvoiceQueue(businessProfileId);
      setQueue(list);
    } finally {
      setLoading(false);
    }
  }, [businessProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(item: FortnoxInvoiceQueueItem) {
    if (!businessProfileId) return;
    setBusyOrderId(item.orderId);
    try {
      const result = await createFortnoxInvoiceFromOrder(businessProfileId, item.orderId);
      if (!result.ok) {
        toast.error(`Kunde inte skapa fakturan: ${result.error || "okänt fel"}`);
        await load();
        return;
      }
      toast.success(`Faktura ${result.invoiceNumber} skapad i Fortnox.`);
      setQueue((prev) => prev.filter((q) => q.orderId !== item.orderId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skapa fakturan.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleDismiss(item: FortnoxInvoiceQueueItem) {
    if (!businessProfileId) return;
    setBusyOrderId(item.orderId);
    try {
      await dismissFortnoxInvoiceSuggestion(businessProfileId, item.orderId);
      setQueue((prev) => prev.filter((q) => q.orderId !== item.orderId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte avfärda förslaget.");
    } finally {
      setBusyOrderId(null);
    }
  }

  if (!businessProfileId) return null;

  if (!loading && queue.length === 0) {
    return (
      <AutomationEnableHint
        compact
        tab="reports"
        focus="fortnox-invoice-suggest"
        title="Få fakturaförslag automatiskt"
        description="Aktivera jobbet som föreslår Fortnox-fakturor för betalda, levererade Shopify-ordrar — du godkänner innan något skapas."
        ctaLabel="Öppna Automationer"
      />
    );
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          Fakturaförslag från Shopify
        </CardTitle>
        <CardDescription>
          Betalda och skickade ordrar som inte fakturerats i Fortnox än. Du väljer vilka som blir riktiga fakturor.
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
              key={item.orderId}
              className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.orderName} · {item.customerName || item.customerEmail}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(item.total, item.currency)}
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
                  disabled={busyOrderId === item.orderId}
                  onClick={() => void handleDismiss(item)}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Avfärda
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={busyOrderId === item.orderId}
                  onClick={() => void handleCreate(item)}
                >
                  {busyOrderId === item.orderId ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : null}
                  Skapa faktura
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
