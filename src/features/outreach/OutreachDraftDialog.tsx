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
  linkedInSearchUrl,
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

function ChannelBadge({ loading, ready }: { loading: boolean; ready: boolean }) {
  if (loading) return <Loader2 className="h-3 w-3 animate-spin ml-1 inline" />;
  if (ready) return <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">ready</Badge>;
  return null;
}

export function OutreachDraftDialog({
  open,
  onOpenChange,
  businessProfileId,
  sellerContext,
  target,
  onMarkContacted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessProfileId: string | null;
  sellerContext: Omit<OutreachDraftInput, "business_profile_id" | "channel" | keyof OutreachDraftTarget>;
  target?: OutreachDraftTarget | null;
  /** Called when user marks the lead as contacted after sending outreach. */
  onMarkContacted?: () => void;
}) {
  const [channel, setChannel] = useState<OutreachChannel>("email");
  const [loadingChannels, setLoadingChannels] = useState<Set<OutreachChannel>>(() => new Set());
  const [sourceByChannel, setSourceByChannel] = useState<Partial<Record<OutreachChannel, string>>>({});
  const [draftByChannel, setDraftByChannel] = useState<Partial<Record<OutreachChannel, OutreachDraft>>>({});
  const autoStartedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDraftByChannel({});
      setSourceByChannel({});
      setLoadingChannels(new Set());
      autoStartedRef.current = null;
      return;
    }
    const key = `${target?.prospectCompany || ""}:${target?.prospectEmail || ""}`;
    if (autoStartedRef.current === key) return;
    autoStartedRef.current = key;
    void Promise.all([
      generateChannel("email", { force: true, switchTab: false }),
      generateChannel("linkedin", { force: true, switchTab: false }),
      generateChannel("follow-up", { force: true, switchTab: false }),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.prospectCompany, target?.prospectEmail]);

  async function generateChannel(
    nextChannel: OutreachChannel,
    options?: { force?: boolean; switchTab?: boolean }
  ) {
    if (!businessProfileId) {
      toast.error("Välj en företagsprofil först.");
      return;
    }
    if (!options?.force && draftByChannel[nextChannel]) {
      if (options?.switchTab !== false) setChannel(nextChannel);
      return;
    }
    if (options?.switchTab !== false) setChannel(nextChannel);
    setLoadingChannels((current) => new Set(current).add(nextChannel));
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
      toast.error(error instanceof Error ? error.message : "Kunde inte generera outreach.");
    } finally {
      setLoadingChannels((current) => {
        const next = new Set(current);
        next.delete(nextChannel);
        return next;
      });
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Kopierat");
    } catch {
      toast.error("Kunde inte kopiera");
    }
  }

  const prospectLabel = target?.prospectCompany || "prospekt";
  const linkedInUrl = linkedInSearchUrl(target);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Outreach-utkast — {prospectLabel}
          </DialogTitle>
          <DialogDescription>
            Alla tre kanaler genereras automatiskt när du öppnar dialogen.
          </DialogDescription>
        </DialogHeader>

        {!businessProfileId ? (
          <Alert variant="destructive">
            <AlertTitle>Ingen aktiv profil</AlertTitle>
            <AlertDescription>Välj en företagsprofil innan du genererar outreach-utkast.</AlertDescription>
          </Alert>
        ) : null}

        <Tabs
          value={channel}
          onValueChange={(value) => {
            setChannel(value as OutreachChannel);
            void generateChannel(value as OutreachChannel, { switchTab: false });
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="email" className="text-xs sm:text-sm">
              E-post
              <ChannelBadge loading={loadingChannels.has("email")} ready={Boolean(draftByChannel.email)} />
            </TabsTrigger>
            <TabsTrigger value="linkedin" className="text-xs sm:text-sm">
              LinkedIn
              <ChannelBadge loading={loadingChannels.has("linkedin")} ready={Boolean(draftByChannel.linkedin)} />
            </TabsTrigger>
            <TabsTrigger value="follow-up" className="text-xs sm:text-sm">
              Uppföljning
              <ChannelBadge loading={loadingChannels.has("follow-up")} ready={Boolean(draftByChannel["follow-up"])} />
            </TabsTrigger>
          </TabsList>
          {(["email", "linkedin", "follow-up"] as const).map((tab) => {
            const draft = draftByChannel[tab];
            const loading = loadingChannels.has(tab);
            const source = sourceByChannel[tab];
            return (
              <TabsContent key={tab} value={tab} className="space-y-3 mt-3">
                {!draft && !loading ? (
                  <Button type="button" className="w-full" onClick={() => void generateChannel(tab, { force: true })}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {tab === "email"
                      ? "Generera mailutkast"
                      : tab === "linkedin"
                        ? "Generera LinkedIn-utkast"
                        : "Generera uppföljningsutkast"}
                  </Button>
                ) : null}
                {loading && !draft ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Skriver outreach-text…
                  </div>
                ) : null}
                {draft ? (
                  <>
                    {source === "heuristic" ? (
                      <p className="text-[11px] text-muted-foreground">Generell mall — lägg in en OpenAI-nyckel för anpassad text.</p>
                    ) : null}
                    {tab === "email" && draft.subject ? (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Ämne: </span>
                        <span className="font-medium">{draft.subject}</span>
                      </p>
                    ) : null}
                    {tab !== "follow-up" ? (
                      <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed">
                        {displayBody(draft, tab)}
                      </pre>
                    ) : null}
                    {tab === "follow-up" && draft.followUps.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Uppföljningssekvens</p>
                        {draft.followUps.map((fu, index) => (
                          <div key={index} className="rounded-md border border-border/70 p-2.5 space-y-1">
                            <Badge variant="outline" className="text-[10px]">
                              Dag {fu.day}
                            </Badge>
                            {fu.subject ? <p className="text-[11px] font-medium">{fu.subject}</p> : null}
                            <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">{fu.body}</pre>
                          </div>
                        ))}
                      </div>
                    ) : tab === "follow-up" ? (
                      <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed">
                        {displayBody(draft, tab)}
                      </pre>
                    ) : null}
                    {tab === "email" && draft.followUps.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Uppföljningssekvens (ingår i texten)</p>
                        {draft.followUps.map((fu, index) => (
                          <div key={index} className="rounded-md border border-border/70 p-2.5 space-y-1">
                            <Badge variant="outline" className="text-[10px]">
                              Dag {fu.day}
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
                        Kopiera
                      </Button>
                      {tab === "email" ? (
                        <Button type="button" size="sm" variant="outline" asChild>
                          <a href={outreachDraftToMailto(draft, target?.prospectEmail)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Öppna i e-post
                          </a>
                        </Button>
                      ) : null}
                      {tab === "linkedin" && linkedInUrl ? (
                        <Button type="button" size="sm" variant="outline" asChild>
                          <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Hitta på LinkedIn
                          </a>
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" onClick={() => void generateChannel(tab, { force: true })}>
                        Generera om
                      </Button>
                      {onMarkContacted && tab === "email" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            onMarkContacted();
                            toast.success("Lead markerad som kontaktad");
                          }}
                        >
                          Markera som kontaktad
                        </Button>
                      ) : null}
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
