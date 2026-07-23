import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDateCustom } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  createFortnoxSupplierInvoice,
  fetchFortnoxSupplierInvoices,
  type FortnoxSupplierInvoiceSummary,
} from "./economyClient";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Accounts-payable overview (what we owe suppliers) + a manual "create
 * supplier invoice" flow. There's no automated source of supplier invoice
 * data yet (e.g. Alibaba imports don't carry a purchase cost), so entry is
 * always explicit here.
 */
export function FortnoxSupplierInvoicesCard({ businessProfileId }: { businessProfileId: string | null }) {
  const [summary, setSummary] = useState<FortnoxSupplierInvoiceSummary | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplierName: "",
    invoiceNumber: "",
    invoiceDate: todayIso(),
    dueDate: todayIso(),
    total: "",
  });

  const load = useCallback(async () => {
    if (!businessProfileId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchFortnoxSupplierInvoices(businessProfileId);
      setConnected(result.connected);
      setSummary(result.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [businessProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!businessProfileId) return;
    const total = parseFloat(form.total.replace(",", "."));
    if (!form.supplierName.trim() || !form.invoiceNumber.trim() || !Number.isFinite(total) || total <= 0) {
      toast.error("Fyll i leverantör, fakturanummer och ett giltigt belopp.");
      return;
    }
    setSaving(true);
    try {
      const result = await createFortnoxSupplierInvoice(businessProfileId, {
        supplierName: form.supplierName.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate,
        total,
      });
      if (!result.ok) {
        toast.error(`Kunde inte skapa leverantörsfakturan: ${result.error || "okänt fel"}`);
        return;
      }
      toast.success(`Leverantörsfaktura ${result.givenNumber} skapad i Fortnox.`);
      setDialogOpen(false);
      setForm({ supplierName: "", invoiceNumber: "", invoiceDate: todayIso(), dueDate: todayIso(), total: "" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skapa leverantörsfakturan.");
    } finally {
      setSaving(false);
    }
  }

  if (!businessProfileId || !connected) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4 text-primary" />
              Leverantörsfakturor
            </CardTitle>
            <CardDescription>Vad ni ska betala till leverantörer — registrerat direkt i Fortnox.</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Ny faktura
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar leverantörsfakturor…
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-xs text-muted-foreground">Obetalda</p>
                <p className="text-lg font-semibold tabular-nums">{summary.unpaidCount}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(summary.unpaidSum, summary.currency)}</p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-2.5",
                  summary.overdueCount > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/60"
                )}
              >
                <p className="text-xs text-muted-foreground">Förfallna</p>
                <p className={cn("text-lg font-semibold tabular-nums", summary.overdueCount > 0 && "text-destructive")}>
                  {summary.overdueCount}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(summary.overdueSum, summary.currency)}</p>
              </div>
            </div>
            {summary.invoices.length > 0 ? (
              <ul className="space-y-1">
                {summary.invoices.map((invoice) => {
                  const overdue = Boolean(invoice.dueDate) && invoice.dueDate < todayIso();
                  return (
                    <li
                      key={invoice.givenNumber}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-2.5 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">{invoice.supplierName || `Faktura ${invoice.givenNumber}`}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {overdue ? (
                          <Badge variant="destructive" className="text-[10px]">
                            förföll {formatDateCustom(`${invoice.dueDate}T12:00:00`, { day: "numeric", month: "short" })}
                          </Badge>
                        ) : null}
                        <span className="tabular-nums text-xs">{formatCurrency(invoice.balance, invoice.currency)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Inga obetalda leverantörsfakturor.</p>
            )}
          </>
        ) : null}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ny leverantörsfaktura</DialogTitle>
            <DialogDescription>Registreras direkt i Fortnox — ingen granskningskö för det här.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-name">Leverantör</Label>
              <Input
                id="supplier-name"
                value={form.supplierName}
                onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-invoice-number">Fakturanummer (leverantörens eget)</Label>
              <Input
                id="supplier-invoice-number"
                value={form.invoiceNumber}
                onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-invoice-date">Fakturadatum</Label>
                <Input
                  id="supplier-invoice-date"
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-due-date">Förfallodatum</Label>
                <Input
                  id="supplier-due-date"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-total">Belopp (SEK)</Label>
              <Input
                id="supplier-total"
                inputMode="decimal"
                placeholder="0.00"
                value={form.total}
                onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Avbryt
            </Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Skapa i Fortnox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
