import { Copy, ExternalLink, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutomationEnableHint } from "@/features/automation";
import { useProfileDocument } from "@/features/profile-documents";
import { formatShortDate } from "@/lib/format";
import { outreachDraftToMailto } from "./outreachClient";
import {
  OUTREACH_QUEUE_DOC_KEY,
  pendingOutreachItems,
  type OutreachQueueItem,
} from "./outreachQueueTypes";

export function OutreachQueueSection({
  businessProfileId,
  compact,
}: {
  businessProfileId: string | null;
  compact?: boolean;
}) {
  const doc = useProfileDocument<OutreachQueueItem[]>(OUTREACH_QUEUE_DOC_KEY, []);
  const pending = pendingOutreachItems(doc.data);

  if (!businessProfileId || pending.length === 0) {
    if (compact) return null;
    return (
      <AutomationEnableHint
        tab="messages"
        focus="sales-outreach-auto"
        title="Automatisera lead-uppföljning"
        description="Slå på automatisk outreach — utkast skapas i kön när leads behöver följas upp. Du godkänner innan något skickas."
        ctaLabel="Aktivera outreach-automation"
      />
    );
  }

  function markSent(id: string) {
    doc.save(
      doc.data.map((item) => (item.id === id ? { ...item, status: "sent" as const } : item))
    );
    toast.success("Markerad som skickad");
  }

  function removeItem(id: string) {
    doc.save(doc.data.filter((item) => item.id !== id));
  }

  async function copyItem(item: OutreachQueueItem) {
    const text = [item.subject ? `Ämne: ${item.subject}` : "", item.body].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    toast.success("Kopierat");
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Outreach-kö
              <Badge variant="secondary">{pending.length}</Badge>
            </CardTitle>
            <CardDescription>
              Automatiskt genererade utkast — granska, skicka och markera som skickade.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.slice(0, 8).map((item) => (
          <div key={item.id} className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{item.leadName}</p>
                {item.prospectEmail ? (
                  <p className="text-xs text-muted-foreground">{item.prospectEmail}</p>
                ) : null}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {formatShortDate(item.createdAt)}
              </span>
            </div>
            {item.subject ? (
              <p className="text-xs">
                <span className="text-muted-foreground">Ämne: </span>
                {item.subject}
              </p>
            ) : null}
            <pre className="whitespace-pre-wrap rounded-md bg-background/60 p-2 text-xs leading-relaxed max-h-32 overflow-y-auto">
              {item.body}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void copyItem(item)}>
                <Copy className="h-3 w-3 mr-1" />
                Kopiera
              </Button>
              {item.prospectEmail ? (
                <Button type="button" size="sm" className="h-7 text-xs" asChild>
                  <a
                    href={outreachDraftToMailto(
                      { subject: item.subject, body: item.body, linkedinMessage: "", followUps: [] },
                      item.prospectEmail
                    )}
                  >
                    <Mail className="h-3 w-3 mr-1" />
                    E-post
                  </a>
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => markSent(item.id)}>
                <ExternalLink className="h-3 w-3 mr-1" />
                Markera skickad
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => removeItem(item.id)}>
                <Trash2 className="h-3 w-3 mr-1" />
                Ta bort
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
