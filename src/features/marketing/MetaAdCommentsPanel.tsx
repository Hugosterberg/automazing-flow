import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatSmartDate } from "@/lib/format";
import {
  useMetaAdComments,
  useReplyMetaAdComment,
  type MetaAdComment,
} from "./useMetaAdComments";

function CommentRow({
  comment,
  onReplied,
}: {
  comment: MetaAdComment;
  onReplied?: () => void;
}) {
  const { t } = useTranslation("marketing");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const reply = useReplyMetaAdComment();

  async function sendReply() {
    const message = draft.trim();
    if (!message) return;
    try {
      await reply.mutateAsync({
        commentId: comment.id,
        message,
        platform: comment.platform,
        pageId: comment.pageId,
      });
      setDraft("");
      setOpen(false);
      toast.success(t("adComments.replySent"));
      onReplied?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("adComments.replyFailed"));
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium truncate">{comment.authorName}</p>
        <Badge variant="secondary" className="font-normal capitalize">
          {comment.platform === "facebook" ? t("adComments.facebook") : t("adComments.instagram")}
        </Badge>
        {comment.createdAt ? (
          <span className="text-[11px] text-muted-foreground ml-auto">
            {formatSmartDate(comment.createdAt)}
          </span>
        ) : null}
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">
        {comment.message || t("adComments.emptyMessage")}
      </p>
      <p className="text-[11px] text-muted-foreground truncate">
        {t("adComments.onAd", { name: comment.adName })}
      </p>
      {comment.canReply ? (
        open ? (
          <div className="space-y-2 pt-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("adComments.replyPlaceholder")}
              rows={2}
              className="text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void sendReply()}
                disabled={reply.isPending || !draft.trim()}
                className="gap-1.5"
              >
                {reply.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {t("adComments.sendReply")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {t("adComments.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t("adComments.reply")}
          </Button>
        )
      ) : comment.platform === "instagram" ? (
        <p className="text-[11px] text-muted-foreground">{t("adComments.igReplySoon")}</p>
      ) : null}
    </div>
  );
}

/** Minimal Meta ad-comments inbox for Marketing → Paid. */
export function MetaAdCommentsPanel() {
  const { t } = useTranslation("marketing");
  const { data, isLoading, isError, refetch, isFetching } = useMetaAdComments();

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="h-4 w-4" />
              {t("adComments.title")}
            </CardTitle>
            <CardDescription>{t("adComments.description")}</CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label={t("adComments.refresh")}
            className="gap-1.5"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{t("adComments.refresh")}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("adComments.loading")}
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">{t("adComments.loadError")}</p>
        ) : !data?.connected ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{data?.note || t("adComments.notConnected")}</p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/connections?session=meta_business">{t("adComments.connect")}</Link>
            </Button>
          </div>
        ) : (
          <>
            {data.note ? (
              <div className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground space-y-2">
                <p>{data.note}</p>
                {data.needsReconnect ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/connections?session=meta_business">{t("adComments.reconnect")}</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}

            <p className="text-[11px] text-muted-foreground">
              {t("adComments.scanned", {
                comments: data.comments.length,
                ads: data.adsScanned,
                account: data.accountName || "Meta",
              })}
            </p>

            {data.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t("adComments.empty")}</p>
            ) : (
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {data.comments.map((comment) => (
                  <CommentRow
                    key={`${comment.platform}-${comment.id}`}
                    comment={comment}
                    onReplied={() => void refetch()}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
