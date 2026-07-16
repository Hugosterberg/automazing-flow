import { useEffect, useRef } from "react";
import type { AccountPlatform, ConnectedAccount } from "@/types/accounts";
import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const MESSAGE_ACCOUNT_PLATFORMS = ["gmail", "outlook", "instagram", "facebook", "whatsapp"] as const;

type Args = {
  accounts: ConnectedAccount[];
  activeProfileId: string | null | undefined;
  ensureBackendSession: () => Promise<void>;
  addAccountFromOAuth: (
    accountId: string,
    platform: AccountPlatform,
    username: string,
    profileId?: string,
    extra?: {
      displayName?: string;
      isZernio?: boolean;
      zernioAccountId?: string;
      switchActiveProfile?: boolean;
    }
  ) => void;
};

/**
 * Best-effort hydration of mail/DM accounts from the backend into AccountsContext.
 */
export function useSyncMessageAccounts({
  accounts,
  activeProfileId,
  ensureBackendSession,
  addAccountFromOAuth,
}: Args) {
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    let ignore = false;

    async function syncMailAccountsFromBackend() {
      try {
        await ensureBackendSession();
        const platforms = MESSAGE_ACCOUNT_PLATFORMS;
        const existingAccountIds = new Set(accountsRef.current.map((account) => account.id));
        for (const platform of platforms) {
          const params = new URLSearchParams({ platform });
          if (activeProfileId) params.set("business_profile_id", activeProfileId);
          let res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${params.toString()}`), {
            credentials: "include",
          });
          if (res.status === 401) {
            await ensureBackendSession();
            res = await fetchWithTimeout(apiUrl(`/api/accounts/connected?${params.toString()}`), {
              credentials: "include",
            });
          }
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || ignore) continue;

          const backendAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
          for (const account of backendAccounts) {
            const accountId = String(account.account_id || "");
            if (!accountId || existingAccountIds.has(accountId)) continue;
            existingAccountIds.add(accountId);
            addAccountFromOAuth(
              accountId,
              platform,
              String(
                account.username ||
                  (platform === "gmail" ? "Gmail" : platform === "outlook" ? "Outlook" : platform)
              ),
              account.profile_id ? String(account.profile_id) : undefined,
              {
                displayName: account.displayName ? String(account.displayName) : undefined,
                isZernio: Boolean(account.isZernio),
                zernioAccountId: account.zernioAccountId ? String(account.zernioAccountId) : undefined,
                // Background hydration must not flip the active profile.
                switchActiveProfile: false,
              }
            );
          }
        }
      } catch {
        // Best-effort hydration only.
      }
    }

    void syncMailAccountsFromBackend();
    return () => {
      ignore = true;
    };
  }, [activeProfileId, addAccountFromOAuth, ensureBackendSession]);
}

export { MESSAGE_ACCOUNT_PLATFORMS };
