import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { m } from "framer-motion";
import { Star, MessageSquare, RefreshCw, Loader2, ExternalLink, MapPin, Phone, Globe2, Info, Sparkles, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { apiUrl } from "@/lib/apiBase";
import type { ConnectedAccount } from "@/types/accounts";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useReviewReplyState, ReviewReplyQueueSection } from "@/features/reviews";
import { ReplyTemplatePicker } from "@/features/reply-templates";
import { accountDataUrl } from "@/lib/accountDataUrl";

function sortReviewAccounts(a: ConnectedAccount, b: ConnectedAccount): number {
  const rank = (p: string) => (p === "google_reviews" ? 0 : p === "tripadvisor" ? 1 : 9);
  const d = rank(a.platform) - rank(b.platform);
  if (d !== 0) return d;
  return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
}

type ReviewItem = {
  id: string;
  author: string;
  rating?: number;
  text: string;
  createdAt?: string;
  url?: string;
  source?: string;
};

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

export default function ReviewsPage() {
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { toast } = useToast();
  const { activeProfileId, accounts, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const activeBusinessProfileId = useActiveBusinessProfileIdOptional();
  const selectedAccountId = getSelectedAccountId("reviews");
  const [searchParams] = useSearchParams();
  const { repliedIds, markReplied, syncPendingCount } = useReviewReplyState(
    activeBusinessProfileId ?? activeProfileId
  );

  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [draftBusy, setDraftBusy] = useState<Record<string, boolean>>({});
  const [sendBusy, setSendBusy] = useState<Record<string, boolean>>({});
  const [ratingFilter, setRatingFilter] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const [replyFilter, setReplyFilter] = useState<"all" | "needs_reply">(() =>
    searchParams.get("filter") === "needs_reply" ? "needs_reply" : "all"
  );
  const autoDraftStarted = useRef(false);
  const defaultedReplyFilter = useRef(false);

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
    return list;
  }, [reviews, ratingFilter, replyFilter, repliedIds]);

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

  async function draftReply(r: { id: string; author: string; rating?: number; text: string }) {
    setDraftBusy((cur) => ({ ...cur, [r.id]: true }));
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
      setReplyText((cur) => ({ ...cur, [r.id]: displayString(payload?.draft) }));
    } catch (e) {
      toast({
        title: "AI draft failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDraftBusy((cur) => ({ ...cur, [r.id]: false }));
    }
  }

  useEffect(() => {
    if (autoDraftStarted.current || loading || reviews.length === 0) return;
    const next = reviews.find((r) => !repliedIds.has(r.id));
    if (!next) return;
    autoDraftStarted.current = true;
    void draftReply(next);
  }, [loading, reviews, repliedIds]);

  async function sendReply(reviewId: string) {
    const message = (replyText[reviewId] || "").trim();
    if (!activeAccount || !message) return;
    setSendBusy((cur) => ({ ...cur, [reviewId]: true }));
    try {
      const res = await fetchWithTimeout(apiUrl("/api/reviews/reply"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: activeAccount.id,
          reviewId,
          message,
          business_profile_id: activeBusinessProfileId ?? activeProfileId,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(displayString(payload?.message) || displayString(payload?.error) || "Could not send reply");
      }
      markReplied(reviewId);
      toast({ title: "Reply posted", description: "Your reply was sent via Zernio." });
    } catch (e) {
      toast({
        title: "Could not send reply",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSendBusy((cur) => ({ ...cur, [reviewId]: false }));
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <PageHeader
        icon={Star}
        title="Reviews"
        description={
          displayString(data?.profile?.name)
            ? `${displayString(data?.profile?.name)}${displayString(data?.profile?.location) ? ` · ${displayString(data?.profile?.location)}` : ""}`
            : "Connect Google Reviews or Tripadvisor to get started"
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
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
          ) : null
        }
      />

      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <SectionConnectionStatus area="reviews" />
      </m.div>

      <ReviewReplyQueueSection
        onUseDraft={(item) => {
          setReplyText((cur) => ({ ...cur, [item.reviewId]: item.draft }));
          toast({ title: "Draft applied", description: `Reply for ${item.author} is ready to edit and send.` });
        }}
      />

      {oauthErrorDetails && (
        <m.div {...fadeUp} transition={{ duration: 0.3 }}>
          <OAuthErrorAlert
            details={oauthErrorDetails}
            message={formatOAuthErrorMessage(
              oauthErrorDetails,
              {
                google_reviews_not_configured: "Google Reviews is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.",
                google_reviews_no_account_access: "Google OAuth succeeded, but no Business Profile account is accessible for this Google user.",
                google_reviews_no_location_access: "Business account found, but no locations are accessible. Ensure the location is claimed and shared with this Google user.",
                google_reviews_accounts_api_failed: "Google Business Accounts API failed. Check that Business Profile APIs are enabled in Google Cloud and OAuth app is approved.",
                google_reviews_locations_api_failed: "Google Business Locations API failed. Check API enablement and permissions for Business Profile.",
                tripadvisor_not_configured: "Tripadvisor official API is not configured. Add TRIPADVISOR_API_KEY and TRIPADVISOR_LOCATION_ID to .env, or connect via Zernio.",
                zernio_connect_failed: "Zernio could not start the Tripadvisor/Reviews connect flow. Use Official API, or check that Zernio supports this platform for your workspace.",
                zernio_init_failed: "Zernio could not initialize the Reviews connect flow. Use Official API, or check ZERNIO_API_KEY/ZERNIO_PROFILE_ID.",
              },
              "Connect failed"
            )}
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
                  Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                  Dismiss
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading reviews…
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
      {oauthErrorDetails?.hint && (
        <Card className="bg-muted/40 border-border">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">
              Provider hint: {decodeURIComponent(oauthErrorDetails.hint)}
            </p>
          </CardContent>
        </Card>
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
            title="No review account connected"
            description='Use "Connect more" in the sidebar under Reviews to connect Google Reviews or Tripadvisor.'
          />
        </m.div>
      )}

      {!loading && activeAccount && (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <Star className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{averageRating != null ? averageRating.toFixed(1) : "—"}</p>
                <p className="text-sm text-muted-foreground">Average rating</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{reviewCount ?? reviews.length}</p>
                <p className="text-sm text-muted-foreground">Reviews</p>
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
                Loaded from {placeInfo.source === "zernio" ? "Zernio" : "the official provider API"}.
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
            title="No reviews yet"
            description="This account returned no reviews. Try Refresh or check the provider connection."
            action={
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
                Refresh
              </Button>
            }
          />
        </m.div>
      )}

      {!loading && reviews.length > 0 && (
        <m.div {...fadeUp} transition={{ duration: 0.35 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Recent reviews</CardTitle>
                  <CardDescription>
                    Latest customer feedback from the connected source.
                    {ratingFilter !== "all" ? ` · ${filteredReviews.length} at ${ratingFilter} stars` : ""}
                  </CardDescription>
                </div>
                <Select value={ratingFilter} onValueChange={(v) => setRatingFilter(v as typeof ratingFilter)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="All ratings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ratings</SelectItem>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} star{n === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={replyFilter} onValueChange={(v) => setReplyFilter(v as typeof replyFilter)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="All reviews" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All reviews</SelectItem>
                    <SelectItem value="needs_reply">Needs reply</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {filteredReviews.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No reviews match this rating filter.</p>
              ) : (
              filteredReviews.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{r.author || "Anonymous"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.rating != null ? `${r.rating}/5` : "No rating"} {r.createdAt ? `· ${new Date(r.createdAt).toLocaleDateString("en-US")}` : ""}
                      </p>
                    </div>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{r.text || "No text"}</p>

                  {repliedIds.has(r.id) ? (
                    <p className="mt-3 text-xs text-emerald-600 inline-flex items-center gap-1">
                      <Send className="h-3.5 w-3.5" /> Reply posted
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={replyText[r.id] || ""}
                        onChange={(e) => setReplyText((cur) => ({ ...cur, [r.id]: e.target.value }))}
                        placeholder="Write a reply, or generate one with AI…"
                        className="min-h-[72px] text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void draftReply(r)}
                          disabled={draftBusy[r.id]}
                        >
                          {draftBusy[r.id] ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          AI draft
                        </Button>
                        <ReplyTemplatePicker
                          onInsert={(text) => setReplyText((cur) => ({ ...cur, [r.id]: text }))}
                          recipientName={r.author}
                          disabled={sendBusy[r.id]}
                        />
                        <Button
                          size="sm"
                          onClick={() => void sendReply(r.id)}
                          disabled={sendBusy[r.id] || !(replyText[r.id] || "").trim()}
                        >
                          {sendBusy[r.id] ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send reply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )))}
            </CardContent>
          </Card>
        </m.div>
      )}
    </div>
  );
}
