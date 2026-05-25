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
import { apiUrl } from "@/lib/apiBase";
import { useBusinessProfileBridge } from "@/features/business-profiles";
import { logActivity } from "@/features/activity/activityLog";
import type { Json, TablesInsert } from "@/types/supabase";

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
  /**
   * Cloud mode: resolves after the row lands in `business_profiles` (React Query).
   * Local mode: resolves synchronously with the in-memory profile.
   */
  addProfile: (name: string) => Promise<Profile> | Profile;
  renameProfile: (id: string, name: string) => void | Promise<void>;
  updateProfile: (
    id: string,
    updates: Partial<Pick<Profile, "name" | "website" | "email" | "phone" | "company" | "location" | "notes">>
  ) => void | Promise<void>;
  removeProfile: (id: string) => void | Promise<void>;
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

/**
 * Shape we WRITE to `connected_accounts`. Derived from the generated Insert
 * type so that schema changes surface here at compile-time.
 * stats/analysis remain typed on the domain side; we cast to Json at the
 * boundary (Postgres jsonb accepts any record).
 */
type AccountRow = TablesInsert<"connected_accounts">;

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
    if (account.disconnectedAt) continue;
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

/**
 * Mirrors the in-memory `accounts` list back to `connected_accounts`. Does NOT
 * touch `profiles` anymore — business_profiles is owned by its React Query
 * hook and never synced from here.
 */
