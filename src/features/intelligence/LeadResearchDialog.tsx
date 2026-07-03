import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { researchLead, type LeadResearchResult } from "./intelligenceService";

export interface LeadResearchTarget {
  name?: string;
  company?: string;
  website?: string;
}

/**
 * Research a lead through the tenant's connected research MCP provider
 * (Exa or Sprouts). Fires when opened with a target; results are plain
 * provider text — the human judges, nothing is written anywhere.
 */
export function LeadResearchDialog({
  businessProfileId,
  target,
  onOpenChange,
}: {
  businessProfileId: string | null;
  /** Non-null opens the dialog and starts the research. */
  target: LeadResearchTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<LeadResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    let ignore = false;
    setBusy(true);
    setResult(null);
    setError(null);
    researchLead({ businessProfileId, ...target })
      .then((r) => {
        if (!ignore) setResult(r);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : "Lead research failed.");
      })
      .finally(() => {
        if (!ignore) setBusy(false);
      });
    return () => {
      ignore = true;
    };
  }, [target, businessProfileId]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" aria-hidden />
            Research: {target?.company || target?.name || "lead"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? `Via ${result.provider} · ${result.tool}`
              : "Searching your connected research provider (Exa/Sprouts)…"}
          </DialogDescription>
        </DialogHeader>
        {busy ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Researching…
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-destructive">{error}</p>
        ) : result ? (
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs text-muted-foreground font-sans">
            {result.text || "The provider returned no content."}
          </pre>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
