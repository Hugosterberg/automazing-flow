import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AccountPlatform, AccountStats, ConnectedAccount, Profile } from "@/types/accounts";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

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
  showOverview: boolean;
  setShowOverview: (v: boolean) => void;
  allAccounts: ConnectedAccount[];
}

const AccountsContext = createContext<AccountsContextValue | null>(null);

type ProfileRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

type AccountRow = {
  id: string;
  user_id: string;
  profile_id: string;
  platform: AccountPlatform;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  connected_at: string;
  is_oauth: boolean;
  is_zernio: boolean;
  zernio_account_id: string | null;
  stats: AccountStats | null;
  analysis: ConnectedAccount["analysis"] | null;
};

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
        const mapped = data.map((raw: ConnectedAccount & { profileId?: string; lateAccountId?: string }) => {
          const { lateAccountId, ...a } = raw;
          const zid = a.zernioAccountId || lateAccountId;
          return {
            ...a,
            profileId: a.profileId || "default",
            ...(zid ? { zernioAccountId: zid } : {}),
          };
        });
        return dedupeAccountsByProfilePlatform(mapped);
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function dedupeAccountsByProfilePlatform(accounts: ConnectedAccount[]): ConnectedAccount[] {
  const latestByKey = new Map<string, ConnectedAccount>();

  for (const account of accounts) {
    const key = `${account.profileId}::${account.platform}`;
    const prev = latestByKey.get(key);
    if (!prev) {
      latestByKey.set(key, account);
      continue;
    }
    const prevTs = Date.parse(prev.connectedAt || "");
    const nextTs = Date.parse(account.connectedAt || "");
    const keepNext = Number.isNaN(prevTs) || (!Number.isNaN(nextTs) && nextTs >= prevTs);
    latestByKey.set(key, keepNext ? account : prev);
  }

  return [...latestByKey.values()];
}

function loadActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

