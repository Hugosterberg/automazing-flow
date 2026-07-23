import { useEffect, useState } from "react";
import { History, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateCustom } from "@/lib/format";
import { fetchFortnoxInvoiceHistory, type FortnoxInvoiceRow } from "./economyClient";

type StatusFilter = "all" | "unpaid" | "paid" | "cancelled";

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "Alla",
  unpaid: "Obetalda",
  paid: "Betalda",
  cancelled: "Makulerade",
};

/** Browse/search the full Fortnox invoice history — not just the unpaid summary. */
export function FortnoxInvoiceHistoryCard({ businessProfileId }: { businessProfileId: string | null }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [invoices, setInvoices] = useState<FortnoxInvoiceRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessProfileId) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    let ignore = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchFortnoxInvoiceHistory(businessProfileId, { status, query: query.trim() || undefined })
        .then((result) => {
          if (ignore) return;
          setConnected(result.connected);
          setInvoices(result.invoices);
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [businessProfileId, status, query]);

  if (!businessProfileId || !connected) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Fakturahistorik
        </CardTitle>
        <CardDescription>Bläddra och sök i alla fakturor från Fortnox, inte bara obetalda.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök kund eller fakturanummer…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-full text-sm sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {STATUS_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Söker…
          </div>
        ) : invoices.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Inga fakturor matchar.</p>
        ) : (
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {invoices.map((invoice) => (
              <li
                key={invoice.invoiceNumber}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate">
                  {invoice.invoiceNumber} · {invoice.customerName || "Okänd kund"}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {invoice.dueDate ? (
                    <span className="text-xs text-muted-foreground">{formatDateCustom(`${invoice.dueDate}T12:00:00`, { day: "numeric", month: "short" })}</span>
                  ) : null}
                  <span className="tabular-nums text-xs">{formatCurrency(invoice.total, invoice.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
