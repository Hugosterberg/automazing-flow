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
const SELECTED_ACCOUNTS_STORAGE_KEY = "automazing-selected-accounts";

export type AccountSection = "social-media" | "ecommerce" | "messages" | "calendar" | "reviews" | "content";

type SelectedAccountsState = Record<string, Partial<Record<AccountSection, string | null>>>;

interface AccountsContextValue {
  profiles: Profile[];
  profilesReady: boolean;
  activeProfile: Profile | null;
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  addProfile: (name: string) => Profile;
  renameProfile: (id: string, name: string) => void;
  updateProfile: (
    id: string,
    updates: Partial<Pick<Profile, "name" | "website" | "email" | "phone" | "company" | "location" | "notes">>
  ) => void;
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
  getSelectedAccountId: (section: AccountSection) => string | null;
  setSelectedAccountId: (section: AccountSection, id: string | null) => void;
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
        return mapped;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function loadSelectedAccounts(): SelectedAccountsState {
  try {
    const stored = localStorage.getItem(SELECTED_ACCOUNTS_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return {};
    const out: SelectedAccountsState = {};
    for (const [profileId, scoped] of Object.entries(parsed as Record<string, unknown>)) {
      if (!scoped || typeof scoped !== "object") continue;
      const s = { ...(scoped as Record<string, string | null>) };
      if ("mail" in s && !("messages" in s)) s.messages = s.mail;
      delete s.mail;
      out[profileId] = s as Partial<Record<AccountSection, string | null>>;
    }
    return out;
  } catch {
    return {};
  }
}

function cleanupSelectedAccounts(
  selections: SelectedAccountsState,
  profiles: Profile[],
  accounts: ConnectedAccount[]
): SelectedAccountsState {
  const validProfileIds = new Set(profiles.map((profile) => profile.id));
  const validAccountIdsByProfile = new Map<string, Set<string>>();

  for (const account of accounts) {
    const ids = validAccountIdsByProfile.get(account.profileId) ?? new Set<string>();
    ids.add(account.id);
    validAccountIdsByProfile.set(account.profileId, ids);
  }

  return Object.fromEntries(
    Object.entries(selections).flatMap(([profileId, scopedSelections]) => {
      if (!validProfileIds.has(profileId) || !scopedSelections || typeof scopedSelections !== "object") {
        return [];
      }

      const validIds = validAccountIdsByProfile.get(profileId) ?? new Set<string>();
      const nextSelections = Object.fromEntries(
        Object.entries(scopedSelections).flatMap(([section, accountId]) => {
          if (accountId == null) return [[section, null]];
          return validIds.has(accountId) ? [[section, accountId]] : [];
        })
      ) as Partial<Record<AccountSection, string | null>>;

      return [[profileId, nextSelections]];
    })
  );
}

async function syncProfilesAndAccounts({
  profiles,
  accounts,
  userId,
}: {
  profiles: Profile[];
  accounts: ConnectedAccount[];
  userId: string;
}) {
  if (!supabase) return;

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

  if (profileRows.length > 0) {
    const { error } = await supabase.from("profiles").upsert(profileRows);
    if (error) throw error;
  }

  if (accountRows.length > 0) {
    const { error } = await supabase.from("connected_accounts").upsert(accountRows);
    if (error) throw error;
  }

  const profileIds = profileRows.map((row) => row.id);
  const accountIds = accountRows.map((row) => row.id);

  let profileDeleteQuery = supabase.from("profiles").delete().eq("user_id", userId);
  if (profileIds.length > 0) {
    profileDeleteQuery = profileDeleteQuery.not("id", "in", `(${profileIds.map((id) => `"${id}"`).join(",")})`);
  }
  const { error: profileDeleteError } = await profileDeleteQuery;
  if (profileDeleteError) throw profileDeleteError;

  let accountDeleteQuery = supabase.from("connected_accounts").delete().eq("user_id", userId);
  if (accountIds.length > 0) {
    accountDeleteQuery = accountDeleteQuery.not("id", "in", `(${accountIds.map((id) => `"${id}"`).join(",")})`);
  }
  const { error: accountDeleteError } = await accountDeleteQuery;
  if (accountDeleteError) throw accountDeleteError;
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
  const [selectedAccountIds, setSelectedAccountIds] = useState<SelectedAccountsState>(loadSelectedAccounts);
  const [showOverview, setShowOverview] = useState(false);
  const [profilesReady, setProfilesReady] = useState(false);
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
    localStorage.setItem(SELECTED_ACCOUNTS_STORAGE_KEY, JSON.stringify(selectedAccountIds));
  }, [selectedAccountIds]);

