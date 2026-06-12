import type { AlibabaProductImport } from "@/types/ecommerce";

const STORAGE_PREFIX = "automazing-alibaba-import";

function storageKey(profileId: string | null | undefined): string {
  return `${STORAGE_PREFIX}:${profileId || "default"}`;
}

export function loadAlibabaImport(profileId: string | null | undefined): AlibabaProductImport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
    if (!raw) return null;
    return JSON.parse(raw) as AlibabaProductImport;
  } catch {
    return null;
  }
}

export function saveAlibabaImport(profileId: string | null | undefined, product: AlibabaProductImport | null) {
  if (typeof window === "undefined") return;
  const key = storageKey(profileId);
  if (!product) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(product));
}
