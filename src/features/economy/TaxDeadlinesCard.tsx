import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useProfileDocument } from "@/features/profile-documents";
import { formatDateCustom } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TAX_SETTINGS,
  upcomingTaxDeadlines,
  type TaxDeadline,
  type TaxSettings,
} from "@/lib/taxDeadlines";

const KIND_LABELS: Record<TaxDeadline["kind"], string> = {
  moms: "Momsdeklaration",
  agi: "Arbetsgivardeklaration",
  arsredovisning: "Årsredovisning",
  inkomstdeklaration: "Inkomstdeklaration",
};

const AGENCY_LABELS: Record<TaxDeadline["agency"], string> = {
  skatteverket: "Skatteverket",
  bolagsverket: "Bolagsverket",
};

const MONTH_OPTIONS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / (24 * 60 * 60 * 1000));
}

/**
 * Viktiga myndighetsdatum (Skatteverket/Bolagsverket) computed from the
 * company's tax settings — moms, AGI, årsredovisning, inkomstdeklaration.
 * Replaces the recurring manual chore of checking Skatteverket's calendar;
 * deadlines ≤7 days away also surface in the Daily Brief.
 */
export function TaxDeadlinesCard() {
  // Fallback null (not defaults) so the Daily Brief can tell "never
  // configured" from "configured with defaults" and stay quiet until then.
  const settingsDoc = useProfileDocument<TaxSettings | null>("tax-settings", null);
  const settings: TaxSettings = { ...DEFAULT_TAX_SETTINGS, ...(settingsDoc.data ?? {}) };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const configured = Boolean(settingsDoc.data);

  const today = new Date().toLocaleDateString("sv-SE");
  const deadlines = useMemo(
    () => upcomingTaxDeadlines(settings, today).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.companyForm, settings.vatPeriod, settings.employer, settings.fiscalYearEndMonth, today]
  );

  function patch(partial: Partial<TaxSettings>) {
    settingsDoc.save({ ...settings, ...partial });
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-primary" />
          Viktiga myndighetsdatum
        </CardTitle>
        <CardDescription>
          Moms, arbetsgivardeklaration, årsredovisning och inkomstdeklaration utifrån era
          inställningar. Datum inom 7 dagar dyker upp i Dagens brief.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1">
          {deadlines.map((deadline) => {
            const days = daysUntil(deadline.date, today);
            const urgent = days <= 7;
            return (
              <li
                key={deadline.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm",
                  urgent ? "border-warning/50 bg-warning/5" : "border-border/50"
                )}
              >
                <span className="min-w-0">
                  <span className="font-medium">{KIND_LABELS[deadline.kind]}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {deadline.periodLabel} · {AGENCY_LABELS[deadline.agency]}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                  <CalendarClock className={cn("h-3.5 w-3.5", urgent ? "text-warning" : "text-muted-foreground")} />
                  {formatDateCustom(`${deadline.date}T12:00:00`, { day: "numeric", month: "short" })}
                  <span className={cn(urgent ? "font-medium text-warning" : "text-muted-foreground")}>
                    {days === 0 ? "idag" : days === 1 ? "imorgon" : `om ${days} dgr`}
                  </span>
                </span>
              </li>
            );
          })}
          {deadlines.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              Inga datum att bevaka — kontrollera inställningarna nedan.
            </li>
          ) : null}
        </ul>

        {!configured ? (
          <p className="rounded-lg border border-info/40 bg-info/5 px-3 py-2 text-xs">
            Datumen ovan utgår från standardinställningar (AB, kvartalsmoms). Öppna inställningarna
            och välj era värden — först då bevakas datumen i Dagens brief.
          </p>
        ) : null}

        <div className="rounded-lg border border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-between px-3 text-xs"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
          >
            Inställningar (bolagsform, moms, arbetsgivare)
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", settingsOpen && "rotate-180")} />
          </Button>
          {settingsOpen ? (
            <div className="grid gap-3 border-t border-border/60 p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Bolagsform</Label>
                <Select
                  value={settings.companyForm}
                  onValueChange={(value) => patch({ companyForm: value as TaxSettings["companyForm"] })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ab">Aktiebolag</SelectItem>
                    <SelectItem value="enskild">Enskild firma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Momsperiod</Label>
                <Select
                  value={settings.vatPeriod}
                  onValueChange={(value) => patch({ vatPeriod: value as TaxSettings["vatPeriod"] })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Varje månad</SelectItem>
                    <SelectItem value="quarterly">Kvartal</SelectItem>
                    <SelectItem value="yearly">Helår</SelectItem>
                    <SelectItem value="none">Ej momsregistrerad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Räkenskapsåret slutar</Label>
                <Select
                  value={String(settings.fiscalYearEndMonth)}
                  onValueChange={(value) => patch({ fiscalYearEndMonth: Number(value) })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map((label, index) => (
                      <SelectItem key={label} value={String(index + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2">
                <Label htmlFor="tax-employer" className="text-xs">
                  Har anställda (AGI varje månad)
                </Label>
                <Switch
                  id="tax-employer"
                  checked={settings.employer}
                  onCheckedChange={(checked) => patch({ employer: checked })}
                />
              </div>
            </div>
          ) : null}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Vägledande datum enligt Skatteverkets och Bolagsverkets regler (deklarationsdag 12:e,
          17:e i jan/aug; helger rullas framåt). Dubbelkolla alltid mot{" "}
          <a
            href="https://www.skatteverket.se/foretag/drivaforetag/viktigadatumforforetag"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-foreground"
          >
            skatteverket.se
          </a>
          .
        </p>
      </CardContent>
    </Card>
  );
}
