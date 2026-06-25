import crypto from "crypto";

type StoredMedia = {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
};

const media = new Map<string, StoredMedia>();
const MAX_ITEMS = 100;
const TTL_MS = 24 * 60 * 60 * 1000;

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

function pruneExpired(now = Date.now()) {
  for (const [id, item] of media.entries()) {
    if (now - item.createdAt > TTL_MS) media.delete(id);
  }
  while (media.size > MAX_ITEMS) {
    const first = media.keys().next().value;
    if (!first) break;
    media.delete(first);
  }
}

export function storeGeneratedMedia(buffer: Buffer, contentType = "image/png"): string {
  pruneExpired();
  const id = `${crypto.randomUUID()}.${extensionFor(contentType)}`;
  media.set(id, { buffer, contentType, createdAt: Date.now() });
  return id;
}

export function readGeneratedMedia(id: string): StoredMedia | null {
  pruneExpired();
  return media.get(id) ?? null;
}

export function publicMediaUrl(req: { protocol?: string; get?: (header: string) => string | undefined }, id: string): string {
  const forwardedProto = req.get?.("x-forwarded-proto");
  const proto = forwardedProto || req.protocol || "http";
  const host = req.get?.("host") || "localhost:3001";
  return `${proto}://${host}/api/content/media/${encodeURIComponent(id)}`;
}
