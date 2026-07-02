import { useCallback, useMemo } from "react";
import type { Profile } from "@/types/accounts";
import type { BusinessProfile, ProfileKind } from "@/types/businessProfile";
import {
  useActiveBusinessProfileIdOptional,
  useSetActiveBusinessProfileId,
} from "./useActiveBusinessProfileId";
import { useBusinessProfiles } from "./useBusinessProfiles";

/**
 * Compatibility bridge.
 *
 * Translates the new `business_profiles` React Query data + the active-id
 * context into the legacy `Profile[]` + `activeProfileId` shape that
 * AccountsContext and ProfileSwitcher currently speak. All writes go through
 * React Query mutations, so the new tenant table is the single source of truth.
 *
 * Consumers should prefer the primitives directly (useBusinessProfiles,
 * useActiveBusinessProfileId*) going forward. This hook exists so the legacy
 * context can drop its synthetic "default" fallback without touching every
 * consumer in one commit.
 */
export interface BusinessProfileBridge {
  ready: boolean;
  profiles: Profile[];
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  addProfile: (name: string, kind?: ProfileKind) => Promise<Profile>;
  renameProfile: (id: string, name: string) => Promise<void>;
  updateProfile: (
    id: string,
    updates: Partial<Pick<Profile, "name" | "website" | "email" | "phone" | "company" | "location" | "notes">>
  ) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
}

function toLegacyProfile(p: BusinessProfile): Profile {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    createdAt: p.createdAt,
    website: p.website,
    email: p.email,
    phone: p.phone,
    company: p.company,
    location: p.location,
    notes: p.notes,
  };
}

export function useBusinessProfileBridge(): BusinessProfileBridge {
  const {
    profiles: newProfiles,
    isLoading,
    createProfile,
    updateProfile: updateBp,
    deleteProfile,
  } = useBusinessProfiles();
  const activeId = useActiveBusinessProfileIdOptional();
  const setActive = useSetActiveBusinessProfileId();

  const profiles = useMemo(() => newProfiles.map(toLegacyProfile), [newProfiles]);

  const addProfile = useCallback(
    async (name: string, kind?: ProfileKind): Promise<Profile> => {
      const created = await createProfile({
        name: name.trim() || "New profile",
        ...(kind ? { kind } : {}),
      });
      setActive(created.id);
      return toLegacyProfile(created);
    },
    [createProfile, setActive]
  );

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      await updateBp({ id, updates: { name } });
    },
    [updateBp]
  );

  const updateProfile = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Profile, "name" | "website" | "email" | "phone" | "company" | "location" | "notes">>
    ) => {
      await updateBp({ id, updates });
    },
    [updateBp]
  );

  const removeProfile = useCallback(
    async (id: string) => {
      await deleteProfile(id);
      if (activeId === id) setActive(null);
    },
    [deleteProfile, activeId, setActive]
  );

  return {
    ready: !isLoading,
    profiles,
    activeProfileId: activeId,
    setActiveProfileId: setActive,
    addProfile,
    renameProfile,
    updateProfile,
    removeProfile,
  };
}
