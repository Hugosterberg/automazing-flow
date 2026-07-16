import { CalendarClock, Pencil, Send, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTimeMedium } from "@/lib/format";
import { platformLabel } from "@/lib/platformLabels";
import { useScheduledPosts } from "./useScheduledPosts";
import { type ScheduledPost, type ScheduledPostStatus } from "./scheduledPosts";

const STATUS_TONE: Record<ScheduledPostStatus, string> = {
  draft: "border-border bg-muted/40 text-muted-foreground",
  scheduled: "border-info/40 bg-info/10 text-info",
  published: "border-success/40 bg-success/10 text-success",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

/**
 * The publishing pipeline under the composer: every post with its
 * draft → scheduled → published status, editable until it is published.
 * Scheduled posts also appear on the Calendar, where they can be moved.
 */
export function ScheduledPostsList({ onEdit }: { onEdit?: (post: ScheduledPost) => void }) {
  const { t } = useTranslation("social");
  const { posts, remove } = useScheduledPosts();
  if (posts.length === 0) return null;

  function formatWhen(iso: string | null): string {
    return formatDateTimeMedium(iso) || t("schedule.noTime");
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-4 w-4 text-muted-foreground" />
          {t("schedule.title")}
        </CardTitle>
        <CardDescription>
          {t("schedule.descriptionPrefix")}{" "}
          <Link to="/calendar" className="underline underline-offset-2 hover:text-foreground">
            {t("schedule.calendarLink")}
          </Link>{" "}
          {t("schedule.descriptionSuffix")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {posts.map((post) => {
          const editable = post.status !== "published";
          return (
            <div
              key={post.id}
              className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/60 px-3.5 py-2.5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{post.caption || t("schedule.emptyCaption")}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" aria-hidden />
                    {formatWhen(post.scheduledFor)}
                  </span>
                  {post.platforms.length > 0 ? (
                    <span>{post.platforms.map((p) => platformLabel(p)).join(" · ")}</span>
                  ) : null}
                  {post.error ? <span className="text-destructive">{post.error}</span> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    STATUS_TONE[post.status]
                  )}
                >
                  {t(`schedule.status.${post.status}`)}
                </span>
                {editable && onEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(post)}
                    aria-label={t("schedule.editPost")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(post.id)}
                  aria-label={t("schedule.removePost")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
