import type { SelectedContentAsset } from "@/lib/contentSelection";
import { apiUrl } from "@/lib/apiBase";
import { absoluteMediaUrl } from "./contentPublishMedia";

export type GeneratedContentSource = "apiai" | "openai" | "canva" | "upload" | "other";

export type GeneratedContentItem = {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "video";
  mediaUrl: string;
  thumbnailUrl: string;
  source: GeneratedContentSource;
  sourceLabel: string;
  toolName?: string;
  createdAt: string;
};

export const GENERATED_HISTORY_DOC_KEY = "content-generated-history";
export const MAX_GENERATED_HISTORY = 200;
const LEGACY_PREFIX = "automazing-content-generated-history";

export function generatedHistoryLegacyKey(profileId: string) {
  return `${LEGACY_PREFIX}-${profileId || "default"}`;
}

function normalizeMediaUrl(url: string): string {
  const absolute = absoluteMediaUrl(url) || url;
  return absolute.split("#")[0]?.split("?")[0] || absolute;
}

export function appendGeneratedContent(
  history: GeneratedContentItem[],
  input: Omit<GeneratedContentItem, "id" | "createdAt"> & { id?: string; createdAt?: string }
): GeneratedContentItem[] {
  const mediaUrl = normalizeMediaUrl(input.mediaUrl);
  if (!mediaUrl || mediaUrl.startsWith("blob:")) return history;

  const withoutDuplicate = history.filter((item) => normalizeMediaUrl(item.mediaUrl) !== mediaUrl);
  const item: GeneratedContentItem = {
    id: input.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    mimeType: input.mimeType,
    kind: input.kind,
    mediaUrl,
    thumbnailUrl: input.thumbnailUrl || mediaUrl,
    source: input.source,
    sourceLabel: input.sourceLabel,
    toolName: input.toolName,
    createdAt: input.createdAt || new Date().toISOString(),
  };

  return [item, ...withoutDuplicate].slice(0, MAX_GENERATED_HISTORY);
}

export function generatedItemToAsset(item: GeneratedContentItem): SelectedContentAsset {
  const preview = absoluteMediaUrl(item.mediaUrl) || item.mediaUrl;
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    kind: item.kind,
    thumbnailUrl: absoluteMediaUrl(item.thumbnailUrl) || item.thumbnailUrl || preview,
    previewUrl: preview,
    sourceAccountId: item.source,
    sourceAccountName: item.sourceLabel,
  };
}

export function recordFromSelectedAsset(
  history: GeneratedContentItem[],
  asset: SelectedContentAsset,
  meta?: { toolName?: string }
): GeneratedContentItem[] {
  const sourceAccountId = asset.sourceAccountId.toLowerCase();
  let source: GeneratedContentSource = "other";
  if (sourceAccountId.includes("apiai")) source = "apiai";
  else if (sourceAccountId.includes("openai")) source = "openai";
  else if (sourceAccountId.includes("canva")) source = "canva";

  const preview = asset.previewUrl || asset.thumbnailUrl;
  if (!preview || preview.startsWith("blob:")) return history;

  return appendGeneratedContent(history, {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    kind: asset.kind,
    mediaUrl: preview,
    thumbnailUrl: asset.thumbnailUrl || preview,
    source,
    sourceLabel: asset.sourceAccountName || source,
    toolName: meta?.toolName,
  });
}

export function resolveDownloadUrl(item: GeneratedContentItem): string {
  const url = absoluteMediaUrl(item.mediaUrl) || item.mediaUrl;
  if (url.startsWith("http")) return url;
  return apiUrl(url.startsWith("/") ? url : `/${url}`);
}

export function resolveThumbnailUrl(item: GeneratedContentItem): string {
  const thumb = absoluteMediaUrl(item.thumbnailUrl) || item.thumbnailUrl;
  if (thumb.startsWith("http")) return thumb;
  return resolveDownloadUrl(item);
}

/** Server-stored media lasts ~30 days; external Canva URLs may expire sooner. */
export function isLikelyExpiredMedia(item: GeneratedContentItem, now = Date.now()): boolean {
  const created = new Date(item.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const ageMs = now - created;
  if (item.mediaUrl.includes("/api/content/media/")) {
    return ageMs > 29 * 24 * 60 * 60 * 1000;
  }
  if (item.source === "canva" || item.mediaUrl.includes("canva")) {
    return ageMs > 20 * 60 * 60 * 1000;
  }
  return false;
}
