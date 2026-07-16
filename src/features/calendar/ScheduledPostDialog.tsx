import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { platformLabel } from "@/lib/platformLabels";
import { SCHEDULED_POST_STATUS_LABELS, type ScheduledPost } from "@/features/social";

type Props = {
  post: ScheduledPost | null;
  formDate: string;
  formTime: string;
  onFormDateChange: (value: string) => void;
  onFormTimeChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

/** Reschedule / inspect dialog for scheduled social posts on the calendar. */
export function ScheduledPostDialog({
  post,
  formDate,
  formTime,
  onFormDateChange,
  onFormTimeChange,
  onClose,
  onSave,
}: Props) {
  return (
    <Dialog
      open={post != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>Schemalagt inlägg</DialogTitle>
          <DialogDescription>
            {post
              ? post.status === "published"
                ? "Det här inlägget är redan publicerat."
                : "Flytta publiceringstiden, eller öppna inlägget i publiceringsverktyget för att redigera."
              : ""}
          </DialogDescription>
        </DialogHeader>
        {post ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-sm whitespace-pre-line line-clamp-5">
                {post.caption || "(tomt inlägg)"}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {post.platforms.map((p) => (
                  <span
                    key={p}
                    className="rounded bg-primary/10 text-primary px-1 py-0.5 text-[10px] uppercase tracking-wide"
                  >
                    {platformLabel(p)}
                  </span>
                ))}
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide">
                  {SCHEDULED_POST_STATUS_LABELS[post.status]}
                </span>
                {post.error ? <span className="text-destructive">{post.error}</span> : null}
              </p>
            </div>
            {post.status !== "published" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="post-date">Datum</Label>
                  <Input
                    id="post-date"
                    type="date"
                    value={formDate}
                    onChange={(e) => onFormDateChange(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="post-time">Tid</Label>
                  <Input
                    id="post-time"
                    type="time"
                    value={formTime}
                    onChange={(e) => onFormTimeChange(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          {post ? (
            <Button variant="outline" asChild>
              <Link to={`/social-media?post=${post.id}`}>Öppna i publiceringsverktyget</Link>
            </Button>
          ) : null}
          {post && post.status !== "published" ? (
            <Button onClick={onSave} disabled={!formDate}>
              Spara ny tid
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