function activeProfileStorageKey(userId?: string | null): string {
  return userId ? `${ACTIVE_PROFILE_KEY}:${userId}` : ACTIVE_PROFILE_KEY;
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
  const { enabled, loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;
  const [profiles, setProfiles] = useState<Profile[]>(() =>
    ensureDefaultProfile(loadProfiles(), loadAccounts())
  );
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(loadActiveProfileId);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(loadAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const hydratingRef = useRef(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const effectiveProfileId = activeProfileId ?? activeProfile?.id ?? "default";

  useEffect(() => {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    if (profiles.length === 0) {
      if (activeProfileId !== null) setActiveProfileIdState(null);
      return;
    }
    if (activeProfileId && !profiles.some((p) => p.id === activeProfileId)) {
      setActiveProfileIdState(profiles[0].id);
    }
  }, [profiles, activeProfileId]);

  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem(activeProfileStorageKey(user?.id), activeProfileId);
    }
  }, [activeProfileId, user?.id]);

  useEffect(() => {
    if (!enabled || authLoading || !supabase) return;
    if (!user) return;

    let ignore = false;

    const hydrate = async () => {
      hydratingRef.current = true;
      try {
        const [{ data: profileRows, error: profilesError }, { data: accountRows, error: accountsError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("id,user_id,name,created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: true }),
            supabase
              .from("connected_accounts")
              .select(
                "id,user_id,profile_id,platform,username,display_name,avatar_url,profile_url,connected_at,is_oauth,is_zernio,zernio_account_id,stats,analysis"
              )
              .eq("user_id", userId)
              .order("connected_at", { ascending: true }),
          ]);

        if (profilesError || accountsError) {
          console.warn("[accounts] Supabase hydrate failed, using local cache", profilesError || accountsError);
          return;
        }
        if (ignore) return;

        let mappedProfiles = (profileRows ?? []).map((p: ProfileRow) => ({
          id: p.id,
          name: p.name,
          createdAt: p.created_at,
        }));
        let mappedAccounts = (accountRows ?? []).map((a: AccountRow) => ({
          id: a.id,
          profileId: a.profile_id,
          platform: a.platform,
          username: a.username,
          displayName: a.display_name ?? undefined,
          avatarUrl: a.avatar_url ?? undefined,
          profileUrl: a.profile_url ?? undefined,
          connectedAt: a.connected_at,
          isOAuth: a.is_oauth,
          isZernio: a.is_zernio,
          zernioAccountId: a.zernio_account_id ?? undefined,
          stats: a.stats ?? undefined,
          analysis: a.analysis ?? undefined,
        })) as ConnectedAccount[];
        mappedAccounts = dedupeAccountsByProfilePlatform(mappedAccounts);

        if (mappedProfiles.length === 0 && mappedAccounts.length === 0) {
          const localAccounts = loadAccounts();
          const localProfiles = ensureDefaultProfile(loadProfiles(), localAccounts);
          const hasMeaningfulLocalData =
            localAccounts.length > 0 || localProfiles.some((p) => p.id !== "default");
          if (hasMeaningfulLocalData) {
            mappedProfiles = localProfiles;
            mappedAccounts = localAccounts;
          }
        }

        const nextProfiles = ensureDefaultProfile(mappedProfiles, mappedAccounts);
        setProfiles(nextProfiles);
        setAccounts(mappedAccounts);

        const storedActive = localStorage.getItem(activeProfileStorageKey(userId));
        const activeExists = storedActive && nextProfiles.some((p) => p.id === storedActive);
        setActiveProfileIdState(activeExists ? storedActive : nextProfiles[0]?.id ?? null);
      } finally {
        hydratingRef.current = false;
      }
    };

    void hydrate();

    return () => {
      ignore = true;
    };
  }, [enabled, authLoading, user, userId]);

  useEffect(() => {
    if (!enabled || authLoading || !user || !supabase) return;
    if (hydratingRef.current) return;

    const sync = async () => {
      try {
        const profileRows: ProfileRow[] = profiles.map((p) => ({
          id: p.id,
          user_id: userId,
          name: p.name,
          created_at: p.createdAt,
        }));
        const accountRows: AccountRow[] = accounts.map((a) => ({
          id: a.id,
          user_id: userId,
          profile_id: a.profileId,
          platform: a.platform,
          username: a.username,
          display_name: a.displayName ?? null,
          avatar_url: a.avatarUrl ?? null,
          profile_url: a.profileUrl ?? null,
          connected_at: a.connectedAt,
          is_oauth: Boolean(a.isOAuth),
          is_zernio: Boolean(a.isZernio),
          zernio_account_id: a.zernioAccountId ?? null,
          stats: a.stats ?? null,
          analysis: a.analysis ?? null,
        }));

        await supabase.from("connected_accounts").delete().eq("user_id", userId);
        await supabase.from("profiles").delete().eq("user_id", userId);

        if (profileRows.length > 0) {
          const { error } = await supabase.from("profiles").insert(profileRows);
          if (error) throw error;
        }
        if (accountRows.length > 0) {
          const { error } = await supabase.from("connected_accounts").insert(accountRows);
          if (error) throw error;
        }
      } catch (e) {
        console.warn("[accounts] Supabase sync failed, kept local cache", e);
      }
    };

    void sync();
  }, [enabled, authLoading, user, userId, profiles, accounts]);

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
      setAccounts((prev) => {
        const next = prev.filter(
          (a) => !(a.profileId === effectiveProfileId && a.platform === platform)
        );
        return [...next, newAccount];
      });
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
      const hasValidRequestedProfile = Boolean(
        profileId && profiles.some((p) => p.id === profileId)
      );
      const targetProfileId =
        hasValidRequestedProfile && profileId ? profileId : effectiveProfileId;
      const profileUrls: Record<string, string> = {
        youtube: "youtube.com",
        shopify: "myshopify.com",
        notion: "notion.so",
        gmail: "mail.google.com",
        outlook: "outlook.com",
        google_calendar: "calendar.google.com",
        outlook_calendar: "outlook.office.com/calendar",
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
        const next = prev.filter((a) => {
          if (a.id === accountId) return false;
          const sameProfileAndPlatform =
            a.profileId === targetProfileId && a.platform === platform;
          return !sameProfileAndPlatform;
        });
        return [...next, newAccount];
      });
      if (hasValidRequestedProfile && profileId && profileId !== activeProfileId) {
        setActiveProfileId(profileId);
      }
    },
    [effectiveProfileId, activeProfileId, setActiveProfileId, profiles]
  );

  const removeAccount = useCallback(async (id: string) => {
    try {
      await fetch(`/api/accounts/${id}`, { method: "DELETE", credentials: "include" });
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
        showOverview,
        setShowOverview,
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
