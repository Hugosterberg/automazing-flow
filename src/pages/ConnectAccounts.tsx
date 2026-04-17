import { useCallback, useMemo, useState } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { getOAuthProfileId } from "@/lib/oauthProfile";
import { formatOAuthErrorMessage } from "@/lib/oauthErrors";
import { OAuthErrorAlert } from "@/components/OAuthErrorAlert";
import { ConnectionsMap } from "@/components/ConnectionsMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountPlatform } from "@/types/accounts";
import { Loader2, PlugZap, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { apiUrl } from "@/lib/apiBase";

const ZERNIO_CONNECT_PLATFORMS: {
  platform: AccountPlatform;
  label: string;
  authPath: string;
  provider?: "zernio";
  hint?: string;
}[] = [
  { platform: "instagram", label: "Instagram", authPath: "instagram" },
  { platform: "facebook", label: "Facebook", authPath: "facebook" },
  { platform: "whatsapp", label: "WhatsApp", authPath: "whatsapp" },
  { platform: "google_business", label: "Google Business Profile", authPath: "google_business", provider: "zernio" },
  { platform: "tiktok", label: "TikTok", authPath: "tiktok", provider: "zernio" },
  { platform: "google_calendar", label: "Google Calendar", authPath: "google_calendar", provider: "zernio" },
  { platform: "outlook_calendar", label: "Outlook Calendar", authPath: "outlook_calendar", provider: "zernio" },
  { platform: "google_reviews", label: "Google Reviews", authPath: "google_reviews", provider: "zernio" },
  { platform: "tripadvisor", label: "Tripadvisor", authPath: "tripadvisor", provider: "zernio", hint: "Vissa konton kan kräva manuell setup." },
];

function platformLabel(p: AccountPlatform): string {
  const row = ZERNIO_CONNECT_PLATFORMS.find((x) => x.platform === p);
  return row?.label ?? p;
}

export default function ConnectAccountsPage() {
  const { activeProfileId, activeProfile, allAccounts } = useAccounts();
  const { oauthErrorDetails, clearOauthError } = useOAuthCallback();
  const [zernioTest, setZernioTest] = useState<{ loading: boolean; error?: string; count?: number }>({
    loading: false,
  });
  const [tokenTest, setTokenTest] = useState<{ loading: boolean; error?: string; count?: number }>({
    loading: false,
  });

  const disconnectedForProfile = useMemo(
    () => allAccounts.filter((a) => a.profileId === activeProfileId && a.disconnectedAt),
    [allAccounts, activeProfileId]
  );

  const startConnect = useCallback(
    (authPath: string, options?: { provider?: "zernio" }) => {
      const params = new URLSearchParams();
      params.set("oauth_return", "integrations");
      const pid = getOAuthProfileId(activeProfileId);
      if (pid) params.set("profile_id", pid);
      if (options?.provider) params.set("provider", options.provider);
      window.location.href = `${apiUrl(`/api/auth/${authPath}`)}?${params.toString()}`;
    },
    [activeProfileId]
  );

  const runZernioTest = useCallback(async () => {
    setZernioTest({ loading: true });
    try {
      const r = await fetch(apiUrl("/api/zernio/accounts"), { credentials: "include" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setZernioTest({
          loading: false,
          error: typeof body.error === "string" ? body.error : r.statusText || "Request failed",
        });
        return;
      }
      const list = Array.isArray(body.accounts) ? body.accounts : [];
      setZernioTest({ loading: false, count: list.length });
    } catch (e) {
      setZernioTest({ loading: false, error: e instanceof Error ? e.message : "Network error" });
    }
  }, []);

  const runTokenTest = useCallback(async () => {
    setTokenTest({ loading: true });
    try {
      const r = await fetch(apiUrl("/api/accounts/connected"), { credentials: "include" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setTokenTest({
          loading: false,
          error: typeof body.error === "string" ? body.error : r.statusText || "Request failed",
        });
        return;
      }
      const list = Array.isArray(body.accounts) ? body.accounts : [];
      setTokenTest({ loading: false, count: list.length });
    } catch (e) {
      setTokenTest({ loading: false, error: e instanceof Error ? e.message : "Network error" });
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <PlugZap className="h-7 w-7 text-muted-foreground" />
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground">
          See what is already linked to{" "}
          <span className="font-medium text-foreground">{activeProfile?.name ?? "the active profile"}</span>, what each
          integration needs on the server, and where to click to connect the rest. Switch profile on Home first if you
          are setting up another business.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link to="/preferences" className="underline underline-offset-2 font-medium text-foreground">
            Preferences → API keys
          </Link>{" "}
          stores prerequisites in <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> — it does not by
          itself link accounts; you still run each provider&apos;s Connect flow from the pages below or the sidebar.
        </p>
      </div>

      {oauthErrorDetails ? (
        <OAuthErrorAlert
          details={oauthErrorDetails}
          message={formatOAuthErrorMessage(oauthErrorDetails)}
          onDismiss={clearOauthError}
        />
      ) : null}

      {disconnectedForProfile.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-orange-200/90">Previously connected</h2>
          <div className="space-y-2">
            {disconnectedForProfile.map((a) => {
              const row = ZERNIO_CONNECT_PLATFORMS.find((z) => z.platform === a.platform);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-500/45 bg-orange-500/5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-orange-100">{platformLabel(a.platform)}</p>
                    <p className="text-xs text-orange-200/70">@{a.username}</p>
                  </div>
                  {row ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-orange-500/50 text-orange-100 hover:bg-orange-500/10"
                      onClick={() => startConnect(row.authPath)}
                    >
                      Reconnect
                    </Button>
                  ) : (
                    <span className="text-xs text-orange-200/60">Reconnect from the relevant app section</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <ConnectionsMap />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connect via Zernio</CardTitle>
          <CardDescription>
            Samlad integrationsflik för alla kanaler som backend stödjer via Zernio-flöden.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {ZERNIO_CONNECT_PLATFORMS.map(({ label, authPath, provider, hint }) => (
            <button
              key={authPath}
              type="button"
              onClick={() => startConnect(authPath, provider ? { provider } : undefined)}
              className="flex flex-col items-stretch rounded-md border border-border bg-card/40 px-4 py-3 text-left text-sm transition-colors hover:border-muted-foreground/50 hover:bg-accent/30"
            >
              <span className="font-medium">{label}</span>
              {hint ? <span className="text-xs text-muted-foreground mt-1">{hint}</span> : null}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Test backend access
          </CardTitle>
          <CardDescription>
            Confirms the server can list Zernio workspaces and read the OAuth token store (not the same as “linked in
            sidebar”, but useful when debugging).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => void runZernioTest()}
              disabled={zernioTest.loading}
            >
              {zernioTest.loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
              Zernio workspace
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => void runTokenTest()}
              disabled={tokenTest.loading}
            >
              {tokenTest.loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
              App session tokens
            </Button>
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {zernioTest.count != null ? <span>Zernio API: {zernioTest.count} account(s)</span> : null}
            {zernioTest.error ? <span className="text-destructive">{zernioTest.error}</span> : null}
            {tokenTest.count != null ? <span>Server tokens: {tokenTest.count} account(s)</span> : null}
            {tokenTest.error ? <span className="text-destructive">{tokenTest.error}</span> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
