import { useMemo } from "react";
import { motion } from "framer-motion";
import { Star, MessageSquare, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { useAccountData } from "@/hooks/useAccountData";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { SectionConnectionStatus } from "@/components/SectionConnectionStatus";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { apiUrl } from "@/lib/apiBase";
import type { ConnectedAccount } from "@/types/accounts";

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
  note?: string;
} | null;

const fadeUp = { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 } };

export default function ReviewsPage() {
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const { accounts, getSelectedAccountId, setSelectedAccountId } = useAccounts();
  const selectedAccountId = getSelectedAccountId("reviews");

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
    scopeSort: sortReviewAccounts,
    fetcher: async (accountId) => {
      const res = await fetch(apiUrl(`/api/accounts/${accountId}/data`), { credentials: "include" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not fetch reviews");
      }
      return res.json();
    },
  });

  const stats = data?.stats;
  const reviews = useMemo(() => data?.reviews || [], [data]);

  return (
    <div className="space-y-8 max-w-5xl">
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reviews</h1>
            <p className="text-muted-foreground mt-1">
              {data?.profile?.name
                ? `${data.profile.name}${data.profile.location ? ` · ${data.profile.location}` : ""}`
                : "Connect Google Reviews or Tripadvisor to get started"}
            </p>
          </div>
          {activeAccount && (
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading} className="text-muted-foreground">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1.5 hidden sm:inline">Refresh</span>
            </Button>
          )}
        </div>
      </motion.div>

      <motion.div {...fadeUp} transition={{ duration: 0.35 }}>
        <SectionConnectionStatus area="reviews" />
      </motion.div>

      {oauthErrorDetails && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
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
              },
              "Connect failed"
            )}
            onDismiss={clearOauthError}
          />
        </motion.div>
      )}

      {error && activeAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {data?.note && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-muted/40 border-border">
            <CardContent className="py-3 px-4">
              <p className="text-sm text-muted-foreground">{data.note}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}
      {oauthHint && (
        <Card className="bg-muted/40 border-border">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground">Provider hint: {decodeURIComponent(oauthHint)}</p>
          </CardContent>
        </Card>
      )}

      {reviewAccounts.length > 1 && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }} className="flex gap-2 flex-wrap">
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
        </motion.div>
      )}

      {!loading && !activeAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
          <Card className="bg-card border-border border-dashed">
            <CardContent className="py-16 text-center space-y-2">
              <p className="text-lg font-semibold">No review account connected</p>
              <p className="text-sm text-muted-foreground">
                Use "Connect more" in the sidebar under Reviews to connect Google Reviews or Tripadvisor.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!loading && activeAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.35 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <Star className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{typeof stats?.averageRating === "number" ? stats.averageRating.toFixed(1) : "—"}</p>
                <p className="text-sm text-muted-foreground">Average rating</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{stats?.reviewCount ?? reviews.length}</p>
                <p className="text-sm text-muted-foreground">Reviews</p>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      )}

      {!loading && reviews.length > 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.35 }}>
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Recent reviews</CardTitle>
              <CardDescription>Latest customer feedback from the connected source.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {reviews.map((r) => (
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
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
