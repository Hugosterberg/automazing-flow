import { scopedStorageKey } from "@/lib/storageUtils";

export type SelectedContentAsset = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  thumbnailUrl: string;
  previewUrl?: string;
  webViewLink?: string;
  sourceAccountId: string;
  sourceAccountName: string;
};

export function assetSelectionKey(asset: Pick<SelectedContentAsset, "sourceAccountId" | "id">): string {
  return `${asset.sourceAccountId}:${asset.id}`;
}

const STORAGE_PREFIX = "automazing-content-selection";

function storageKey(profileId?: string | null) {
  return scopedStorageKey(STORAGE_PREFIX, profileId);
}

export function loadSelectedContent(profileId?: string | null): SelectedContentAsset[] {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SelectedContentAsset[]) : [];
  } catch {
    return [];
  }
}

export function saveSelectedContent(profileId: string | null | undefined, assets: SelectedContentAsset[]) {
  localStorage.setItem(storageKey(profileId), JSON.stringify(assets));
}

export function clearSelectedContent(profileId?: string | null) {
  localStorage.removeItem(storageKey(profileId));
}
