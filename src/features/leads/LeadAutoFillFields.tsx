import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LeadFormSlice = {
  orgNumber: string;
  company: string;
  website: string;
};

type Props = {
  form: LeadFormSlice;
  onChange: (patch: Partial<LeadFormSlice>) => void;
  onLookup: () => void;
  loading?: boolean;
  idPrefix?: string;
};

/** Shared auto-fill block for the add-lead dialog. */
export function LeadAutoFillFields({ form, onChange, onLookup, loading, idPrefix = "lead" }: Props) {
  const canLookup = Boolean(form.website.trim() || form.orgNumber.trim() || form.company.trim());

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-3">
      <div>
        <p className="text-sm font-medium">Fyll i automatiskt</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Ange org.nr, webb eller företagsnamn — vi hämtar det vi kan från register och webbplats.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-org`} className="text-xs">
            Org.nr (SE)
          </Label>
          <Input
            id={`${idPrefix}-org`}
            value={form.orgNumber}
            onChange={(e) => onChange({ orgNumber: e.target.value })}
            placeholder="556016-0680"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-website`} className="text-xs">
            Webbplats
          </Label>
          <Input
            id={`${idPrefix}-website`}
            value={form.website}
            onChange={(e) => onChange({ website: e.target.value })}
            placeholder="example.com"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={loading || !canLookup}
        onClick={onLookup}
        className="w-full sm:w-auto"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
        Hämta företagsinfo
      </Button>
    </div>
  );
}
