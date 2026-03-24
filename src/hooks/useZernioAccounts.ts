import { useCallback, useState } from "react";
import type { AccountPlatform, SocialPlatform } from "@/types/accounts";

const API_BASE = (import.meta.env.VITE_API_URL || "").trim() || "/api";

export type ZernioAccountRow = {
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
      const r = await fetch(`${API_BASE}/zernio/accounts`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof j.error === "string" ? j.error : "Could not load Zernio accounts");
      }
      setZernioAccounts(Array.isArray(j.accounts) ? j.accounts : []);
    } catch (e) {
      setZernioAccounts([]);
      setZernioError(e instanceof Error ? e.message : "Zernio request failed");
    } finally {
      setZernioLoading(false);
    }
  }, []);

  const linkZernioAccount = useCallback(
    async (row: ZernioAccountRow) => {
      const zid = String(row.id || row.accountId || "").trim();
      if (!zid) return null;
      setZernioLinking(zid);
      setZernioError(null);
      try {
        const r = await fetch(`${API_BASE}/zernio/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zernioAccountId: zid,
            profile_id: activeProfileId ?? undefined,
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
