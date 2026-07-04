import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Loader2, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchOutreachDraft,
  outreachDraftText,
  outreachDraftToMailto,
  type OutreachChannel,
  type OutreachDraft,
  type OutreachDraftInput,
} from "./outreachClient";

export type OutreachDraftTarget = {
  prospectCompany?: string;
  prospectContact?: string;
  prospectEmail?: string;
  prospectWebsite?: string;
  prospectNotes?: string;
  prospectReason?: string;
};

function displayBody(draft: OutreachDraft, tab: OutreachChannel): string {
  if (tab === "linkedin" && draft.linkedinMessage) return draft.linkedinMessage;
  if (tab === "follow-up" && draft.followUps[0]?.body) return draft.followUps[0].body;
  return draft.body;
}

export function OutreachDraftDialog({
  open,
  onOpenChange,
  businessProfileId,
  sellerContext,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessProfileId: string | null;
  sellerContext: Omit<OutreachDraftInput, "business_profile_id" | "channel" | keyof OutreachDraftTarget>;
  target?: OutreachDraftTarget | null;
}) {
  const [channel, setChannel] = useState<OutreachChannel>("email");
  const [loadingChannel, setLoadingChannel] = useState<OutreachChannel | null>(null);
  const [sourceByChannel, setSourceByChannel] = useState<Partial<Record<OutreachChannel, string>>>({});
  const [draftByChannel, setDraftByChannel] = useState<Partial<Record<OutreachChannel, OutreachDraft>>>({});
  const autoStartedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDraftByChannel({});
      setSourceByChannel({});
      setLoadingChannel(null);
      autoStartedRef.current = null;
      return;
    }
    const key = `${target?.prospectCompany || ""}:${target?.prospectEmail || ""}`;
    if (autoStartedRef.current === key) return;
    autoStartedRef.current = key;
    void generate("email", { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.prospectCompany, target?.prospectEmail]);

  async function generate(nextChannel: OutreachChannel, options?: { force?: boolean }) {
    if (!businessProfileId) {
      toast.error("Select a business profile first.");
      return;
    }
    if (!options?.force && draftByChannel[nextChannel]) {
      setChannel(nextChannel);
      return;
    }
    setChannel(nextChannel);
    setLoadingChannel(nextChannel);
    try {
      const result = await fetchOutreachDraft({
        business_profile_id: businessProfileId,
        channel: nextChannel,
        ...sellerContext,
        ...target,
      });
      setDraftByChannel((current) => ({ ...current, [nextChannel]: result.draft }));
      setSourceByChannel((current) => ({ ...current, [nextChannel]: result.source }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate outreach.");
    } finally {
      setLoadingChannel(null);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  const prospectLabel = target?.prospectCompany || "prospect";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Outreach draft — {prospectLabel}
          </DialogTitle>
          <DialogDescription>
            Personalized cold email, LinkedIn message, and follow-up for this potential customer.
          </DialogDescription>
        </DialogHeader>

        {!businessProfileId ? (
          <Alert variant="destructive">
            <AlertTitle>No active profile</AlertTitle>
            <AlertDescription>Select a business profile before generating outreach drafts.</AlertDescription>
          </Alert>
        ) : null}

        <Tabs
          value={channel}
          onValueChange={(value) => {
            void generate(value as OutreachChannel);
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
            <TabsTrigger value="follow-up">Follow-up</TabsTrigger>
          </TabsList>
          {(["email", "linkedin", "follow-up"] as const).map((tab) => {
            const draft = draftByChannel[tab];
            const loading = loadingChannel === tab;
            const source = sourceByChannel[tab];
            return (
              <TabsContent key={tab} value={tab} className="space-y-3 mt-3">
                {!draft && !loading ? (
                  <Button type="button" className="w-full" onClick={() => void generate(tab, { force: true })}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate {tab === "follow-up" ? "follow-up" : tab} draft
                  </Button>
                ) : null}
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Writing outreach copy…
                  </div>
                ) : null}
                {draft && !loading ? (
                  <>
                    {source === "heuristic" ? (
                      <p className="text-[11px] text-muted-foreground">General template — add OpenAI key for tailored copy.</p>
                    ) : null}
                    {tab === "email" && draft.subject ? (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Subject: </span>
                        <span className="font-medium">{draft.subject}</span>
                      </p>
                    ) : null}
                    {tab === "follow-up" && draft.followUps.length > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        Showing first follow-up — full sequence included when you copy.
                      </p>
                    ) : null}
                    <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed">
                      {displayBody(draft, tab)}
                    </pre>
                    {tab === "email" && draft.followUps.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Follow-up sequence</p>
                        {draft.followUps.map((fu, index) => (
                          <div key={index} className="rounded-md border border-border/70 p-2.5 space-y-1">
                            <Badge variant="outline" className="text-[10px]">
                              Day {fu.day}
                            </Badge>
                            <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">{fu.body}</pre>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {draft.tips ? <p className="text-[11px] text-muted-foreground italic">{draft.tips}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void copyText(outreachDraftText(draft, tab))}>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy
                      </Button>
                      {tab === "email" ? (
                        <Button type="button" size="sm" variant="outline" asChild>
                          <a href={outreachDraftToMailto(draft, target?.prospectEmail)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Open in email
                          </a>
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" onClick={() => void generate(tab, { force: true })}>
                        Regenerate
                      </Button>
                    </div>
                  </>
                ) : null}
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
