import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Loader2, UserPlus, Building2, CalendarClock, Globe, Upload, Download, Target, Pencil, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SearchHighlight } from "@/features/messages/SearchHighlight";
import { dateInputToEndOfDayIso, isoToLocalDateInputValue } from "@/lib/localDate";
import { useLeads } from "./useLeads";
import type { Lead } from "./leadsService";
import { LeadResearchDialog, type LeadResearchTarget } from "@/features/intelligence";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_ORDER,
  compareLeads,
  isFollowUpDueToday,
  isFollowUpOverdue,
  isLeadOpen,
  leadStaleDays,
  type LeadStatus,
  suggestedFollowUpIsoForStatus,
} from "./leadHelpers";
import { enrichLead, fetchLeadSuggestions, type LeadSuggestion, type LeadSuggestionInput } from "./leadSuggestionsClient";
import { applyEnrichmentToLeadForm } from "@/features/business-profiles/companyEnrichmentClient";
import { LeadAutoFillFields } from "./LeadAutoFillFields";
import { parseLeadsCsv, leadsToCsv } from "./parseLeadsCsv";
import { LeadEditDialog } from "./LeadEditDialog";
import type { OutreachDraftTarget } from "@/features/outreach";
import type { OutreachDraftInput } from "@/features/outreach";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_TONE: Record<LeadStatus, string> = {
  new: "text-info",
  contacted: "text-primary",
  qualified: "text-warning",
  won: "text-success",
  lost: "text-muted-foreground",
};

const EMPTY_FORM = {
  company: "",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  orgNumber: "",
  notes: "",
  nextFollowUpAt: "",
};

interface Props {
  businessProfileId: string | null;
  /** Business context used to seed AI outreach suggestions. */
  context?: LeadSuggestionInput;
  /** When true, suggestions are shown in LeadSuggestionsSection instead. */
  hideSuggestionPanel?: boolean;
  /** Seller profile for personalized outreach drafts. */
  sellerContext?: Omit<OutreachDraftInput, "business_profile_id" | "channel" | keyof OutreachDraftTarget>;
  /** When true, only leads with follow-up due today or overdue are shown. */
  followUpsOnly?: boolean;
  /** Opens the sales pipeline dialog prefilled from this lead. */
  onAddToPipeline?: (lead: Lead) => void;
  /** Opens a shared outreach draft dialog (parent should mount OutreachDraftDialog). */
  onDraftOutreach?: (target: OutreachDraftTarget) => void;
  /** Start drafting outreach for due follow-ups (parent queues leads). */
  onDraftDueLeads?: () => void;
  /** Parent can call this to open the add-lead dialog (e.g. from SalesActionHub). */
  onRegisterAddOpener?: (open: () => void) => void;
}

