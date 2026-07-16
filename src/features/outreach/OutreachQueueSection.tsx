import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("outreach");
  const doc = useProfileDocument<OutreachQueueItem[]>(OUTREACH_QUEUE_DOC_KEY, []);
  const pending = pendingOutreachItems(doc.data);

  if (!businessProfileId || pending.length === 0) {
    if (compact) return null;
    return (
      <AutomationEnableHint
        tab="messages"
        focus="sales-outreach-auto"
        title={t("automation.enableTitle")}
        description={t("automation.enableDesc")}
        ctaLabel={t("automation.enableCta")}
      />
    );
  }

  function markSent(id: string) {
    doc.save(
      doc.data.map((item) => (item.id === id ? { ...item, status: "sent" as const } : item))
    );
    toast.success(t("actions.markedSent"));
  }

  function removeItem(id: string) {
    doc.save(doc.data.filter((item) => item.id !== id));
  }

  async function copyItem(item: OutreachQueueItem) {
    const text = [
      item.subject ? t("clipboard.subjectPrefix", { subject: item.subject }) : "",
      item.body,
    ]
      .filter(Boolean)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    toast.success(t("actions.copied"));
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {t("queue.title")}
              <Badge variant="secondary">{pending.length}</Badge>
            </CardTitle>
            <CardDescription>{t("queue.description")}</CardDescription>
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
                <span className="text-muted-foreground">{t("labels.subject")} </span>
                {item.subject}
              </p>
            ) : null}
            <pre className="whitespace-pre-wrap rounded-md bg-background/60 p-2 text-xs leading-relaxed max-h-32 overflow-y-auto">
              {item.body}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void copyItem(item)}>
                <Copy className="h-3 w-3 mr-1" />
                {t("actions.copy")}
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
                    {t("actions.email")}
                  </a>
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => markSent(item.id)}>
                <ExternalLink className="h-3 w-3 mr-1" />
                {t("actions.markSent")}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => removeItem(item.id)}>
                <Trash2 className="h-3 w-3 mr-1" />
                {t("actions.remove")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
