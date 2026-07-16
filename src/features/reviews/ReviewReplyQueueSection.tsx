import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutomationEnableHint } from "@/features/automation";
import { useProfileDocument } from "@/features/profile-documents";

export type ReviewReplyQueueItem = {
  id: string;
  reviewId: string;
  accountId: string;
  author: string;
  rating?: number;
  reviewText: string;
  draft: string;
  status: "draft" | "sent";
  createdAt: string;
};

export function ReviewReplyQueueSection({
  onUseDraft,
}: {
  onUseDraft: (item: ReviewReplyQueueItem) => void;
}) {
  const doc = useProfileDocument<ReviewReplyQueueItem[]>("review-reply-queue", []);
  const pending = doc.data.filter((item) => item.status === "draft" || !item.status);

  if (pending.length === 0) {
    return (
      <AutomationEnableHint
        tab="messages"
        focus="review-reply-auto"
        title="Inga review-utkast ännu"
        description="Slå på automatiska recensionssvar — utkast förbereds så du bara granskar och skickar."
        ctaLabel="Aktivera recensionsautomation"
      />
    );
  }

  function dismiss(id: string) {
    doc.save(doc.data.map((item) => (item.id === id ? { ...item, status: "sent" as const } : item)));
  }

  return (
    <Card className="border-info/30 bg-info/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Automatiska review-utkast
          <Badge variant="secondary">{pending.length}</Badge>
        </CardTitle>
        <CardDescription>
          Cron har förberett svar — klicka för att fylla i svarsfältet, granska och skicka.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.author}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{item.reviewText}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" size="sm" className="h-8 text-xs" onClick={() => onUseDraft(item)}>
                Använd utkast
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => dismiss(item.id)}>
                Avfärda
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
