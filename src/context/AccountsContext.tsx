import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AccountPlatform, AccountStats, ConnectedAccount, Profile } from "@/types/accounts";

const ACCOUNTS_STORAGE_KEY = "automazing-connected-accounts";
const PROFILES_STORAGE_KEY = "automazing-profiles";
const ACTIVE_PROFILE_KEY = "automazing-active-profile";

interface AccountsContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  addProfile: (name: string) => Profile;
  renameProfile: (id: string, name: string) => void;
  removeProfile: (id: string) => void;
  accounts: ConnectedAccount[];
  addAccount: (platform: AccountPlatform, username: string, extra?: Partial<ConnectedAccount>) => void;
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
  removeAccount: (id: string) => void;
  updateAccountAnalysis: (id: string, analysis: ConnectedAccount["analysis"]) => void;
  updateAccountStats: (id: string, stats: AccountStats | undefined) => void;
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  allAccounts: ConnectedAccount[];
}

const AccountsContext = createContext<AccountsContextValue | null>(null);

function loadProfiles(): Profile[] {
  try {
    const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return [];
}

function loadAccounts(): ConnectedAccount[] {
  try {
    const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // Migration: add profileId to older accounts
      if (Array.isArray(data)) {
        return data.map((raw: ConnectedAccount & { profileId?: string; lateAccountId?: string }) => {
          const { lateAccountId, ...a } = raw;
          const zid = a.zernioAccountId || lateAccountId;
          return {
            ...a,
            profileId: a.profileId || "default",
            ...(zid ? { zernioAccountId: zid } : {}),
          };
        });
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function loadActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

function ensureDefaultProfile(profiles: Profile[], accounts: ConnectedAccount[]): Profile[] {
  const hasDefault = profiles.some((p) => p.id === "default");
  const needsDefault = accounts.some((a) => !a.profileId || a.profileId === "default");
  if (!hasDefault && (profiles.length === 0 || needsDefault)) {
    return [
      { id: "default", name: "Default", createdAt: new Date().toISOString() },
      ...profiles.filter((p) => p.id !== "default"),
    ];
  }
  return profiles;
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(() =>
    ensureDefaultProfile(loadProfiles(), loadAccounts())
  );
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(loadActiveProfileId);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(loadAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const effectiveProfileId = activeProfileId ?? activeProfile?.id ?? "default";

  useEffect(() => {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, activeProfileId);
    }
  }, [activeProfileId]);

  const setActiveProfileId = useCallback((id: string | null) => {
    setActiveProfileIdState(id);
    setSelectedAccountId(null);
  }, []);

  const addProfile = useCallback((name: string): Profile => {
    const newProfile: Profile = {
      id: crypto.randomUUID(),
      name: name.trim() || "New profile",
      createdAt: new Date().toISOString(),
    };
    setProfiles((prev) => [...prev, newProfile]);
    setActiveProfileId(newProfile.id);
    return newProfile;
  }, [setActiveProfileId]);

  const renameProfile = useCallback((id: string, name: string) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
    );
  }, []);

  const removeProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (activeProfileId === id) {
        setActiveProfileId(next[0]?.id ?? null);
      }
      return next;
    });
    setAccounts((prev) => prev.filter((a) => a.profileId !== id));
  }, [activeProfileId, setActiveProfileId]);

  const addAccount = useCallback(
    (platform: AccountPlatform, username: string, extra?: Partial<ConnectedAccount>) => {
      const newAccount: ConnectedAccount = {
        id: crypto.randomUUID(),
        profileId: effectiveProfileId,
        platform,
        username: username.trim(),
        connectedAt: new Date().toISOString(),
        ...extra,
      };
      setAccounts((prev) => [...prev, newAccount]);
    },
    [effectiveProfileId]
  );

  const addAccountFromOAuth = useCallback(
    (
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
  ) => {
      const targetProfileId = profileId ?? effectiveProfileId;
      const profileUrls: Record<string, string> = {
        youtube: "youtube.com",
        shopify: "myshopify.com",
        gmail: "mail.google.com",
        outlook: "outlook.com",
        facebook: "facebook.com",
        google_business: "google.com/maps",
        whatsapp: "wa.me",
      };
      const base = profileUrls[platform] ?? platform + ".com";
      const defaultProfileUrl = `https://${base}/${username.replace(/^@/, "")}`;
      const newAccount: ConnectedAccount = {
        id: accountId,
        profileId: targetProfileId,
        platform,
        username: username.trim(),
        displayName: extra?.displayName?.trim() || undefined,
        connectedAt: new Date().toISOString(),
        profileUrl: extra?.profileUrl?.trim() || defaultProfileUrl,
        isOAuth: true,
        ...(extra?.zernioAccountId && { zernioAccountId: extra.zernioAccountId }),
        ...(extra?.isZernio && { isZernio: true }),
      };
      setAccounts((prev) => {
        if (prev.some((a) => a.id === accountId)) return prev;
        return [...prev, newAccount];
      });
      if (profileId && profileId !== activeProfileId) {
        setActiveProfileId(profileId);
      }
    },
    [effectiveProfileId, activeProfileId, setActiveProfileId]
  );

  const removeAccount = useCallback(async (id: string) => {
    try {
      await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    } catch {
      // Backend may not be running or account does not exist
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setSelectedAccountId((current) => (current === id ? null : current));
  }, []);

  const updateAccountAnalysis = useCallback((id: string, analysis: ConnectedAccount["analysis"]) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, analysis } : a))
    );
  }, []);

  const updateAccountStats = useCallback((id: string, stats: AccountStats | undefined) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, stats: stats ?? undefined } : a))
    );
  }, []);

  const accountsForActiveProfile = accounts.filter((a) => a.profileId === effectiveProfileId);

  return (
    <AccountsContext.Provider
      value={{
        profiles,
        activeProfile,
        activeProfileId: effectiveProfileId,
        setActiveProfileId,
        addProfile,
        renameProfile,
        removeProfile,
        accounts: accountsForActiveProfile,
        addAccount,
        addAccountFromOAuth,
        removeAccount,
        updateAccountAnalysis,
        updateAccountStats,
        selectedAccountId,
        setSelectedAccountId,
        allAccounts: accounts,
      }}
    >
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within AccountsProvider");
  return ctx;
}
