import { useCallback, useState } from "react";
import type { AccountPlatform, SocialPlatform } from "@/types/accounts";
import { appendOAuthProfileParams, getOAuthProfileId } from "@/lib/oauthProfile";

import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export type ZernioAccountRow = {
  _id?: string;
  id?: string;
  accountId?: string;
  mappedPlatform?: SocialPlatform;
  rawPlatform?: string;
  username?: string;
  name?: string;
  displayName?: string;
};

type UseZernioAccountsArgs = {
  activeProfileId: string | null;
  addAccountFromOAuth: (
    accountId: string,
    platform: AccountPlatform,
    username: string,
    profileId?: string,
    extra?: {
      zernioAccountId?: string;
      profileUrl?: string;
      displayName?: string;
      isZernio?: boolean;
    }
  ) => void;
};

export function useZernioAccounts({ activeProfileId, addAccountFromOAuth }: UseZernioAccountsArgs) {
  const [zernioAccounts, setZernioAccounts] = useState<ZernioAccountRow[]>([]);
  const [zernioLoading, setZernioLoading] = useState(false);
  const [zernioLinking, setZernioLinking] = useState<string | null>(null);
  const [zernioError, setZernioError] = useState<string | null>(null);

  const loadZernioAccounts = useCallback(async () => {
    setZernioLoading(true);
    setZernioError(null);
    try {
      const r = await fetchWithTimeout(apiUrl("/api/zernio/accounts"), { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof j.error === "string" ? j.error : "Kunde inte ladda Zernio-konton");
      }
      setZernioAccounts(Array.isArray(j.accounts) ? j.accounts : []);
    } catch (e) {
      setZernioAccounts([]);
      setZernioError(e instanceof Error ? e.message : "Zernio-anropet misslyckades");
    } finally {
      setZernioLoading(false);
    }
  }, []);

  const linkZernioAccount = useCallback(
    async (row: ZernioAccountRow) => {
      const zid = String(row.id || row.accountId || row._id || "").trim();
      if (!zid) return null;
      setZernioLinking(zid);
      setZernioError(null);
      try {
        const params = new URLSearchParams();
        appendOAuthProfileParams(params, activeProfileId);
        const r = await fetchWithTimeout(apiUrl("/api/zernio/link"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zernioAccountId: zid,
            business_profile_id: params.get("business_profile_id") ?? undefined,
            profile_id: getOAuthProfileId(activeProfileId) ?? undefined,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(typeof j.error === "string" ? j.error : "Link failed");
        }
        addAccountFromOAuth(
          j.account_id,
          j.platform as AccountPlatform,
          j.username,
          activeProfileId ?? undefined,
          {
            isZernio: true,
            zernioAccountId: j.zernioAccountId || zid,
            profileUrl: j.profileUrl,
            displayName: j.displayName,
          }
        );
        return j.account_id as string;
      } catch (e) {
        setZernioError(e instanceof Error ? e.message : "Link failed");
        return null;
      } finally {
        setZernioLinking(null);
      }
    },
    [activeProfileId, addAccountFromOAuth]
  );

  return {
    zernioAccounts,
    zernioLoading,
    zernioLinking,
    zernioError,
    setZernioError,
    loadZernioAccounts,
    linkZernioAccount,
  };
}