function LeadRow({
  lead,
  searchQuery = "",
  onStatus,
  onFollowUp,
  onDelete,
  onResearch,
  onAddToPipeline,
  onEdit,
  onDraftOutreach,
}: {
  lead: Lead;
  searchQuery?: string;
  onStatus: (status: LeadStatus) => void;
  onFollowUp: (value: string) => void;
  onDelete: () => void;
  onResearch: () => void;
  onAddToPipeline?: () => void;
  onEdit?: () => void;
  onDraftOutreach?: () => void;
}) {
  const overdue = isFollowUpOverdue(lead.nextFollowUpAt);
  const dueToday = isFollowUpDueToday(lead.nextFollowUpAt);
  const staleDays = leadStaleDays(lead);
  const contactLine =
    [lead.contactName, lead.email, lead.phone].filter(Boolean).join(" · ") ||
    (lead.notes ? lead.notes.slice(0, 80) : "Inga kontaktuppgifter än");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          <p className="text-sm font-medium text-foreground truncate">
            <SearchHighlight text={lead.company} query={searchQuery} />
          </p>
          {staleDays != null ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"
              title={`Ingen aktivitet på ${staleDays} dagar och ingen uppföljning planerad — hör av dig eller sätt ett datum.`}
            >
              <CalendarClock className="h-2.5 w-2.5" aria-hidden />
              Inaktiv · {staleDays}d
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          <SearchHighlight text={contactLine} query={searchQuery} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0 overflow-x-auto app-scroll pb-0.5 sm:overflow-visible sm:pb-0">
        <Select value={lead.status} onValueChange={(v) => onStatus(v as LeadStatus)}>
          <SelectTrigger className={cn("h-8 w-full min-w-[108px] text-xs sm:w-[120px]", STATUS_TONE[lead.status])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {LEAD_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Input
            type="date"
            aria-label={`Uppföljningsdatum för ${lead.company}`}
            value={lead.nextFollowUpAt ? isoToLocalDateInputValue(lead.nextFollowUpAt) : ""}
            onChange={(e) => onFollowUp(e.target.value)}
            className={cn(
              "h-8 w-full min-w-[130px] text-xs sm:w-[150px]",
              overdue && "border-destructive text-destructive",
              dueToday && "border-warning text-warning",
            )}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onResearch}
          title={`Researcha ${lead.company} via din kopplade research-leverantör`}
          aria-label={`Researcha ${lead.company}`}
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
        {onDraftOutreach ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={onDraftOutreach}
            title={`Skriv utkast till ${lead.company}`}
            aria-label={`Skriv utkast till ${lead.company}`}
          >
            <Mail className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {onAddToPipeline ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={onAddToPipeline}
            title={`Lägg till ${lead.company} i pipelinen`}
            aria-label={`Lägg till ${lead.company} i pipelinen`}
          >
            <Target className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {onEdit ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onEdit}
            title={`Redigera ${lead.company}`}
            aria-label={`Redigera ${lead.company}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function LeadsSection({
  businessProfileId,
  context,
  hideSuggestionPanel = false,
  sellerContext,
  followUpsOnly = false,
  onAddToPipeline,
  onDraftOutreach,
  onDraftDueLeads,
  onRegisterAddOpener,
}: Props) {
  const { leads, isLoading, createLead, updateLead, deleteLead, importLeads, isImporting } =
    useLeads(businessProfileId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { leads: parsed, skipped } = parseLeadsCsv(text);
      if (parsed.length === 0) {
        toast.error("Inga leads hittades i filen. Förväntar en rubrikrad med kolumn för företag.");
        return;
      }
      const count = await importLeads(parsed);
      toast.success(`Importerade ${count} lead${count === 1 ? "" : "s"}${skipped ? ` (${skipped} hoppades över)` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte importera filen.");
    }
  }

  function exportCsv() {
    if (leads.length === 0) return;
    const blob = new Blob([leadsToCsv(leads)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    onRegisterAddOpener?.(() => setAddOpen(true));
  }, [onRegisterAddOpener]);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [researchTarget, setResearchTarget] = useState<LeadResearchTarget | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<LeadSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestSource, setSuggestSource] = useState<string>("");
  const [enriching, setEnriching] = useState(false);

  async function autofillLead() {
    const url = form.website.trim();
    const orgNumber = form.orgNumber.trim();
    const company = form.company.trim();
    if (!url && !orgNumber && !company) return;
    setEnriching(true);
    try {
      const meta = await enrichLead({
        url: url || undefined,
        orgNumber: orgNumber || undefined,
        company: company || undefined,
        business_profile_id: businessProfileId,
      });
      setForm((f) => applyEnrichmentToLeadForm(f, meta));
      const sources = meta.sources?.filter((s) => s.status === "success").length ?? 0;
      if (!meta.company && !meta.description && sources === 0) {
        toast.message("Ingen data hittades.");
      } else {
        toast.success(sources > 0 ? `Hämtade från ${sources} källa${sources === 1 ? "" : "r"}` : "Ifyllt från uppslag");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppslag misslyckades.");
    } finally {
      setEnriching(false);
    }
  }

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");

  const sortedLeads = useMemo(() => [...leads].sort(compareLeads), [leads]);
  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedLeads.filter((l) => {
      if (followUpsOnly && !isFollowUpOverdue(l.nextFollowUpAt) && !isFollowUpDueToday(l.nextFollowUpAt)) {
        return false;
      }
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.company, l.contactName, l.email].some((v) => v?.toLowerCase().includes(q));
    });
  }, [sortedLeads, search, statusFilter, followUpsOnly]);
  const showToolbar = leads.length > 4 || followUpsOnly;
  const openCount = leads.filter((l) => l.status !== "won" && l.status !== "lost").length;
  const followUpDue = leads.filter(
    (l) => isFollowUpOverdue(l.nextFollowUpAt) || isFollowUpDueToday(l.nextFollowUpAt),
  ).length;

  async function submitLead() {
    if (!form.company.trim()) return;
    setSaving(true);
    try {
      await createLead({
        company: form.company,
        contactName: form.contactName || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website.trim() || null,
        orgNumber: form.orgNumber.trim() || null,
        notes: form.notes || null,
        nextFollowUpAt: form.nextFollowUpAt
          ? dateInputToEndOfDayIso(form.nextFollowUpAt)
          : suggestedFollowUpIsoForStatus("new"),
        source: "manual",
      });
      setForm({ ...EMPTY_FORM });
      setAddOpen(false);
      toast.success("Lead tillagd");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte lägga till lead.");
    } finally {
      setSaving(false);
    }
  }

  const getSuggestions = useCallback(async () => {
    setSuggesting(true);
    try {
      const result = await fetchLeadSuggestions({
        business_profile_id: businessProfileId,
        ...context,
      });
      setSuggestions(result.suggestions);
      setSuggestSource(result.source);
      if (result.suggestions.length === 0) toast.message("Inga förslag — försök igen eller fyll i mer under Företag.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte hämta förslag.");
    } finally {
      setSuggesting(false);
    }
  }, [businessProfileId, context]);

  const autoSuggestedRef = useRef(false);
  useEffect(() => {
    if (hideSuggestionPanel) return;
    if (autoSuggestedRef.current || isLoading || leads.length > 0 || !businessProfileId) return;
    autoSuggestedRef.current = true;
    void getSuggestions();
  }, [hideSuggestionPanel, isLoading, leads.length, businessProfileId, getSuggestions]);

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    const patch: Parameters<typeof updateLead>[0]["patch"] = { status };
    if (isLeadOpen(status) && !lead.nextFollowUpAt) {
      const suggested = suggestedFollowUpIsoForStatus(status);
      if (suggested) patch.nextFollowUpAt = suggested;
    }
    try {
      await updateLead({ id: lead.id, patch });
      if (patch.nextFollowUpAt) {
        toast.message("Uppföljningsdatum sattes automatiskt.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte uppdatera lead.");
    }
  }

  async function addSuggestionAsLead(s: LeadSuggestion) {
    try {
      await createLead({
        company: s.target,
        notes: [s.why, s.how].filter(Boolean).join("\n\n"),
        source: "ai-suggestion",
        status: "new",
      });
      setSuggestions((prev) => prev.filter((x) => x.target !== s.target));
      toast.success("Tillagd som lead");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte lägga till lead.");
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Leads
            </CardTitle>
            <CardDescription>
              {openCount} öppna
              {followUpDue > 0 ? ` · ${followUpDue} uppföljning${followUpDue === 1 ? "" : "ar"} att göra` : ""}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => void handleCsvFile(e)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting || !businessProfileId}
              title="Importera leads från CSV"
            >
              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span className="ml-1.5 hidden sm:inline">Importera</span>
            </Button>
            {leads.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={exportCsv} title="Exportera leads till CSV">
                <Download className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">Exportera</span>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (hideSuggestionPanel) {
                  document.getElementById("lead-suggestions")?.scrollIntoView({ behavior: "smooth" });
                  return;
                }
                void getSuggestions();
              }}
              disabled={suggesting && !hideSuggestionPanel}
            >
              {suggesting && !hideSuggestionPanel ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Föreslå segment
            </Button>
            {followUpDue > 0 && onDraftDueLeads ? (
              <Button size="sm" variant="default" onClick={onDraftDueLeads}>
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Utkast ({followUpDue})
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!businessProfileId}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Ny lead
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hideSuggestionPanel && suggestions.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Vem ni kan kontakta {suggestSource === "heuristic" ? "(allmänna idéer)" : ""}
            </p>
            {suggestions.map((s) => (
              <div key={s.target} className="flex items-start justify-between gap-3 rounded-md bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{s.target}</p>
                  {s.why ? <p className="text-xs text-muted-foreground mt-0.5">{s.why}</p> : null}
                  {s.how ? <p className="text-[11px] text-muted-foreground/80 mt-0.5">→ {s.how}</p> : null}
                </div>
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void addSuggestionAsLead(s)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Lägg till
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {showToolbar ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <Input
                id="sales-leads-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök företag, kontakt, e-post…"
                aria-label="Sök leads"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Alla statusar</SelectItem>
                {LEAD_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {LEAD_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar leads…
          </div>
        ) : sortedLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <CalendarClock className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Inga leads än. Lägg till en, eller låt AI föreslå vem ni kan kontakta.
            </p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Inga leads matchar filtren.</p>
        ) : (
          <div className="space-y-2">
            {filteredLeads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                searchQuery={search}
                onStatus={(status) => void handleStatusChange(lead, status)}
                onFollowUp={async (value) => {
                  try {
                    await updateLead({
                      id: lead.id,
                      patch: { nextFollowUpAt: value ? dateInputToEndOfDayIso(value) : null },
                    });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Kunde inte uppdatera uppföljningsdatum.");
                  }
                }}
                onDelete={() => setLeadToDelete(lead)}
                onResearch={() =>
                  setResearchTarget({
                    company: lead.company,
                    name: lead.contactName ?? undefined,
                    website: lead.website ?? undefined,
                  })
                }
                onAddToPipeline={onAddToPipeline ? () => onAddToPipeline(lead) : undefined}
                onEdit={() => {
                  setEditLead(lead);
                  setEditOpen(true);
                }}
                onDraftOutreach={
                  onDraftOutreach
                    ? () => {
                        onDraftOutreach({
                          prospectCompany: lead.company,
                          prospectContact: lead.contactName ?? undefined,
                          prospectEmail: lead.email ?? undefined,
                          prospectWebsite: lead.website ?? undefined,
                          prospectNotes: lead.notes ?? undefined,
                        });
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </CardContent>

      <LeadResearchDialog
        businessProfileId={businessProfileId}
        target={researchTarget}
        onOpenChange={(open) => {
          if (!open) setResearchTarget(null);
        }}
      />

      <LeadEditDialog
        lead={editLead}
        open={editOpen}
        businessProfileId={businessProfileId}
        onOpenChange={setEditOpen}
        onSave={async (id, patch) => {
          await updateLead({ id, patch });
          toast.success("Lead uppdaterad.");
        }}
      />

      <AlertDialog open={Boolean(leadToDelete)} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta bort {leadToDelete?.company || "denna lead"} från CRM. Det går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!leadToDelete) return;
                void deleteLead(leadToDelete.id)
                  .then(() => toast.success("Lead borttagen"))
                  .catch((error) => toast.error(error instanceof Error ? error.message : "Kunde inte ta bort lead."));
                setLeadToDelete(null);
              }}
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny lead</DialogTitle>
            <DialogDescription>Ett företag eller en kontakt att följa upp.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <LeadAutoFillFields
              form={{ orgNumber: form.orgNumber, company: form.company, website: form.website }}
              loading={enriching}
              onLookup={() => void autofillLead()}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
            <div className="space-y-1.5">
              <Label htmlFor="lead-company">Företag *</Label>
              <Input
                id="lead-company"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Företagsnamn"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-contact">Kontakt</Label>
                <Input
                  id="lead-contact"
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-followup">Följ upp</Label>
                <Input
                  id="lead-followup"
                  type="date"
                  value={form.nextFollowUpAt}
                  onChange={(e) => setForm((f) => ({ ...f, nextFollowUpAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">E-post</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Telefon</Label>
                <Input
                  id="lead-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Anteckningar</Label>
              <Textarea
                id="lead-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Varför de passar, nästa steg…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={() => void submitLead()} disabled={saving || !form.company.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Spara lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
