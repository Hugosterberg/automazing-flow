import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Send, CalendarClock, CheckCircle2, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/context/AccountsContext";
import type { AccountPlatform } from "@/types/accounts";
import { apiJson } from "@/lib/apiJson";
import { platformLabel } from "@/lib/platformLabels";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useScheduledPosts, type ScheduledPost } from "@/features/social";
import { absoluteMediaUrl } from "@/features/content/contentPublishMedia";

/** Platforms we can publish to via Zernio. */
const PUBLISHABLE_PLATFORMS: AccountPlatform[] = ["instagram", "facebook", "tiktok", "youtube", "x"];

/** ISO timestamp → value for `<input type="datetime-local">` (local time). */
function isoToLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PublishComposer({
  initialCaption = "",
  mediaUrls = [],
  onPublished,
  onCaptionChange,
  editingPost = null,
  onEditingPostChange,
  publishBlockedReason = null,
  publishWarning = null,
  autoSelectAccounts = true,
}: {
  initialCaption?: string;
  mediaUrls?: string[];
  onPublished?: () => void;
  onCaptionChange?: (caption: string) => void;
  /** Load an existing pipeline post (draft/scheduled) into the composer. */
  editingPost?: ScheduledPost | null;
  onEditingPostChange?: (post: ScheduledPost | null) => void;
  publishBlockedReason?: string | null;
  publishWarning?: string | null;
  /** Pre-select all publishable accounts when the composer opens. */
  autoSelectAccounts?: boolean;
}) {
  const { t } = useTranslation("content");
  const { toast } = useToast();
  const { accounts, activeProfileId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBusinessProfileId ?? activeProfileId;
  const scheduledPosts = useScheduledPosts();

  const postable = useMemo(
    () =>
      accounts.filter(
        (a) => Boolean(a.zernioAccountId) && PUBLISHABLE_PLATFORMS.includes(a.platform) && !a.disconnectedAt
      ),
    [accounts]
  );

  const [caption, setCaption] = useState(initialCaption);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const resolvedMediaUrls = useMemo(
    () =>
      mediaUrls
        .map((url) => absoluteMediaUrl(url))
        .filter((url): url is string => Boolean(url) && !url.startsWith("blob:")),
    [mediaUrls]
  );
  const hasBlobOnlyMedia =
    mediaUrls.some((url) => url.startsWith("blob:")) && resolvedMediaUrls.length === 0;

  useEffect(() => {
    setCaption(initialCaption);
  }, [initialCaption]);

  useEffect(() => {
    if (!autoSelectAccounts || editingPost || postable.length === 0) return;
    setSelected((current) => {
      if (Object.values(current).some(Boolean)) return current;
      return Object.fromEntries(postable.map((account) => [account.id, true]));
    });
  }, [autoSelectAccounts, editingPost, postable]);

  // Load an existing draft/scheduled post into the form when edit is requested.
  useEffect(() => {
    if (!editingPost) return;
    setCaption(editingPost.caption);
    onCaptionChange?.(editingPost.caption);
    setSelected(Object.fromEntries(editingPost.accountIds.map((id) => [id, true])));
    setMode(editingPost.scheduledFor ? "schedule" : "now");
    setScheduledFor(editingPost.scheduledFor ? isoToLocalDateTimeInput(editingPost.scheduledFor) : "");
    setDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the edited post changes
  }, [editingPost?.id]);

  function platformsOf(ids: string[]): string[] {
    const set = new Set<string>();
    for (const id of ids) {
      const account = accounts.find((a) => a.id === id);
      if (account) set.add(account.platform);
    }
    return [...set];
  }

  function resetForm() {
    setCaption("");
    onCaptionChange?.("");
    setSelected({});
    setScheduledFor("");
    onEditingPostChange?.(null);
  }

  function buildPost(status: ScheduledPost["status"], scheduledForIso: string | null): ScheduledPost {
    const now = new Date().toISOString();
    return {
      id: editingPost?.id ?? crypto.randomUUID(),
      caption: caption.trim(),
      accountIds: selectedIds,
      platforms: platformsOf(selectedIds),
      status,
      scheduledFor: scheduledForIso,
      mediaUrls: resolvedMediaUrls,
      createdAt: editingPost?.createdAt ?? now,
      updatedAt: now,
    };
  }

  /** Save the current form as a draft — no accounts or time required yet. */
  function saveDraft() {
    if (!caption.trim()) return;
    const iso = scheduledFor ? new Date(scheduledFor).toISOString() : null;
    scheduledPosts.upsert(buildPost("draft", iso));
    resetForm();
    toast({ title: t("publish.draftSaved"), description: t("publish.draftSavedDescription") });
  }

  /** Queue the post locally; the server sweep publishes it when the time comes. */
  function schedulePost() {
    if (selectedIds.length === 0 || !caption.trim()) return;
    if (!scheduledFor) {
      toast({ title: t("publish.pickDateTime"), variant: "destructive" });
      return;
    }
    const atMs = new Date(scheduledFor).getTime();
    if (!Number.isFinite(atMs) || atMs < Date.now() - 60_000) {
      toast({ title: t("publish.scheduleMustBeFuture"), variant: "destructive" });
      return;
    }
    scheduledPosts.upsert(buildPost("scheduled", new Date(atMs).toISOString()));
    setDone(true);
    resetForm();
    onPublished?.();
    toast({
      title: t("publish.scheduled"),
      description: t("publish.scheduledDescription"),
    });
  }

  async function publishNow() {
    if (!businessProfileId) {
      toast({ title: t("publish.pickProfile"), variant: "destructive" });
      return;
    }
    if (selectedIds.length === 0 || !caption.trim()) return;
    setBusy(true);
    try {
      const payload = await apiJson<{ published?: number }>("/api/content/publish", t("publish.publishApiError"), {
        body: {
          accountIds: selectedIds,
          business_profile_id: businessProfileId,
          content: caption.trim(),
          publishNow: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          mediaUrls: resolvedMediaUrls,
        },
      });
      scheduledPosts.upsert(buildPost("published", new Date().toISOString()));
      setDone(true);
      resetForm();
      onPublished?.();
      toast({
        title: t("publish.published"),
        description: t("publish.publishedDescription", { count: payload?.published ?? selectedIds.length }),
      });
    } catch (e) {
      toast({
        title: t("publish.publishFailed"),
        description: e instanceof Error ? e.message : t("publish.unknownError"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-4 w-4 text-muted-foreground" />
          {t("publish.title")}
        </CardTitle>
        <CardDescription>
          {t("publish.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {postable.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t("publish.noAccounts")}
            <Button variant="link" size="sm" className="h-auto px-1 py-0 text-sm" asChild>
              <Link to="/connections">{t("publish.manageConnections")}</Link>
            </Button>
          </div>
        ) : null}

        {editingPost ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {editingPost.status === "draft" ? t("publish.editingDraft") : t("publish.editingScheduled")}
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetForm}>
              {t("publish.cancelEdit")}
            </Button>
          </div>
        ) : null}

        <Textarea
          value={caption}
          onChange={(e) => {
            const next = e.target.value;
            setCaption(next);
            onCaptionChange?.(next);
            setDone(false);
          }}
          placeholder={t("publish.captionPlaceholder")}
          className="min-h-[90px]"
        />

        {resolvedMediaUrls.length > 0 ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("publish.attachedMedia", { count: resolvedMediaUrls.length })}</Label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {resolvedMediaUrls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("publish.noMedia")}</p>
        )}

        {hasBlobOnlyMedia ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            {t("publish.blobWarning")}
          </div>
        ) : null}

        {publishBlockedReason ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t("publish.blocked", { reason: publishBlockedReason })}
          </div>
        ) : publishWarning ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            {t("publish.reviewWarning", { warning: publishWarning })}
          </div>
        ) : null}

        {postable.length > 0 ? (
          <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{t("publish.accounts")}</Label>
          <div className="flex flex-wrap gap-2">
            {postable.map((a) => {
              const active = Boolean(selected[a.id]);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected((cur) => ({ ...cur, [a.id]: !cur[a.id] }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a.username} - {platformLabel(a.platform)}
                </button>
              );
            })}
          </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("publish.when")}</Label>
            <div className="flex gap-1 rounded-md border border-border p-1">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={`text-xs px-3 py-1 rounded ${mode === "now" ? "bg-accent" : "text-muted-foreground"}`}
              >
                {t("publish.now")}
              </button>
              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={`text-xs px-3 py-1 rounded inline-flex items-center gap-1 ${
                  mode === "schedule" ? "bg-accent" : "text-muted-foreground"
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" /> {t("publish.schedule")}
              </button>
            </div>
          </div>
          {mode === "schedule" && (
            <div className="space-y-1.5">
              <Label htmlFor="composer-schedule" className="text-xs text-muted-foreground">
                {t("publish.dateTime")}
              </Label>
              <Input
                id="composer-schedule"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-[220px]"
              />
            </div>
          )}
          {mode === "schedule" && resolvedMediaUrls.length > 0 ? (
            <p className="basis-full text-xs text-muted-foreground">
              {t("publish.scheduleMediaHint")}
            </p>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {done && (
              <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("publish.sent")}
              </span>
            )}
            <Button
              variant="outline"
              onClick={saveDraft}
              disabled={busy || !caption.trim()}
            >
              <FileText className="h-4 w-4 mr-2" />
              {t("publish.saveDraft")}
            </Button>
            <Button
              onClick={() => (mode === "now" ? void publishNow() : schedulePost())}
              disabled={
                busy ||
                postable.length === 0 ||
                selectedIds.length === 0 ||
                !caption.trim() ||
                Boolean(publishBlockedReason) ||
                hasBlobOnlyMedia
              }
            >
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {mode === "now" ? t("publish.publish") : t("publish.scheduleAction")}{resolvedMediaUrls.length > 0 ? t("publish.withMedia") : ""}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
