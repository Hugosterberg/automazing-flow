import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { m } from "framer-motion";
import { Star, MessageSquare, RefreshCw, Loader2, ExternalLink, MapPin, Phone, Globe2, Info, Search, Send } from "lucide-react";
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
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
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
import { formatFullDateTime, formatSmartDate } from "@/lib/format";
import { platformLabel } from "@/lib/platformLabels";
import { senderInitial } from "@/features/messages";

function sortReviewAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "google_reviews" ? 0 : p === "tripadvisor" ? 1 : p === "judgeme" ? 2 : 9);
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
    photos?: Array<{ id: string; caption?: string; url: string }>;
  };
  judgemeInfo?: {
    source: "official";
    shopDomain?: string;
    website?: string;
    totalCount?: number;
    loadedCount?: number;
    verifiedCount?: number;
    withPicturesCount?: number;
    /** Reviews per star ("1".."5") among the fetched reviews. */
    ratingCounts?: Record<string, number>;
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

/** How long a review must stay selected before its AI draft is requested. */
const AUTO_DRAFT_DELAY_MS = 500;

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

function avatarColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function ReviewsPage() {
  const { t } = useTranslation("reviews");
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
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestEmail, setRequestEmail] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestOrderId, setRequestOrderId] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

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
    accountFilter: (a) =>
      (a.platform === "google_reviews" || a.platform === "tripadvisor" || a.platform === "judgeme") &&
      Boolean(a.isOAuth),
    initialData: null,
    requestKey: activeBusinessProfileId ?? activeProfileId,
    scopeSort: sortReviewAccounts,
    fetcher: async (accountId) => {
      const res = await fetchWithTimeout(accountDataUrl(accountId, activeBusinessProfileId ?? activeProfileId), { credentials: "include" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(displayString(payload?.error) || displayString(payload?.message) || "Kunde inte hämta recensioner");
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
        title: displayString(review.title) || undefined,
        text: displayString(review.text),
        createdAt: displayString(review.createdAt),
        url: displayString(review.url),
        source: displayString(review.source),
        pictures: Array.isArray(review.pictures)
          ? review.pictures
              .map((picture) => {
                const thumb = displayString((picture as { thumb?: unknown })?.thumb);
                const full = displayString((picture as { full?: unknown })?.full) || thumb;
                return thumb ? { thumb, full } : null;
              })
              .filter((picture): picture is { thumb: string; full: string } => picture !== null)
          : undefined,
        verified: review.verified === true,
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
          (r.title ?? "").toLowerCase().includes(q) ||
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

  const draftReply = useCallback(
    async (r: ReviewItem) => {
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
        if (!res.ok) throw new Error(displayString(payload?.error) || "Kunde inte skapa svarsutkast");
        setReplyDraft(displayString(payload?.draft));
      } catch (e) {
        toast({
          title: "AI-utkast misslyckades",
          description: e instanceof Error ? e.message : "Okänt fel",
          variant: "destructive",
        });
      } finally {
        setDraftBusy(false);
      }
    },
    [activeBusinessProfileId, activeProfileId, data?.profile?.name, toast]
  );

  // Auto-draft one AI reply per selected review. The autoDraftForId guard makes
  // this idempotent even when the review list refreshes with new object identities.
  //
  // The short delay matters: J/K moves the selection on every keypress, so
  // skimming a list used to fire one OpenAI request per review passed over.
  // Waiting for the selection to settle keeps the "open a review, get a draft"
  // behaviour while only paying for reviews the user actually stops on.
  useEffect(() => {
    if (!selectedReview || repliedIds.has(selectedReview.id)) return;
    if (draftBusy || sendBusy || replySent) return;
    if (autoDraftForId.current === selectedReview.id) return;
    const reviewToDraft = selectedReview;
    const timer = window.setTimeout(() => {
      autoDraftForId.current = reviewToDraft.id;
      void draftReply(reviewToDraft);
    }, AUTO_DRAFT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [selectedReview, draftBusy, sendBusy, replySent, repliedIds, draftReply]);

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
    if (data?.judgemeInfo) {
      const jm = data.judgemeInfo;
      const verified = displayNumber(jm.verifiedCount);
      const withPictures = displayNumber(jm.withPicturesCount);
      const loaded = displayNumber(jm.loadedCount);
      const subtitleParts = [
        verified != null && loaded != null
          ? `${verified} av ${loaded} verifierade köp`
          : verified != null
            ? `${verified} verifierade köp`
            : "",
        withPictures != null && withPictures > 0 ? `${withPictures} med kundbilder` : "",
      ].filter(Boolean);
      return {
        title: displayString(data.profile?.name) || displayString(jm.shopDomain) || "Judge.me",
        subtitle: subtitleParts.join(" · "),
        website: displayString(jm.website),
        externalUrl: normalizeExternalUrl(displayString(jm.website)),
        source: "official" as const,
      };
    }
    return null;
  }, [data]);

  const ratingBreakdown = useMemo(() => {
    const counts = data?.judgemeInfo?.ratingCounts;
    if (!counts || typeof counts !== "object") return null;
    const rows = [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: displayNumber(counts[String(stars)]) ?? 0,
    }));
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return total > 0 ? { rows, total } : null;
  }, [data]);

  const placePhotos = useMemo(
    () =>
      (Array.isArray(data?.tripadvisorInfo?.photos) ? data.tripadvisorInfo.photos : [])
        .map((photo, index) => ({
          id: displayString(photo?.id) || String(index),
          caption: displayString(photo?.caption) || undefined,
          url: displayString(photo?.url),
        }))
        .filter((photo) => photo.url),
    [data]
  );

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

  // Judge.me's public API has no reply endpoint — the "send" action instead
  // copies the draft for pasting into the Judge.me admin and marks it handled.
  const isCopyOnlyReplies = activeAccount?.platform === "judgeme";

  const sendReply = useCallback(async () => {
    if (!selectedReview || !activeAccount || !replyDraft.trim()) return;
    const reviewId = selectedReview.id;
    if (isCopyOnlyReplies) {
      try {
        await navigator.clipboard.writeText(replyDraft.trim());
        markReplied(reviewId);
        setReplySent(true);
        toast({
          title: "Svar kopierat",
          description: "Klistra in svaret i Judge.me admin (Reviews → Manage reviews).",
        });
        window.setTimeout(() => advanceToNextReview(reviewId), 500);
      } catch {
        toast({
          title: "Kunde inte kopiera",
          description: "Markera texten och kopiera manuellt.",
          variant: "destructive",
        });
      }
      return;
    }
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
    isCopyOnlyReplies,
    markReplied,
    replyDraft,
    selectedReview,
    toast,
  ]);

  const sendJudgemeReviewRequest = useCallback(async () => {
    if (!activeAccount || activeAccount.platform !== "judgeme") return;
    const email = requestEmail.trim();
    const orderId = requestOrderId.trim();
    if (!email || !orderId) return;
    setRequestBusy(true);
    try {
      const res = await fetchWithTimeout(apiUrl("/api/reviews/judgeme/send-request"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: activeAccount.id,
          email,
          name: requestName.trim() || undefined,
          orderId,
          business_profile_id: activeBusinessProfileId ?? activeProfileId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(displayString(payload?.error) || "Kunde inte skicka recensionsförfrågan");
      }
      setRequestDialogOpen(false);
      toast({
        title: "Recensionsförfrågan skickad",
        description: `Judge.me mailar ${email} en förfrågan med recensionsformulär.`,
      });
    } catch (e) {
      toast({
        title: "Kunde inte skicka",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setRequestBusy(false);
    }
  }, [activeAccount, activeBusinessProfileId, activeProfileId, requestEmail, requestName, requestOrderId, toast]);

  const getRowMeta = useCallback(
    (review: ReviewItem) => ({
      needsReply: !repliedIds.has(review.id),
      formattedDate: formatSmartDate(review.createdAt),
      fullDate: formatFullDateTime(review.createdAt),
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
      ...(isCopyOnlyReplies
        ? { sendLabel: "Kopiera svar", sentNotice: "Svar kopierat — klistra in i Judge.me admin" }
        : {}),
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
    draftReply,
    filteredReviews.length,
    isCopyOnlyReplies,
    navigateRelative,
    repliedIds,
    replyDraft,
    replySent,
    selectedIndex,
    selectedReview,
    selectReview,
    sendBusy,
    sendReply,
  ]);

  const emptyTitle =
    replyFilter === "needs_reply" && needsReplyReviews.length === 0
      ? t("emptyAllHandled")
      : ratingFilter !== "all"
        ? t("emptyRating")
        : t("emptyReviewsTitle");
  const emptyDescription =
    replyFilter === "needs_reply"
      ? t("emptyAllHandledDesc")
      : ratingFilter !== "all"
        ? t("emptyRatingDesc")
        : t("emptyReviewsDesc");

  const isMobile = useIsMobile();
  const isStackedWorkspace = useStackedWorkspace();
  const focusedReading = useFocusedWorkspaceReading(Boolean(selectedReview));

  type ReviewsTab = "inbox" | "drafts" | "place";
  const REVIEWS_TABS: ReviewsTab[] = ["inbox", "drafts", "place"];
  const rawReviewsTab = searchParams.get("tab");
  const reviewsTab: ReviewsTab =
    rawReviewsTab && (REVIEWS_TABS as string[]).includes(rawReviewsTab)
      ? (rawReviewsTab as ReviewsTab)
      : "inbox";

  function setReviewsTab(tab: ReviewsTab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "inbox") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className={cn("max-w-7xl w-full", focusedReading ? "space-y-0" : "space-y-8")}>
      {!focusedReading ? (
        <>
      <PageHeader
        icon={Star}
        title={t("title")}
        description={
          isMobile
            ? t("descriptionMobile")
            : displayString(data?.profile?.name)
              ? `${displayString(data?.profile?.name)}${displayString(data?.profile?.location) ? ` · ${displayString(data?.profile?.location)}` : ""}`
              : t("descriptionEmpty")
        }
        actions={
          activeAccount ? (
            <div className="flex items-center gap-1.5">
              {activeAccount.platform === "judgeme" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRequestEmail("");
                    setRequestName("");
                    setRequestOrderId("");
                    setRequestDialogOpen(true);
                  }}
                >
                  <Send className="h-4 w-4" />
                  <span className="ml-1.5 hidden sm:inline">Recensionsförfrågan</span>
                </Button>
              ) : null}
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
                <span className="ml-1.5 hidden sm:inline">{t("refresh")}</span>
              </Button>
            </div>
          ) : null
        }
      />

      <PageSmartBar
        title={isMobile ? t("smartMobile") : t("smartDesktop")}
        steps={
          isMobile
            ? reviewAccounts.length === 0
              ? [
                  "Koppla Google Reviews, Tripadvisor eller Judge.me under Kopplingar",
                  "Tryck en recension för att läsa när de synkats",
                  "Skicka svar och markera hanterad",
                ]
              : ["Filtrera på betyg eller ”Behöver svar”", "Tryck en recension för att läsa", "Skicka svar och markera hanterad"]
            : [
                "Koppla Google Reviews, Tripadvisor eller Judge.me under Kopplingar",
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

      {(reviewsTab === "inbox" || focusedReading) && reviewAccounts.length === 0 ? (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <SectionConnectionStatus area="reviews" hideWhenHealthy />
        </m.div>
      ) : null}

      <PageModeTabs
        value={reviewsTab}
        aria-label="Recensionsflikar"
        onChange={setReviewsTab}
        options={[
          { value: "inbox", label: "Inkorg", count: reviews.length },
          { value: "drafts", label: "Utkast" },
          { value: "place", label: "Verksamhet" },
        ]}
      />

      {reviewsTab === "drafts" ? (
      <ReviewReplyQueueSection
        onUseDraft={(item) => {
          const match = reviews.find((r) => r.id === item.reviewId);
          if (match) {
            setReviewsTab("inbox");
            selectReview(match);
          }
          setReplyDraft(item.draft);
          toast({ title: "Utkast tillämpat", description: `Svar till ${item.author} är redo att redigera och skicka.` });
        }}
      />
      ) : null}
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

      {(reviewsTab === "inbox" || focusedReading) && loading && activeAccount && (
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

      {(reviewsTab === "inbox" || focusedReading) && data?.note && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/40 border-border">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 px-4">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">{data.note}</p>
                {data?.source === "zernio" ? (
                  <p className="text-[11px] text-muted-foreground">{t("noteOfficialHint")}</p>
                ) : null}
              </div>
              <Button asChild variant="outline" size="sm" className="h-8 shrink-0 text-xs">
                <Link
                  to={`/connections?session=${
                    activeAccount?.platform === "tripadvisor"
                      ? "tripadvisor"
                      : activeAccount?.platform === "judgeme"
                        ? "judgeme"
                        : "google_reviews"
                  }`}
                >
                  {t("officialReconnect")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </m.div>
      )}

      {(reviewsTab === "inbox" || focusedReading) && reviewAccounts.length > 1 && (
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
              {acc.username} · {platformLabel(acc.platform)}
            </button>
          ))}
        </m.div>
      )}

      {(reviewsTab === "inbox" || focusedReading) && !loading && !activeAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.4 }}>
          <EmptyState
            icon={Star}
            title={t("emptyAccountTitle")}
            description={t("emptyAccountDesc")}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/connections?session=google_reviews">{t("emptyConnectCta")}</Link>
              </Button>
            }
          />
        </m.div>
      )}

      {!focusedReading && reviewsTab === "place" ? (
        !loading && activeAccount && placeInfo ? (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                {t("placeTitle")}
              </CardTitle>
              <CardDescription>
                {t("placeSource", {
                  source: placeInfo.source === "zernio" ? "Zernio" : "Official API",
                })}
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
              {ratingBreakdown ? (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Betygsfördelning
                  </p>
                  {ratingBreakdown.rows.map((row) => (
                    <div key={row.stars} className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{row.stars} ★</span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-500/80"
                          style={{ width: `${Math.round((row.count / ratingBreakdown.total) * 100)}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {row.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {placePhotos.length > 0 ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Foton från Tripadvisor
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {placePhotos.map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.url}
                        alt={photo.caption || "Tripadvisor-foto"}
                        title={photo.caption}
                        loading="lazy"
                        className="aspect-square w-full rounded-md border border-border/60 object-cover"
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </m.div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("placeEmpty")}
          </p>
        )
      ) : null}

      {(reviewsTab === "inbox" || focusedReading) && !loading && activeAccount && reviews.length === 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <EmptyState
            icon={MessageSquare}
            title={t("emptyReviewsTitle")}
            description={t("emptyReviewsDesc")}
            action={
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
                {t("refresh")}
              </Button>
            }
            secondaryAction={
              <Button asChild variant="ghost" size="sm">
                <Link
                  to={`/connections?session=${
                    activeAccount?.platform === "tripadvisor"
                      ? "tripadvisor"
                      : activeAccount?.platform === "judgeme"
                        ? "judgeme"
                        : "google_reviews"
                  }`}
                >
                  {data?.source === "zernio" ? t("officialReconnect") : t("emptyConnectCta")}
                </Link>
              </Button>
            }
          />
        </m.div>
      )}

      {(reviewsTab === "inbox" || focusedReading) && !loading && reviews.length > 0 && (
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
                placeholder={t("searchPlaceholder")}
                className={cn(
                  "border-border/60 bg-background/60 pl-8 text-sm shadow-sm",
                  isMobile ? "h-10" : "h-8 text-xs"
                )}
                aria-label={t("searchAria")}
              />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <Select value={ratingFilter} onValueChange={(v) => setRatingFilter(v as typeof ratingFilter)}>
                <SelectTrigger className={cn("w-full border-border/60 bg-background/60 text-sm shadow-sm sm:w-[140px]", isMobile ? "h-10" : "h-8 text-xs")}>
                  <SelectValue placeholder={t("allRatings")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allRatings")}</SelectItem>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t("stars", { count: n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={replyFilter} onValueChange={(v) => setReplyFilter(v as typeof replyFilter)}>
                <SelectTrigger className={cn("w-full border-border/60 bg-background/60 text-sm shadow-sm sm:w-[140px]", isMobile ? "h-10" : "h-8 text-xs")}>
                  <SelectValue placeholder={t("filterAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("replyFilterAll")}</SelectItem>
                  <SelectItem value="needs_reply">{t("replyFilterNeeds")}</SelectItem>
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
              emptyAction={
                replyFilter === "needs_reply" && needsReplyReviews.length === 0 ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/automations?tab=messages&focus=review-reply-auto">
                      {t("emptyAllHandledCta")}
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/connections?q=reviews">{t("emptyConnectCta")}</Link>
                  </Button>
                )
              }
              emptySecondaryAction={
                replyFilter === "needs_reply" && needsReplyReviews.length === 0 ? undefined : (
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/automations?tab=messages&focus=review-reply-auto">
                      {t("emptyAutoHintCta")}
                    </Link>
                  </Button>
                )
              }
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

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Skicka recensionsförfrågan via Judge.me</DialogTitle>
            <DialogDescription>
              Judge.me mailar kunden en förfrågan med recensionsformulär och sköter påminnelser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="judgeme-request-email">Kundens e-post</Label>
              <Input
                id="judgeme-request-email"
                type="email"
                placeholder="kund@example.com"
                value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="judgeme-request-order">Order-id (från butiken)</Label>
              <Input
                id="judgeme-request-order"
                placeholder="t.ex. 5678901234567"
                value={requestOrderId}
                onChange={(e) => setRequestOrderId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="judgeme-request-name">Kundens namn (valfritt)</Label>
              <Input
                id="judgeme-request-name"
                placeholder="Anna Andersson"
                value={requestName}
                onChange={(e) => setRequestName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void sendJudgemeReviewRequest()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)} disabled={requestBusy}>
              Avbryt
            </Button>
            <Button
              onClick={() => void sendJudgemeReviewRequest()}
              disabled={requestBusy || !requestEmail.trim() || !requestOrderId.trim()}
            >
              {requestBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Skicka
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
