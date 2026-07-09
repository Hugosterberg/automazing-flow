import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { dateInputToEndOfDayIso, isoToLocalDateInputValue } from "@/lib/localDate";
import { applyEnrichmentToLeadForm } from "@/features/business-profiles/companyEnrichmentClient";
import type { Lead, LeadInput } from "./leadsService";
import { enrichLead } from "./leadSuggestionsClient";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, type LeadStatus } from "./leadHelpers";
import { LeadAutoFillFields } from "./LeadAutoFillFields";

interface Props {
  lead: Lead | null;
  open: boolean;
  businessProfileId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: LeadInput) => Promise<unknown>;
}

export function LeadEditDialog({ lead, open, businessProfileId, onOpenChange, onSave }: Props) {
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<LeadStatus>("new");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lead || !open) return;
    setCompany(lead.company);
    setContactName(lead.contactName ?? "");
    setEmail(lead.email ?? "");
    setPhone(lead.phone ?? "");
    setWebsite(lead.website ?? "");
    setOrgNumber(lead.orgNumber ?? "");
    setNotes(lead.notes ?? "");
    setStatus(lead.status);
    setNextFollowUpAt(lead.nextFollowUpAt ? isoToLocalDateInputValue(lead.nextFollowUpAt) : "");
    setError(null);
  }, [lead, open]);

  async function autofillLead() {
    if (!website.trim() && !orgNumber.trim() && !company.trim()) return;
    setEnriching(true);
    try {
      const data = await enrichLead({
        url: website.trim() || undefined,
        orgNumber: orgNumber.trim() || undefined,
        company: company.trim() || undefined,
        business_profile_id: businessProfileId,
      });
      const next = applyEnrichmentToLeadForm(
        { orgNumber, company, website, email, phone, notes },
        data
      );
      setOrgNumber(next.orgNumber);
      setCompany(next.company);
      setWebsite(next.website);
      setEmail(next.email);
      setPhone(next.phone);
      setNotes(next.notes);
      toast.success("Uppdaterat från register/webb");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppslag misslyckades.");
    } finally {
      setEnriching(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lead) return;
    const trimmed = company.trim();
    if (!trimmed) {
      setError("Företagsnamn krävs.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(lead.id, {
        company: trimmed,
        contactName: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        orgNumber: orgNumber.trim() || null,
        notes: notes.trim() || null,
        status,
        nextFollowUpAt: nextFollowUpAt ? dateInputToEndOfDayIso(nextFollowUpAt) : null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redigera lead</DialogTitle>
          <DialogDescription>Uppdatera kontaktuppgifter och uppföljning.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <LeadAutoFillFields
            idPrefix="edit-lead"
            loading={enriching}
            form={{ orgNumber, company, website }}
            onChange={(patch) => {
              if (patch.orgNumber !== undefined) setOrgNumber(patch.orgNumber);
              if (patch.company !== undefined) setCompany(patch.company);
              if (patch.website !== undefined) setWebsite(patch.website);
            }}
            onLookup={() => void autofillLead()}
          />
          <div className="space-y-1.5">
            <Label htmlFor="edit-lead-company">Företag *</Label>
            <Input
              id="edit-lead-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-lead-contact">Kontakt</Label>
              <Input
                id="edit-lead-contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-lead-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus)} disabled={saving}>
                <SelectTrigger className="h-9 text-xs">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-lead-email">E-post</Label>
              <Input
                id="edit-lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-lead-phone">Telefon</Label>
              <Input
                id="edit-lead-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-lead-followup">Följ upp</Label>
            <Input
              id="edit-lead-followup"
              type="date"
              value={nextFollowUpAt}
              onChange={(e) => setNextFollowUpAt(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-lead-notes">Anteckningar</Label>
            <Textarea
              id="edit-lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Avbryt
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Spara"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