  useEffect(() => {
    if (profiles.length === 0) {
      if (activeProfileId !== null) setActiveProfileIdState(null);
      return;
    }
    if (!activeProfileId) {
      setActiveProfileIdState(profiles[0].id);
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
    setSelectedAccountIds((current) => cleanupSelectedAccounts(current, profiles, accounts));
  }, [profiles, accounts]);

  useEffect(() => {
    if (authLoading) return;
    if (!enabled || !supabase || !user) {
      setProfilesReady(true);
      return;
    }

    let ignore = false;

    const hydrate = async () => {
      hydratingRef.current = true;
      setProfilesReady(false);
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
        const localProfileMap = new Map(loadProfiles().map((p) => [p.id, p]));
        mappedProfiles = mappedProfiles.map((p) => {
          const local = localProfileMap.get(p.id);
          if (!local) return p;
          return {
            ...p,
            website: local.website,
            email: local.email,
            phone: local.phone,
            company: local.company,
            location: local.location,
            notes: local.notes,
          };
        });
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
        setSelectedAccountIds((current) => cleanupSelectedAccounts(current, nextProfiles, mappedAccounts));

        const storedActive = localStorage.getItem(activeProfileStorageKey(userId));
        const activeExists = storedActive && nextProfiles.some((p) => p.id === storedActive);
        setActiveProfileIdState(activeExists ? storedActive : nextProfiles[0]?.id ?? null);
      } finally {
        hydratingRef.current = false;
        if (!ignore) {
          setProfilesReady(true);
        }
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
        await syncProfilesAndAccounts({ profiles, accounts, userId });
      } catch (e) {
        console.warn("[accounts] Supabase sync failed, kept local cache", e);
      }
    };

    void sync();
  }, [enabled, authLoading, user, userId, profiles, accounts]);

  const setActiveProfileId = useCallback((id: string | null) => {
    setActiveProfileIdState(id);
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

  const updateProfile = useCallback(
    (
      id: string,
      updates: Partial<Pick<Profile, "name" | "website" | "email" | "phone" | "company" | "location" | "notes">>
    ) => {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const next: Profile = {
            ...p,
            ...(updates.name != null ? { name: updates.name.trim() || p.name } : {}),
            ...(updates.website !== undefined ? { website: updates.website.trim() || undefined } : {}),
            ...(updates.email !== undefined ? { email: updates.email.trim() || undefined } : {}),
            ...(updates.phone !== undefined ? { phone: updates.phone.trim() || undefined } : {}),
            ...(updates.company !== undefined ? { company: updates.company.trim() || undefined } : {}),
            ...(updates.location !== undefined ? { location: updates.location.trim() || undefined } : {}),
            ...(updates.notes !== undefined ? { notes: updates.notes.trim() || undefined } : {}),
          };
          return next;
        })
      );
    },
    []
  );

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
        const next = prev.filter((a) => a.id !== newAccount.id);
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
        google_reviews: "google.com/maps",
        tripadvisor: "tripadvisor.com",
        google_drive: "drive.google.com",
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
          const sameZernioAccount =
            extra?.zernioAccountId &&
            a.profileId === targetProfileId &&
            a.platform === platform &&
            a.zernioAccountId === extra.zernioAccountId;
          return !sameZernioAccount;
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
  const getSelectedAccountId = useCallback(
    (section: AccountSection) => {
      return selectedAccountIds[effectiveProfileId]?.[section] ?? null;
    },
    [effectiveProfileId, selectedAccountIds]
  );
  const setSelectedAccountId = useCallback(
    (section: AccountSection, id: string | null) => {
      setSelectedAccountIds((current) => {
        const currentProfileSelections = current[effectiveProfileId] ?? {};
        if ((currentProfileSelections[section] ?? null) === id) return current;
        return {
          ...current,
          [effectiveProfileId]: {
            ...currentProfileSelections,
            [section]: id,
          },
        };
      });
    },
    [effectiveProfileId]
  );

  return (
    <AccountsContext.Provider
      value={{
        profiles,
        profilesReady,
        activeProfile,
        activeProfileId: effectiveProfileId,
        setActiveProfileId,
        addProfile,
        renameProfile,
        updateProfile,
        removeProfile,
        accounts: accountsForActiveProfile,
        addAccount,
        addAccountFromOAuth,
        removeAccount,
        updateAccountAnalysis,
        updateAccountStats,
        getSelectedAccountId,
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
