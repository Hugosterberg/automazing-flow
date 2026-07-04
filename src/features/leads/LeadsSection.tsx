import { useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Sparkles, Plus, Trash2, Loader2, UserPlus, Building2, CalendarClock, Globe, Upload, Download, Target, Pencil } from "lucide-react";
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
import { enrichLeadFromWebsite, fetchLeadSuggestions, type LeadSuggestion } from "./leadSuggestionsClient";
import { parseLeadsCsv, leadsToCsv } from "./parseLeadsCsv";
import { LeadEditDialog } from "./LeadEditDialog";

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
  notes: "",
  nextFollowUpAt: "",
};

interface Props {
  businessProfileId: string | null;
  /** Business context used to seed AI outreach suggestions. */
  context?: { businessName?: string; description?: string; location?: string; sampleCustomers?: string[] };
  /** When true, only leads with follow-up due today or overdue are shown. */
  followUpsOnly?: boolean;
  /** Opens the sales pipeline dialog prefilled from this lead. */
  onAddToPipeline?: (lead: Lead) => void;
}

function LeadRow({
  lead,
  onStatus,
  onFollowUp,
  onDelete,
  onResearch,
  onAddToPipeline,
  onEdit,
}: {
  lead: Lead;
  onStatus: (status: LeadStatus) => void;
  onFollowUp: (value: string) => void;
  onDelete: () => void;
  onResearch: () => void;
  onAddToPipeline?: () => void;
  onEdit?: () => void;
}) {
  const overdue = isFollowUpOverdue(lead.nextFollowUpAt);
  const dueToday = isFollowUpDueToday(lead.nextFollowUpAt);
  const staleDays = leadStaleDays(lead);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          <p className="text-sm font-medium text-foreground truncate">{lead.company}</p>
          {staleDays != null ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"
              title={`No activity for ${staleDays} days and no follow-up planned — reach out or set a date.`}
            >
              <CalendarClock className="h-2.5 w-2.5" aria-hidden />
              Stale · {staleDays}d
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {[lead.contactName, lead.email, lead.phone].filter(Boolean).join(" · ") ||
            (lead.notes ? lead.notes.slice(0, 80) : "No contact details yet")}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Select value={lead.status} onValueChange={(v) => onStatus(v as LeadStatus)}>
          <SelectTrigger className={cn("h-8 w-[120px] text-xs", STATUS_TONE[lead.status])}>
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
            aria-label={`Follow-up date for ${lead.company}`}
            value={lead.nextFollowUpAt ? isoToLocalDateInputValue(lead.nextFollowUpAt) : ""}
            onChange={(e) => onFollowUp(e.target.value)}
            className={cn(
              "h-8 w-[150px] text-xs",
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
          title={`Research ${lead.company} via your connected research provider`}
          aria-label={`Research ${lead.company}`}
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
        {onAddToPipeline ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={onAddToPipeline}
            title={`Add ${lead.company} to pipeline`}
            aria-label={`Add ${lead.company} to pipeline`}
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
            title={`Edit ${lead.company}`}
            aria-label={`Edit ${lead.company}`}
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

export function LeadsSection({ businessProfileId, context, followUpsOnly = false, onAddToPipeline }: Props) {
  const { leads, isLoading, createLead, updateLead, deleteLead, importLeads, isImporting } =
    useLeads(businessProfileId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { leads: parsed, skipped } = parseLeadsCsv(text);
      if (parsed.length === 0) {
        toast.error("No leads found in that file. Expected a header row with a company column.");
        return;
      }
      const count = await importLeads(parsed);
      toast.success(`Imported ${count} lead${count === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't import that file.");
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
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [researchTarget, setResearchTarget] = useState<LeadResearchTarget | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<LeadSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestSource, setSuggestSource] = useState<string>("");
  const [enriching, setEnriching] = useState(false);

  async function autofillFromWebsite() {
    const url = form.website.trim();
    if (!url) return;
    setEnriching(true);
    try {
      const meta = await enrichLeadFromWebsite(url);
      setForm((f) => ({
        ...f,
        website: meta.url || f.website,
        company: f.company.trim() ? f.company : meta.company || f.company,
        notes: f.notes.trim() ? f.notes : meta.description || f.notes,
      }));
      if (!meta.company && !meta.description) toast.message("Nothing useful found on that page.");
      else toast.success("Filled in from website");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that website.");
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
        notes: form.notes || null,
        nextFollowUpAt: form.nextFollowUpAt
          ? dateInputToEndOfDayIso(form.nextFollowUpAt)
          : suggestedFollowUpIsoForStatus("new"),
        source: "manual",
      });
      setForm({ ...EMPTY_FORM });
      setAddOpen(false);
      toast.success("Lead added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the lead.");
    } finally {
      setSaving(false);
    }
  }

  async function getSuggestions() {
    setSuggesting(true);
    try {
      const result = await fetchLeadSuggestions({
        business_profile_id: businessProfileId,
        businessName: context?.businessName,
        description: context?.description,
        location: context?.location,
        sampleCustomers: context?.sampleCustomers,
      });
      setSuggestions(result.suggestions);
      setSuggestSource(result.source);
      if (result.suggestions.length === 0) toast.message("No suggestions came back — try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load suggestions.");
    } finally {
      setSuggesting(false);
    }
  }

  const autoSuggestedRef = useRef(false);
  useEffect(() => {
    if (autoSuggestedRef.current || isLoading || leads.length > 0 || !businessProfileId) return;
    autoSuggestedRef.current = true;
    void getSuggestions();
  }, [isLoading, leads.length, businessProfileId]);

  async function handleStatusChange(lead: Lead, status: LeadStatus) {
    const patch: Parameters<typeof updateLead>[0]["patch"] = { status };
    if (isLeadOpen(status) && !lead.nextFollowUpAt) {
      const suggested = suggestedFollowUpIsoForStatus(status);
      if (suggested) patch.nextFollowUpAt = suggested;
    }
    try {
      await updateLead({ id: lead.id, patch });
      if (patch.nextFollowUpAt) {
        toast.message("Follow-up date set automatically.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update lead.");
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
      toast.success("Added to leads");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the lead.");
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
              {openCount} open
              {followUpDue > 0 ? ` · ${followUpDue} follow-up${followUpDue === 1 ? "" : "s"} due` : ""}
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
              title="Import leads from a CSV"
            >
              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span className="ml-1.5 hidden sm:inline">Import CSV</span>
            </Button>
            {leads.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={exportCsv} title="Export leads to CSV">
                <Download className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">Export</span>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => void getSuggestions()} disabled={suggesting}>
              {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Suggest companies
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!businessProfileId}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add lead
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestions.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Who to contact {suggestSource === "heuristic" ? "(general ideas)" : ""}
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
                  Add
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, contact, email…"
                aria-label="Search leads"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
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
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leads…
          </div>
        ) : sortedLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <CalendarClock className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-muted-foreground">
              No leads yet. Add one, or get AI suggestions for who to contact.
            </p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No leads match your filters.</p>
        ) : (
          <div className="space-y-2">
            {filteredLeads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                onStatus={(status) => void handleStatusChange(lead, status)}
                onFollowUp={(value) =>
                  void updateLead({
                    id: lead.id,
                    patch: { nextFollowUpAt: value ? dateInputToEndOfDayIso(value) : null },
                  })
                }
                onDelete={() => void deleteLead(lead.id)}
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
        onOpenChange={setEditOpen}
        onSave={async (id, patch) => {
          await updateLead({ id, patch });
          toast.success("Lead updated.");
        }}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription>A company or contact to follow up with.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-website" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Website
              </Label>
              <div className="flex gap-2">
                <Input
                  id="lead-website"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && void autofillFromWebsite()}
                  placeholder="example.com"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void autofillFromWebsite()}
                  disabled={enriching || !form.website.trim()}
                  className="shrink-0"
                >
                  {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  <span className="ml-1.5 hidden sm:inline">Auto-fill</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Paste a site and we'll pull in the company name + description.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-company">Company *</Label>
              <Input
                id="lead-company"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Company name"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-contact">Contact</Label>
                <Input
                  id="lead-contact"
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-followup">Follow up on</Label>
                <Input
                  id="lead-followup"
                  type="date"
                  value={form.nextFollowUpAt}
                  onChange={(e) => setForm((f) => ({ ...f, nextFollowUpAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Phone</Label>
                <Input
                  id="lead-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Notes</Label>
              <Textarea
                id="lead-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Why they're a fit, next step…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitLead()} disabled={saving || !form.company.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Add lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
