import zlib from "zlib";

export type ZipExtractEntry = {
  name: string;
  data: Buffer;
  contentType: string;
};

const SKIP_FRAGMENTS = ["__MACOSX/", ".DS_Store"];

function shouldSkipEntry(name: string): boolean {
  if (!name || name.endsWith("/")) return true;
  if (name.startsWith(".")) return true;
  return SKIP_FRAGMENTS.some((fragment) => name.includes(fragment));
}

function guessContentType(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return null;
}

function decodeEntryData(buffer: Buffer, offset: number, compression: number, compSize: number): Buffer | null {
  const dataStart = offset;
  const dataEnd = dataStart + compSize;
  if (dataEnd > buffer.length) return null;
  const compressed = buffer.subarray(dataStart, dataEnd);
  if (compression === 0) return compressed;
  if (compression === 8) {
    try {
      return zlib.inflateRawSync(compressed);
    } catch {
      return null;
    }
  }
  return null;
}

export function extractZipEntries(
  buffer: Buffer,
  options?: { maxEntries?: number; maxBytes?: number }
): { entries: ZipExtractEntry[]; skipped: number } {
  const maxEntries = options?.maxEntries ?? 50;
  const maxBytes = options?.maxBytes ?? 50 * 1024 * 1024;
  const entries: ZipExtractEntry[] = [];
  let skipped = 0;
  let totalBytes = 0;
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compression = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buffer.length) break;

    const rawName = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraLen;
    const data = decodeEntryData(buffer, dataStart, compression, compSize);
    offset = dataStart + compSize;

    if (!data) {
      skipped++;
      continue;
    }

    const baseName = rawName.split("/").pop() || rawName;
    if (shouldSkipEntry(rawName) || shouldSkipEntry(baseName)) {
      skipped++;
      continue;
    }

    const contentType = guessContentType(baseName);
    if (!contentType?.startsWith("image/")) {
      skipped++;
      continue;
    }
    if (entries.length >= maxEntries) {
      skipped++;
      continue;
    }
    if (totalBytes + data.length > maxBytes) {
      skipped++;
      continue;
    }

    totalBytes += data.length;
    entries.push({ name: baseName, data, contentType });
  }

  return { entries, skipped };
}
