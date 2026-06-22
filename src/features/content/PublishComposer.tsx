import { useMemo, useState } from "react";
import { Loader2, Send, CalendarClock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/context/AccountsContext";
import { apiUrl } from "@/lib/apiBase";
import type { AccountPlatform } from "@/types/accounts";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { platformLabel } from "@/lib/platformLabels";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";

/** Platforms we can publish to via Zernio. */
const PUBLISHABLE_PLATFORMS: AccountPlatform[] = ["instagram", "facebook", "tiktok", "youtube", "x"];


export function PublishComposer() {
  const { toast } = useToast();
  const { accounts, activeProfileId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const businessProfileId = activeBusinessProfileId ?? activeProfileId;

  const postable = useMemo(
    () =>
      accounts.filter(
        (a) => Boolean(a.zernioAccountId) && PUBLISHABLE_PLATFORMS.includes(a.platform) && !a.disconnectedAt
      ),
    [accounts]
  );

  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  if (postable.length === 0) {
    return null; // Nothing to publish to yet — keep the page clean.
  }

  async function publish() {
    if (selectedIds.length === 0 || !caption.trim()) return;
    if (mode === "schedule" && !scheduledFor) {
      toast({ title: "Pick a date and time", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithTimeout(apiUrl("/api/content/publish"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds: selectedIds,
          business_profile_id: businessProfileId,
          content: caption.trim(),
          publishNow: mode === "now",
          scheduledFor: mode === "schedule" ? new Date(scheduledFor).toISOString() : undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || payload?.error || "Could not publish");
      setDone(true);
      setCaption("");
      setSelected({});
      toast({
        title: mode === "now" ? "Published" : "Scheduled",
        description: `${payload?.published ?? selectedIds.length} account(s) via Zernio.`,
      });
    } catch (e) {
      toast({
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Unknown error",
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
          Publish or schedule a post
        </CardTitle>
        <CardDescription>Write a caption, pick accounts, and publish now or schedule — sent via Zernio.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value);
            setDone(false);
          }}
          placeholder="What do you want to post?"
          className="min-h-[90px]"
        />

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Accounts</Label>
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
                  {a.username} · {platformLabel(a.platform)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">When</Label>
            <div className="flex gap-1 rounded-md border border-border p-1">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={`text-xs px-3 py-1 rounded ${mode === "now" ? "bg-accent" : "text-muted-foreground"}`}
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={`text-xs px-3 py-1 rounded inline-flex items-center gap-1 ${
                  mode === "schedule" ? "bg-accent" : "text-muted-foreground"
                }`}
              >
                <CalendarClock className="h-3.5 w-3.5" /> Schedule
              </button>
            </div>
          </div>
          {mode === "schedule" && (
            <div className="space-y-1.5">
              <Label htmlFor="composer-schedule" className="text-xs text-muted-foreground">
                Date & time
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
          <div className="ml-auto flex items-center gap-2">
            {done && (
              <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sent
              </span>
            )}
            <Button onClick={() => void publish()} disabled={busy || selectedIds.length === 0 || !caption.trim()}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {mode === "now" ? "Publish" : "Schedule"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
