import crypto from "crypto";
import fs from "fs";
import path from "path";

type StoredMedia = {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
};

type StoredMeta = {
  contentType: string;
  createdAt: number;
};

const media = new Map<string, StoredMedia>();
const DATA_DIR =
  process.env.GENERATED_MEDIA_DIR?.trim() ||
  path.join(process.cwd(), "data", "generated-media");
/** Keep generated files for 30 days so users can download them from history later. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 500;

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  return "bin";
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function mediaFilePath(id: string) {
  return path.join(DATA_DIR, id);
}

function metaFilePath(id: string) {
  return path.join(DATA_DIR, `${id}.meta.json`);
}

function readMeta(id: string): StoredMeta | null {
  try {
    const raw = fs.readFileSync(metaFilePath(id), "utf8");
    const parsed = JSON.parse(raw) as StoredMeta;
    if (!parsed?.contentType || !parsed.createdAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToDisk(id: string, buffer: Buffer, contentType: string, createdAt: number) {
  ensureDataDir();
  fs.writeFileSync(mediaFilePath(id), buffer);
  fs.writeFileSync(metaFilePath(id), JSON.stringify({ contentType, createdAt }));
}

function loadFromDisk(id: string): StoredMedia | null {
  const meta = readMeta(id);
  if (!meta) return null;
  try {
    const buffer = fs.readFileSync(mediaFilePath(id));
    return { buffer, contentType: meta.contentType, createdAt: meta.createdAt };
  } catch {
    return null;
  }
}

function listDiskIds(): string[] {
  ensureDataDir();
  return fs
    .readdirSync(DATA_DIR)
    .filter((name) => !name.endsWith(".meta.json") && fs.statSync(path.join(DATA_DIR, name)).isFile())
    .map((name) => name);
}

function deleteFromDisk(id: string) {
  try {
    fs.unlinkSync(mediaFilePath(id));
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(metaFilePath(id));
  } catch {
    // ignore
  }
}

export function pruneExpired(now = Date.now()) {
  for (const [id, item] of media.entries()) {
    if (now - item.createdAt > TTL_MS) {
      media.delete(id);
      deleteFromDisk(id);
    }
  }

  for (const id of listDiskIds()) {
    const meta = readMeta(id);
    if (!meta || now - meta.createdAt > TTL_MS) {
      deleteFromDisk(id);
      media.delete(id);
    }
  }

  const survivors = listDiskIds()
    .map((id) => ({ id, createdAt: readMeta(id)?.createdAt ?? 0 }))
    .sort((a, b) => b.createdAt - a.createdAt);
  while (survivors.length > MAX_ITEMS) {
    const drop = survivors.pop();
    if (!drop) break;
    deleteFromDisk(drop.id);
    media.delete(drop.id);
  }
}

export function storeGeneratedMedia(buffer: Buffer, contentType = "image/png"): string {
  pruneExpired();
  const id = `${crypto.randomUUID()}.${extensionFor(contentType)}`;
  const createdAt = Date.now();
  media.set(id, { buffer, contentType, createdAt });
  writeToDisk(id, buffer, contentType, createdAt);
  return id;
}

export function readGeneratedMedia(id: string): StoredMedia | null {
  pruneExpired();
  const cached = media.get(id);
  if (cached) return cached;
  const fromDisk = loadFromDisk(id);
  if (fromDisk) {
    media.set(id, fromDisk);
    return fromDisk;
  }
  return null;
}

export function publicMediaUrl(
  req: { protocol?: string; get?: (header: string) => string | undefined },
  id: string
): string {
  const forwardedProto = req.get?.("x-forwarded-proto");
  const proto = forwardedProto || req.protocol || "http";
  const host = req.get?.("host") || "localhost:3001";
  return `${proto}://${host}/api/content/media/${encodeURIComponent(id)}`;
}

export function mediaIdFromPublicUrl(url: string): string | null {
  try {
    const parsed = new URL(url, "http://localhost");
    const match = parsed.pathname.match(/\/api\/content\/media\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    const relative = url.match(/\/api\/content\/media\/([^/?#]+)/i);
    return relative?.[1] ? decodeURIComponent(relative[1]) : null;
  }
}
