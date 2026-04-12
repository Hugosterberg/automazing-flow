import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccounts, type AccountSection } from "@/context/AccountsContext";
import type { AccountPlatform } from "@/types/accounts";
import { parseOAuthErrorDetails, removeOAuthErrorParams, type OAuthErrorDetails } from "@/lib/oauthErrors";

function sectionForPlatform(platform: AccountPlatform): AccountSection {
  if (platform === "shopify" || platform === "notion") return "ecommerce";
  if (platform === "gmail" || platform === "outlook") return "messages";
  if (platform === "google_calendar" || platform === "outlook_calendar") return "calendar";
  if (platform === "google_reviews" || platform === "tripadvisor") return "reviews";
  if (platform === "google_drive") return "content";
  return "social-media";
}

export function useOAuthCallback() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { addAccountFromOAuth, setSelectedAccountId, profiles, profilesReady } = useAccounts();
  const [errorDetails, setErrorDetails] = useState<OAuthErrorDetails | null>(null);

  useEffect(() => {
    const oauthSuccess = searchParams.get("oauth_success");
    const oauthErr = searchParams.get("oauth_error");
    const platform = searchParams.get("platform");
    const accountId = searchParams.get("account_id");
    const username = searchParams.get("username");
    const profileId = searchParams.get("profile_id");
    const hasRequestedProfile =
      Boolean(profileId) && profiles.some((profile) => profile.id === profileId);

    if (oauthErr) {
      setErrorDetails(parseOAuthErrorDetails(searchParams));
      setSearchParams(removeOAuthErrorParams(searchParams));
    } else if (oauthSuccess && platform && accountId && username) {
      if (profileId && !profilesReady) {
        return;
      }
      const accountPlatform = platform as AccountPlatform;
      const zernioAccountId =
        searchParams.get("zernio_account_id") ?? searchParams.get("late_account_id") ?? undefined;
      addAccountFromOAuth(
        accountId,
        accountPlatform,
        decodeURIComponent(username),
        hasRequestedProfile && profileId ? profileId : undefined,
        zernioAccountId ? { zernioAccountId } : undefined
      );
      setSelectedAccountId(sectionForPlatform(accountPlatform), accountId);
      const next = new URLSearchParams(searchParams);
      next.delete("oauth_success");
      next.delete("platform");
      next.delete("account_id");
      next.delete("username");
      next.delete("profile_id");
      next.delete("zernio_account_id");
      next.delete("late_account_id");
      setSearchParams(next);
    }
  }, [searchParams, setSearchParams, addAccountFromOAuth, setSelectedAccountId, profiles, profilesReady]);

  return {
    oauthError: errorDetails?.code ?? null,
    oauthErrorDetails: errorDetails,
    clearOauthError: () => setErrorDetails(null),
  };
}
