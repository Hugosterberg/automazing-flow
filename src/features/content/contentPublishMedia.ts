import { apiUrl } from "@/lib/apiBase";
import type { SelectedContentAsset } from "@/lib/contentSelection";

/** Turn app-relative media paths into absolute URLs Zernio can fetch. */
export function absoluteMediaUrl(url: string | undefined | null): string | null {
  const trimmed = String(url || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("/")) {
    const absolute = apiUrl(trimmed);
    if (absolute.startsWith("http")) return absolute;
    if (typeof window !== "undefined") return `${window.location.origin}${trimmed}`;
    return trimmed;
  }
  return trimmed;
}

export function publishMediaUrlsFromAssets(assets: SelectedContentAsset[]): string[] {
  const urls: string[] = [];
  for (const asset of assets) {
    const candidate = asset.kind === "video" ? asset.previewUrl || asset.thumbnailUrl : asset.previewUrl || asset.thumbnailUrl;
    const absolute = absoluteMediaUrl(candidate);
    if (absolute && !urls.includes(absolute)) urls.push(absolute);
    if (urls.length >= 10) break;
  }
  return urls;
}