async function syncAccounts({
  accounts,
  userId,
}: {
  accounts: ConnectedAccount[];
  userId: string;
}) {
  if (!supabase) return;

  const activeAccounts = accounts.filter((a) => !a.disconnectedAt);
  const accountRows: AccountRow[] = activeAccounts.map((a) => ({
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
    // Cast at the DB boundary: jsonb accepts any record; the domain shapes
    // (AccountStats / AccountAnalysis) aren't structurally assignable to
    // the generated Json type due to missing string index signatures.
    stats: (a.stats ?? null) as unknown as Json,
    analysis: (a.analysis ?? null) as unknown as Json,
    disconnected_at: null,
  }));

  if (accountRows.length > 0) {
    const { error } = await supabase.from("connected_accounts").upsert(accountRows);
    if (error) throw error;
  }

  const accountIds = accountRows.map((row) => row.id);
  let accountDeleteQuery = supabase
    .from("connected_accounts")
    .delete()
    .eq("user_id", userId)
    .is("disconnected_at", null);
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
  // Legacy: if any accounts reference the "default" synthetic ID we keep a
  // placeholder profile so the sidebar still shows them. Cloud mode will
  // migrate them to a real business_profile_id on first reconcile.
  const hasDefault = profiles.some((p) => p.id === "default");
  const needsDefault = accounts.some((a) => !a.profileId || a.profileId === "default");
  if (!hasDefault && needsDefault) {
    return [
      { id: "default", name: "Mitt företag", createdAt: new Date().toISOString() },
      ...profiles.filter((p) => p.id !== "default"),
    ];
  }
  // Don't inject "default" when there are real profiles — cloud users always
  // have at least one business_profile with a UUID.
  return profiles;
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const { enabled, loading: authLoading, user } = useAuth();
  const userId = user?.id ?? null;
  const bridge = useBusinessProfileBridge();

  // Local-mode profile state (offline dev).
  // In cloud mode these are derived from the bridge; we still keep the state
  // declared so local-mode init logic is unchanged.
  const [localProfiles, setLocalProfiles] = useState<Profile[]>(() =>
    ensureDefaultProfile(loadProfiles(), loadAccounts())
  );
  const [localActiveProfileId, setLocalActiveProfileIdState] = useState<string | null>(
    loadActiveProfileId
  );

  const [accounts, setAccounts] = useState<ConnectedAccount[]>(loadAccounts);
  const [selectedAccountIds, setSelectedAccountIds] = useState<SelectedAccountsState>(loadSelectedAccounts);
  const [showOverview, setShowOverview] = useState(false);
  const [legacyProfilesReady, setLegacyProfilesReady] = useState(false);
  const hydratingRef = useRef(false);
  // Mirror of the latest `accounts` state so the async hydrate effect can
  // detect rows that were added locally (e.g. by a just-completed OAuth
  // callback) while its Supabase fetch was in flight. Without this, the
  // hydrate's `setAccounts(mapped)` would clobber the freshly added row
  // before the sync effect had a chance to persist it.
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  // Cloud mode: business_profiles (via React Query) is the source of truth.
  // Local mode: legacy localStorage-backed synthetic profiles.
  const profiles = enabled ? bridge.profiles : localProfiles;
  const activeProfileId = enabled ? bridge.activeProfileId : localActiveProfileId;
  const profilesReady = enabled ? bridge.ready : legacyProfilesReady;

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  // Non-null id only when we actually have a tenant; otherwise null so that
  // filters don't match the removed "default" fallback.
  const effectiveProfileId = activeProfileId ?? activeProfile?.id ?? null;

  useEffect(() => {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

  // Local-mode only persistence for profiles. Cloud mode persists via Supabase.
  useEffect(() => {
    if (enabled) return;
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(localProfiles));
  }, [enabled, localProfiles]);

  useEffect(() => {
    localStorage.setItem(SELECTED_ACCOUNTS_STORAGE_KEY, JSON.stringify(selectedAccountIds));
  }, [selectedAccountIds]);

  // Auto-select / auto-clear active profile in LOCAL mode.
  // Cloud mode: handled by <ActiveProfileGuard>.
  useEffect(() => {
    if (enabled) return;
    if (localProfiles.length === 0) {
      if (localActiveProfileId !== null) setLocalActiveProfileIdState(null);
      return;
    }
    if (!localActiveProfileId) {
      setLocalActiveProfileIdState(localProfiles[0].id);
      return;
    }
    if (localActiveProfileId && !localProfiles.some((p) => p.id === localActiveProfileId)) {
      setLocalActiveProfileIdState(localProfiles[0].id);
    }
  }, [enabled, localProfiles, localActiveProfileId]);

  // Local-mode persistence for the active profile id (per user key).
  // Cloud mode uses ActiveBusinessProfileContext which owns its own storage.
  useEffect(() => {
    if (enabled) return;
    if (localActiveProfileId) {
      localStorage.setItem(activeProfileStorageKey(user?.id), localActiveProfileId);
    }
  }, [enabled, localActiveProfileId, user?.id]);

  useEffect(() => {
    setSelectedAccountIds((current) => cleanupSelectedAccounts(current, profiles, accounts));
  }, [profiles, accounts]);

  // Hydrate ONLY connected_accounts from Supabase in cloud mode.
  // Profiles are now owned by `business_profiles` (via useBusinessProfileBridge).
  useEffect(() => {
    if (authLoading) return;
    if (!enabled || !supabase || !user) {
      setLegacyProfilesReady(true);
      return;
    }

    let ignore = false;

    const hydrate = async () => {
      hydratingRef.current = true;
      // Capture ids that exist locally at the start of hydrate. Anything
      // appearing in `accountsRef.current` AFTER this snapshot was added by
      // another code path (typically `addAccountFromOAuth` firing mid-hydrate)
      // and must be preserved; otherwise the Supabase snapshot below would
      // overwrite it before the sync effect has had a chance to upsert.
      const idsAtHydrateStart = new Set(accountsRef.current.map((a) => a.id));
      try {
        const { data: accountRows, error: accountsError } = await supabase
          .from("connected_accounts")
          .select(
            "id,user_id,profile_id,platform,username,display_name,avatar_url,profile_url,connected_at,is_oauth,is_zernio,zernio_account_id,stats,analysis,disconnected_at"
          )
          .eq("user_id", userId)
          .order("connected_at", { ascending: true });

        if (accountsError) {
          console.warn("[accounts] Supabase accounts hydrate failed, using local cache", accountsError);
          return;
        }
        if (ignore) return;

        // Row shape comes from the generated Database types via the typed
        // supabase client — no manual row type needed.
        const mappedAccounts = (accountRows ?? []).map((a) => ({
          id: a.id,
          profileId: a.profile_id,
          platform: a.platform as AccountPlatform,
          username: a.username,
          displayName: a.display_name ?? undefined,
          avatarUrl: a.avatar_url ?? undefined,
          profileUrl: a.profile_url ?? undefined,
          connectedAt: a.connected_at,
          isOAuth: a.is_oauth,
          isZernio: a.is_zernio,
          zernioAccountId: a.zernio_account_id ?? undefined,
          stats: (a.stats ?? undefined) as unknown as AccountStats | undefined,
          analysis: (a.analysis ?? undefined) as unknown as ConnectedAccount["analysis"],
          disconnectedAt: a.disconnected_at ?? undefined,
        })) as ConnectedAccount[];

        const mappedIds = new Set(mappedAccounts.map((a) => a.id));
        // Pending additions = rows added locally AFTER hydrate started that
        // Supabase doesn't yet know about (sync effect will push them next).
        const pendingAdditions = accountsRef.current.filter(
          (a) => !idsAtHydrateStart.has(a.id) && !mappedIds.has(a.id)
        );
        setAccounts(pendingAdditions.length > 0 ? [...mappedAccounts, ...pendingAdditions] : mappedAccounts);
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
        await syncAccounts({ accounts, userId });
      } catch (e) {
        console.warn("[accounts] Supabase sync failed, kept local cache", e);
      }
    };

    void sync();
  }, [enabled, authLoading, user, userId, accounts]);

  const setActiveProfileId = useCallback(
    (id: string | null) => {
      if (enabled) {
        bridge.setActiveProfileId(id);
      } else {
        setLocalActiveProfileIdState(id);
      }
    },
    [enabled, bridge]
  );

  const addProfile = useCallback(
    (name: string): Profile | Promise<Profile> => {
      if (enabled) {
        return bridge.addProfile(name);
      }
      const newProfile: Profile = {
        id: crypto.randomUUID(),
        name: name.trim() || "New profile",
        createdAt: new Date().toISOString(),
      };
      setLocalProfiles((prev) => [...prev, newProfile]);
      setLocalActiveProfileIdState(newProfile.id);
      return newProfile;
    },
    [enabled, bridge]
  );

  const renameProfile = useCallback(
    (id: string, name: string): void | Promise<void> => {
      if (enabled) {
        return bridge.renameProfile(id, name);
      }
      setLocalProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
      );
    },
    [enabled, bridge]
  );

  const updateProfile = useCallback(
    (
      id: string,
      updates: Partial<Pick<Profile, "name" | "website" | "email" | "phone" | "company" | "location" | "notes">>
    ): void | Promise<void> => {
      if (enabled) {
        return bridge.updateProfile(id, updates);
      }
      setLocalProfiles((prev) =>
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
    [enabled, bridge]
  );

  const removeProfile = useCallback(
    (id: string): void | Promise<void> => {
      // Always drop local account rows bound to this profile (cloud RLS also
      // cascades via business_profile_id FK, but in-memory accounts still hold
      // them until next hydrate).
      setAccounts((prev) => prev.filter((a) => a.profileId !== id));

      if (enabled) {
        return bridge.removeProfile(id);
      }
      setLocalProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (localActiveProfileId === id) {
          setLocalActiveProfileIdState(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [enabled, bridge, localActiveProfileId]
  );

  const addAccount = useCallback(
    (platform: AccountPlatform, username: string, extra?: Partial<ConnectedAccount>) => {
      if (!effectiveProfileId) {
        console.warn("[accounts] addAccount called without an active business profile");
        return;
      }
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
      if (!targetProfileId) {
        console.warn("[accounts] addAccountFromOAuth: no active business profile to attach to");
        return;
      }
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
        google_ads: "ads.google.com",
        meta_business: "business.facebook.com",
        whatsapp: "wa.me",
      };
      const base = profileUrls[platform] ?? platform + ".com";
      const defaultProfileUrl = `https://${base}/${username.replace(/^@/, "")}`;
      const normalizedUsername = username.trim();
      const displayName = extra?.displayName?.trim() || undefined;
      const profileUrl = extra?.profileUrl?.trim() || defaultProfileUrl;
      const newAccount: ConnectedAccount = {
        id: accountId,
        profileId: targetProfileId,
        platform,
        username: normalizedUsername,
        displayName,
        connectedAt: new Date().toISOString(),
        profileUrl,
        isOAuth: true,
        disconnectedAt: undefined,
        ...(extra?.zernioAccountId && { zernioAccountId: extra.zernioAccountId }),
        ...(extra?.isZernio && { isZernio: true }),
      };
      setAccounts((prev) => {
        const existing = prev.find((a) => a.id === accountId);
        if (
          existing &&
          existing.profileId === targetProfileId &&
          existing.platform === platform &&
          existing.username === normalizedUsername &&
          (existing.displayName ?? undefined) === displayName &&
          existing.profileUrl === profileUrl &&
          Boolean(existing.isOAuth) &&
          !existing.disconnectedAt &&
          (existing.zernioAccountId ?? undefined) === (extra?.zernioAccountId ?? undefined) &&
          Boolean(existing.isZernio) === Boolean(extra?.isZernio)
        ) {
          return prev;
        }

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

      // Activity log: only emit for UUID tenants (the legacy synthetic
      // "default" profile is not a valid FK target for activity_events).
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (enabled && UUID_RE.test(targetProfileId)) {
        void logActivity(supabase, {
          businessProfileId: targetProfileId,
          module: "connections",
          eventType: "connection.connected",
          subjectType: "connected_account",
          subjectId: accountId,
          severity: "success",
          summary: `Connected ${platform}${username ? ` (${username})` : ""}`,
          payload: {
            platform,
            username,
            isZernio: Boolean(extra?.isZernio),
            zernioAccountId: extra?.zernioAccountId ?? null,
          },
        });
      }
    },
    [effectiveProfileId, activeProfileId, setActiveProfileId, profiles, enabled]
  );

  const removeAccount = useCallback(
    async (id: string) => {
      try {
        await fetch(apiUrl(`/api/accounts/${encodeURIComponent(id)}`), { method: "DELETE", credentials: "include" });
      } catch {
        // Backend may not be running or account does not exist
      }
      if (enabled && supabase && userId) {
        const { error } = await supabase
          .from("connected_accounts")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);
        if (error) {
          console.warn("[accounts] Could not delete connected account", error);
        }
      }
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    },
    [enabled, userId]
  );

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

  const accountsForActiveProfile = accounts.filter(
    (a) => a.profileId === effectiveProfileId && !a.disconnectedAt
  );
  const getSelectedAccountId = useCallback(
    (section: AccountSection) => {
      if (!effectiveProfileId) return null;
      return selectedAccountIds[effectiveProfileId]?.[section] ?? null;
    },
    [effectiveProfileId, selectedAccountIds]
  );
  const setSelectedAccountId = useCallback(
    (section: AccountSection, id: string | null) => {
      if (!effectiveProfileId) return;
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
