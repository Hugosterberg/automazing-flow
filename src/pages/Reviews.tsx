import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { m } from "framer-motion";
import { Star, MessageSquare, RefreshCw, Loader2, ExternalLink, MapPin, Phone, Globe2, Info, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFocusedWorkspaceReading, useIsMobile, useStackedWorkspace } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { apiUrl } from "@/lib/apiBase";
import type { ConnectedAccount } from "@/types/accounts";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import {
  useReviewReplyState,
  ReviewReplyQueueSection,
  ReviewWorkspace,
  type ReviewItem,
} from "@/features/reviews";
import { accountDataUrl } from "@/lib/accountDataUrl";
import { LIVE_SYNC_REVIEWS } from "@/lib/liveSyncEvents";
import { useVisibleIntervalRefetch } from "@/hooks/useVisibleIntervalRefetch";

function sortReviewAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "google_reviews" ? 0 : p === "tripadvisor" ? 1 : 9);
  const d = rank(a.platform) - rank(b.platform);
  if (d !== 0) return d;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

type ReviewsData = {
  profile?: { name?: string; location?: string };
  stats?: { averageRating?: number; reviewCount?: number };
  reviews?: ReviewItem[];
  googleBusiness?: {
    source: "zernio" | "official";
    title?: string;
    phone?: string;
    website?: string;
    addressLines?: string[];
    primaryCategory?: string;
    averageRating?: number;
    reviewCount?: number;
  };
  tripadvisorInfo?: {
    source: "zernio" | "official";
    locationId?: string;
    name?: string;
    location?: string;
    address?: string;
    phone?: string;
    website?: string;
    ranking?: string;
    rating?: number;
    reviewCount?: number;
    url?: string;
  };
  source?: "zernio" | "official";
  note?: string;
} | null;

type PlaceInfo = {
  title: string;
  subtitle?: string;
  address?: string;
  phone?: string;
  website?: string;
  externalUrl?: string;
  source: "zernio" | "official";
};

const COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-yellow-500",
];

function normalizeExternalUrl(url?: string) {
  if (!url) return "";
  return url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
}

function displayString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

function displayNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatFullDate(raw?: string): string {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString("sv-SE", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

function formatDate(raw?: string): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function senderInitial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

function avatarColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function ReviewsPage() {
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { toast } = useToast();
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const selectedAccountId = getSelectedAccountId("reviews");
  const [searchParams, setSearchParams] = useSearchParams();
  const { repliedIds, markReplied, syncPendingCount } = useReviewReplyState(
    activeBusinessProfileId ?? activeProfileId
  );

  const [replyDraft, setReplyDraft] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const [replyFilter, setReplyFilter] = useState<"all" | "needs_reply">(() =>
    searchParams.get("filter") === "needs_reply" ? "needs_reply" : "all"
  );
  const autoDraftForId = useRef<string | null>(null);
  const defaultedReplyFilter = useRef(false);
  const autoSelectedDesktop = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [reviewSearch, setReviewSearch] = useState("");
  const debouncedReviewSearch = useDebouncedValue(reviewSearch, 160);

  const {
    scopedAccounts: reviewAccounts,
    activeAccount,
    data,
    loading,
    error,
    setError,
    refresh,
  } = useAccountData<ReviewsData>({
    accounts,
    selectedAccountId,
    setSelectedAccountId: (id) => setSelectedAccountId("reviews", id),
    accountFilter: (a) => (a.platform === "google_reviews" || a.platform === "tripadvisor") && Boolean(a.isOAuth),
    initialData: null,
    requestKey: activeBusinessProfileId ?? activeProfileId,
    scopeSort: sortReviewAccounts,
    fetcher: async (accountId) => {
      const res = await fetchWithTimeout(accountDataUrl(accountId, activeBusinessProfileId ?? activeProfileId), { credentials: "include" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(displayString(payload?.error) || displayString(payload?.message) || "Could not fetch reviews");
      }
      return res.json();
    },
  });

  useEffect(() => {
    function handleLiveSync() {
      void refresh();
    }
    window.addEventListener(LIVE_SYNC_REVIEWS, handleLiveSync);
    return () => window.removeEventListener(LIVE_SYNC_REVIEWS, handleLiveSync);
  }, [refresh]);

  useVisibleIntervalRefetch(() => void refresh(), 120_000, {
    enabled: Boolean(activeAccount),
    skipInitial: true,
  });

  const stats = data?.stats;
  const averageRating = displayNumber(stats?.averageRating);
  const reviewCount = displayNumber(stats?.reviewCount);
  const reviews = useMemo(
    () =>
      (Array.isArray(data?.reviews) ? data.reviews : []).map((review, index) => ({
        id: displayString(review.id) || String(index),
        author: displayString(review.author) || "Anonymous",
        rating: displayNumber(review.rating),
        text: displayString(review.text),
        createdAt: displayString(review.createdAt),
        url: displayString(review.url),
        source: displayString(review.source),
      })),
    [data]
  );

  const filteredReviews = useMemo(() => {
    let list = reviews;
    if (ratingFilter !== "all") {
      const stars = Number(ratingFilter);
      list = list.filter((r) => r.rating === stars);
    }
    if (replyFilter === "needs_reply") {
      list = list.filter((r) => !repliedIds.has(r.id));
    }
    const q = debouncedReviewSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.author.toLowerCase().includes(q) ||
          r.text.toLowerCase().includes(q) ||
          String(r.rating).includes(q)
      );
    }
    return list;
  }, [reviews, ratingFilter, replyFilter, repliedIds, debouncedReviewSearch]);

  const selectedId = searchParams.get("id");
  const selectedReview = useMemo(
    () => (selectedId ? filteredReviews.find((r) => r.id === selectedId) ?? reviews.find((r) => r.id === selectedId) ?? null : null),
    [filteredReviews, reviews, selectedId]
  );

  const selectReview = useCallback(
    (review: ReviewItem | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (review) next.set("id", review.id);
          else next.delete("id");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const needsReplyReviews = useMemo(
    () => filteredReviews.filter((r) => !repliedIds.has(r.id)),
    [filteredReviews, repliedIds]
  );

  useEffect(() => {
    if (reviews.length === 0) return;
    syncPendingCount(reviews.map((r) => r.id));
  }, [reviews, syncPendingCount]);

  useEffect(() => {
    if (defaultedReplyFilter.current || loading) return;
    const pending = reviews.filter((r) => !repliedIds.has(r.id)).length;
    if (pending > 0 && replyFilter === "all" && searchParams.get("filter") !== "needs_reply") {
      setReplyFilter("needs_reply");
    }
    defaultedReplyFilter.current = true;
  }, [loading, reviews, repliedIds, replyFilter, searchParams]);

  useEffect(() => {
    setReplyDraft("");
    setReplySent(false);
    setDraftBusy(false);
    setSendBusy(false);
  }, [selectedReview?.id]);

  useEffect(() => {
    autoSelectedDesktop.current = false;
  }, [activeAccount?.id, ratingFilter, replyFilter]);

  useEffect(() => {
    if (loading || selectedId || filteredReviews.length === 0 || autoSelectedDesktop.current) return;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      const first = filteredReviews.find((r) => !repliedIds.has(r.id)) ?? filteredReviews[0];
      if (first) selectReview(first);
      autoSelectedDesktop.current = true;
    }
  }, [loading, selectedId, filteredReviews, repliedIds, selectReview]);

  useEffect(() => {
    if (!selectedId || loading) return;
    if (reviews.some((r) => r.id === selectedId)) return;
    selectReview(null);
  }, [loading, reviews, selectedId, selectReview]);

  useEffect(() => {
    if (!selectedReview || repliedIds.has(selectedReview.id)) return;
    if (draftBusy || sendBusy || replySent) return;
    if (autoDraftForId.current === selectedReview.id) return;
    autoDraftForId.current = selectedReview.id;
    void draftReply(selectedReview);
  }, [selectedReview?.id, draftBusy, sendBusy, replySent, repliedIds]);

  const placeInfo = useMemo<PlaceInfo | null>(() => {
    if (data?.googleBusiness) {
      const gbp = data.googleBusiness;
      return {
        title: displayString(gbp.title) || displayString(data.profile?.name) || "Google Business Profile",
        subtitle: displayString(gbp.primaryCategory),
        address:
          (Array.isArray(gbp.addressLines) ? gbp.addressLines.map(displayString).filter(Boolean).join(", ") : "") ||
          displayString(data.profile?.location),
        phone: displayString(gbp.phone),
        website: displayString(gbp.website),
        externalUrl: normalizeExternalUrl(displayString(gbp.website)),
        source: gbp.source,
      };
    }
    if (data?.tripadvisorInfo) {
      const ta = data.tripadvisorInfo;
      return {
        title: displayString(ta.name) || displayString(data.profile?.name) || "Tripadvisor location",
        subtitle: displayString(ta.ranking),
        address: displayString(ta.address) || displayString(ta.location) || displayString(data.profile?.location),
        phone: displayString(ta.phone),
        website: displayString(ta.website),
        externalUrl: normalizeExternalUrl(displayString(ta.url) || displayString(ta.website)),
        source: ta.source,
      };
    }
    return null;
  }, [data]);

  async function draftReply(r: ReviewItem) {
    setDraftBusy(true);
    try {
      const res = await fetchWithTimeout(apiUrl("/api/ai/reply-draft"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "review",
          business_profile_id: activeBusinessProfileId ?? activeProfileId,
          authorName: r.author,
          rating: r.rating,
          text: r.text,
          businessName: displayString(data?.profile?.name),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(displayString(payload?.error) || "Could not draft a reply");
      setReplyDraft(displayString(payload?.draft));
    } catch (e) {
      toast({
        title: "AI-utkast misslyckades",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDraftBusy(false);
    }
  }

  const navigateRelative = useCallback(
    (delta: number) => {
      if (filteredReviews.length === 0) return;
      const currentIndex = selectedId ? filteredReviews.findIndex((r) => r.id === selectedId) : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : filteredReviews.length - 1
          : Math.min(filteredReviews.length - 1, Math.max(0, currentIndex + delta));
      selectReview(filteredReviews[nextIndex] ?? null);
    },
    [filteredReviews, selectedId, selectReview]
  );

  const selectedIndex = useMemo(
    () => (selectedId ? filteredReviews.findIndex((r) => r.id === selectedId) : -1),
    [filteredReviews, selectedId]
  );

  const advanceToNextReview = useCallback(
    (fromId: string) => {
      const idx = filteredReviews.findIndex((r) => r.id === fromId);
      if (idx === -1) return;
      const next =
        filteredReviews.slice(idx + 1).find((r) => !repliedIds.has(r.id)) ??
        filteredReviews.slice(0, idx).find((r) => !repliedIds.has(r.id)) ??
        filteredReviews[idx + 1] ??
        null;
      selectReview(next);
    },
    [filteredReviews, repliedIds, selectReview]
  );

  const markRepliedAndAdvance = useCallback(
    (reviewId: string) => {
      markReplied(reviewId);
      advanceToNextReview(reviewId);
    },
    [advanceToNextReview, markReplied]
  );

  const sendReply = useCallback(async () => {
    if (!selectedReview || !activeAccount || !replyDraft.trim()) return;
    const reviewId = selectedReview.id;
    setSendBusy(true);
    try {
      const res = await fetchWithTimeout(apiUrl("/api/reviews/reply"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: activeAccount.id,
          reviewId,
          message: replyDraft.trim(),
          business_profile_id: activeBusinessProfileId ?? activeProfileId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(displayString(payload?.message) || displayString(payload?.error) || "Kunde inte skicka svar");
      }
      markReplied(reviewId);
      setReplySent(true);
      toast({ title: "Svar skickat", description: "Ditt svar skickades via Zernio." });
      window.setTimeout(() => advanceToNextReview(reviewId), 500);
    } catch (e) {
      toast({
        title: "Kunde inte skicka svar",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setSendBusy(false);
    }
  }, [
    activeAccount,
    activeBusinessProfileId,
    activeProfileId,
    advanceToNextReview,
    markReplied,
    replyDraft,
    selectedReview,
    toast,
  ]);

  const getRowMeta = useCallback(
    (review: ReviewItem) => ({
      needsReply: !repliedIds.has(review.id),
      formattedDate: formatDate(review.createdAt),
      fullDate: formatFullDate(review.createdAt),
      senderInitial: senderInitial(review.author),
      avatarClass: avatarColor(review.author || review.id),
    }),
    [repliedIds]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked() || isTypingTarget(e.target)) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateRelative(1);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateRelative(-1);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (matchesKey(e, "a") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        setReplyFilter("all");
        return;
      }
      if (matchesKey(e, "n") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        setReplyFilter("needs_reply");
        return;
      }
      if (matchesKey(e, "m") && isPlainLetterShortcut(e) && selectedReview && !repliedIds.has(selectedReview.id)) {
        e.preventDefault();
        markRepliedAndAdvance(selectedReview.id);
        return;
      }
      if (matchesKey(e, "d") && isPlainLetterShortcut(e) && selectedReview && !repliedIds.has(selectedReview.id)) {
        e.preventDefault();
        void draftReply(selectedReview);
        return;
      }
      if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        selectReview(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    draftReply,
    markRepliedAndAdvance,
    navigateRelative,
    repliedIds,
    selectReview,
    selectedId,
    selectedReview,
  ]);

  const detailProps = useMemo(() => {
    if (!selectedReview) return null;
    return {
      replyDraft,
      onReplyDraftChange: setReplyDraft,
      draftBusy,
      sendBusy,
      replySent,
      isReplied: repliedIds.has(selectedReview.id),
      onDraftReply: () => void draftReply(selectedReview),
      onSendReply: () => void sendReply(),
      onNextAfterSend: () => advanceToNextReview(selectedReview.id),
      onBack: () => selectReview(null),
      navigation:
        filteredReviews.length > 1 && selectedIndex >= 0
          ? {
              index: selectedIndex,
              total: filteredReviews.length,
              hasPrev: selectedIndex > 0,
              hasNext: selectedIndex < filteredReviews.length - 1,
              onPrev: () => navigateRelative(-1),
              onNext: () => navigateRelative(1),
            }
          : undefined,
    };
  }, [
    advanceToNextReview,
    draftBusy,
    filteredReviews.length,
    navigateRelative,
    repliedIds,
    replyDraft,
    replySent,
    selectedIndex,
    selectedReview,
    sendBusy,
    sendReply,
  ]);

  const emptyTitle =
    replyFilter === "needs_reply" && needsReplyReviews.length === 0
      ? "Inget kvar att svara på"
      : ratingFilter !== "all"
        ? "Inga recensioner med det betyget"
        : "Inga recensioner ännu";
  const emptyDescription =
    replyFilter === "needs_reply"
      ? "Alla omdömen i den här vyn har redan svar."
      : ratingFilter !== "all"
        ? "Prova ett annat stjärnfilter eller visa alla betyg."
        : "Kontot returnerade inga omdömen. Tryck Uppdatera eller kontrollera kopplingen under Kopplingar.";

  const isMobile = useIsMobile();
  const isStackedWorkspace = useStackedWorkspace();
  const focusedReading = useFocusedWorkspaceReading(Boolean(selectedReview));

  return (
    <div className={cn("max-w-7xl w-full", focusedReading ? "space-y-0" : "space-y-8")}>
      {!focusedReading ? (
        <>
      <PageHeader
        icon={Star}
        title="Recensioner"
        description={
          isMobile
            ? "Tryck en recension för att läsa och svara."
            : displayString(data?.profile?.name)
              ? `${displayString(data?.profile?.name)}${displayString(data?.profile?.location) ? ` · ${displayString(data?.profile?.location)}` : ""}`
              : "Koppla Google Reviews eller Tripadvisor under Kopplingar för att komma igång"
        }
        actions={
          activeAccount ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
              className="text-muted-foreground"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Uppdatera</span>
            </Button>
          ) : null
        }
      />

      <PageSmartBar
        title={
          isMobile
            ? "Filtrera och tryck en recension — AI hjälper dig skriva svar."
            : "Recensioner samlar kundfeedback — svara snabbt, håll koll på betyg och prioritera det som behöver svar."
        }
        steps={
          isMobile
            ? reviewAccounts.length === 0
              ? [
                  "Koppla Google Reviews eller Tripadvisor under Kopplingar",
                  "Tryck en recension för att läsa när de synkats",
                  "Skicka svar och markera hanterad",
                ]
              : ["Filtrera på betyg eller ”Behöver svar”", "Tryck en recension för att läsa", "Skicka svar och markera hanterad"]
            : [
                "Koppla Google Reviews eller Tripadvisor under Kopplingar",
                "Filtrera på betyg eller ”Behöver svar” i workspace",
                "Skriv svar med AI-utkast och markera hanterade när du är klar",
              ]
        }
        tip="AI kan föreslå svar på omdömen — granska och skicka när det känns rätt."
        extraActions={
          reviewAccounts.length === 0 && isMobile
            ? [{ label: "Öppna Kopplingar", to: "/connections" }]
            : []
        }
      />

      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <SectionConnectionStatus area="reviews" />
      </m.div>

      <ReviewReplyQueueSection
        onUseDraft={(item) => {
          const match = reviews.find((r) => r.id === item.reviewId);
          if (match) selectReview(match);
          setReplyDraft(item.draft);
          toast({ title: "Utkast tillämpat", description: `Svar till ${item.author} är redo att redigera och skicka.` });
        }}
      />
        </>
      ) : null}

      {oauthErrorDetails && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(oauthErrorDetails)}
            onDismiss={clearOauthError}
          />
        </m.div>
      )}

      {error && activeAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-destructive">{error}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void refresh()}>
                  Försök igen
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                  Stäng
                </Button>
              </div>
            </CardContent>
          </Card>
        </m.div>
      )}

      {loading && activeAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Card key={i} className="bg-card border-border">
                <CardContent className="p-5 space-y-2">
                  <div className="h-5 w-5 rounded bg-muted animate-pulse" />
                  <div className="h-8 w-16 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        </m.div>
      )}

      {data?.note && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/40 border-border">
            <CardContent className="py-3 px-4">
              <p className="text-sm text-muted-foreground">{data.note}</p>
            </CardContent>
          </Card>
        </m.div>
      )}

      {reviewAccounts.length > 1 && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }} className="flex gap-2 flex-wrap">
          {reviewAccounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId("reviews", acc.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeAccount?.id === acc.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {acc.username} · {acc.platform === "google_reviews" ? "Google Reviews" : "Tripadvisor"}
            </button>
          ))}
        </m.div>
      )}

      {!loading && !activeAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.4 }}>
          <EmptyState
            icon={Star}
            title="Inget recensionskonto kopplat"
            description="Koppla Google Reviews eller Tripadvisor under Kopplingar — sedan synkas omdömen hit automatiskt."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/connections">Öppna Kopplingar</Link>
              </Button>
            }
          />
        </m.div>
      )}

      {!loading && activeAccount && reviews.length === 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <Star className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-2xl font-bold">{averageRating != null ? averageRating.toFixed(1) : "—"}</p>
                <p className="text-sm text-muted-foreground">Snittbetyg</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <MessageSquare className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-2xl font-bold">{reviewCount ?? reviews.length}</p>
                <p className="text-sm text-muted-foreground">Recensioner</p>
              </CardContent>
            </Card>
          </div>
        </m.div>
      )}

      {!loading && activeAccount && placeInfo && (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                Business information
              </CardTitle>
              <CardDescription>
                Hämtat via {placeInfo.source === "zernio" ? "Zernio" : "Official API"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium">{placeInfo.title}</p>
                {placeInfo.subtitle ? <p className="text-muted-foreground">{placeInfo.subtitle}</p> : null}
              </div>
              {placeInfo.address ? (
                <p className="flex gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{placeInfo.address}</span>
                </p>
              ) : null}
              {placeInfo.phone ? (
                <p className="flex gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{placeInfo.phone}</span>
                </p>
              ) : null}
              {placeInfo.externalUrl ? (
                <a
                  href={placeInfo.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Globe2 className="h-4 w-4" />
                  <span>{(placeInfo.website || placeInfo.externalUrl).replace(/^https?:\/\//, "")}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </CardContent>
          </Card>
        </m.div>
      )}

      {!loading && activeAccount && reviews.length === 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <EmptyState
            icon={MessageSquare}
            title="Inga recensioner ännu"
            description="Kontot returnerade inga omdömen. Uppdatera, eller kontrollera kopplingen under Kopplingar."
            action={
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
                Uppdatera
              </Button>
            }
            secondaryAction={
              <Button asChild variant="ghost" size="sm">
                <Link to="/connections">Kopplingar</Link>
              </Button>
            }
          />
        </m.div>
      )}

      {!loading && reviews.length > 0 && (
        <m.div
          {...fadeUp}
          transition={{ duration: 0.35 }}
          className={cn(
            "app-workspace-shell",
            focusedReading && "workspace-reading-focus rounded-none border-0 shadow-none"
          )}
        >
          {!focusedReading ? (
          <div className="app-workspace-toolbar flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
            <div className="relative w-full min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={reviewSearch}
                onChange={(e) => setReviewSearch(e.target.value)}
                placeholder="Sök recensioner…"
                className={cn(
                  "border-border/60 bg-background/60 pl-8 text-sm shadow-sm",
                  isMobile ? "h-10" : "h-8 text-xs"
                )}
                aria-label="Sök recensioner"
              />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <Select value={ratingFilter} onValueChange={(v) => setRatingFilter(v as typeof ratingFilter)}>
                <SelectTrigger className={cn("w-full border-border/60 bg-background/60 text-sm shadow-sm sm:w-[140px]", isMobile ? "h-10" : "h-8 text-xs")}>
                  <SelectValue placeholder="Alla betyg" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla betyg</SelectItem>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} stjärn{n === 1 ? "a" : "or"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={replyFilter} onValueChange={(v) => setReplyFilter(v as typeof replyFilter)}>
                <SelectTrigger className={cn("w-full border-border/60 bg-background/60 text-sm shadow-sm sm:w-[140px]", isMobile ? "h-10" : "h-8 text-xs")}>
                  <SelectValue placeholder="Alla" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla recensioner (A)</SelectItem>
                  <SelectItem value="needs_reply">Behöver svar (N)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          ) : null}

          {!focusedReading ? (
          <div className="app-workspace-stats grid grid-cols-3 gap-2 px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
              <Star className="h-3.5 w-3.5 shrink-0 text-primary" />
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Snittbetyg</p>
                <p className="text-xs font-semibold tabular-nums">{averageRating != null ? averageRating.toFixed(1) : "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Totalt</p>
                <p className="text-xs font-semibold tabular-nums">{reviewCount ?? reviews.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-2.5 py-1.5">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Öppna svar</p>
                <p className="text-xs font-semibold tabular-nums text-primary">{needsReplyReviews.length}</p>
              </div>
            </div>
          </div>
          ) : null}

          <div className="min-h-0 flex-1">
            <ReviewWorkspace
              filteredReviews={filteredReviews}
              selectedReview={selectedReview}
              selectedId={selectedId}
              loading={loading}
              needsReplyCount={needsReplyReviews.length}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
              getRowMeta={getRowMeta}
              onSelect={selectReview}
              detailProps={detailProps}
              searchQuery={debouncedReviewSearch}
            />
          </div>

          {!isStackedWorkspace ? (
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:px-4">
            <span className="truncate">
              {selectedReview ? (
                <>
                  Vald:{" "}
                  <span className="font-medium text-foreground/80">{selectedReview.author}</span>
                </>
              ) : (
                "Välj en recension i listan"
              )}
            </span>
            <span className="hidden sm:inline">
              J/K · M Mark · D Draft · A/N filter · / Search
            </span>
          </div>
          ) : null}
        </m.div>
      )}
    </div>
  );
}
