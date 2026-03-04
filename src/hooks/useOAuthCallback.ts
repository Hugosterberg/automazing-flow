import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccounts } from "@/context/AccountsContext";
import type { AccountPlatform } from "@/types/accounts";

export function useOAuthCallback() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { addAccountFromOAuth, setSelectedAccountId } = useAccounts();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthSuccess = searchParams.get("oauth_success");
    const oauthErr = searchParams.get("oauth_error");
    const platform = searchParams.get("platform");
    const accountId = searchParams.get("account_id");
    const username = searchParams.get("username");
    const profileId = searchParams.get("profile_id");

    if (oauthErr) {
      setError(oauthErr);
      const next = new URLSearchParams(searchParams);
      next.delete("oauth_error");
      setSearchParams(next);
    } else if (oauthSuccess && platform && accountId && username) {
      const lateAccountId = searchParams.get("late_account_id") ?? undefined;
      addAccountFromOAuth(
        accountId,
        platform as AccountPlatform,
        decodeURIComponent(username),
        profileId ?? undefined,
        lateAccountId ? { lateAccountId } : undefined
      );
      setSelectedAccountId(accountId);
      const next = new URLSearchParams(searchParams);
      next.delete("oauth_success");
      next.delete("platform");
      next.delete("account_id");
      next.delete("username");
      next.delete("profile_id");
      next.delete("late_account_id");
      setSearchParams(next);
    }
  }, [searchParams]);

  return { oauthError: error, clearOauthError: () => setError(null) };
}
