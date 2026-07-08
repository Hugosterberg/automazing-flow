/** Split plain-text email bodies into the latest reply and quoted history. */
export type MessageBodyParts = {
  main: string;
  quoted: string | null;
};

const QUOTE_SPLIT_PATTERNS: RegExp[] = [
  /\nOn .+ wrote:\s*\n/i,
  /\n-----Original Message-----\s*\n/i,
  /\nFrom: .+\nSent: /i,
  /\n_{5,}\s*\n/,
  /\nBegin forwarded message:\s*\n/i,
];

/** Collapse noise common in marketing / multipart plain-text emails. */
export function normalizeEmailPlainText(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  const lines = text.split("\n");
  const deduped: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (deduped.length > 0 && deduped[deduped.length - 1] !== "") deduped.push("");
      continue;
    }
    if (deduped.length > 0 && deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }
  return deduped.join("\n").trim();
}

/** Group single line breaks into flowing paragraphs (blank line = new paragraph). */
export function splitEmailParagraphs(text: string): string[] {
  const normalized = normalizeEmailPlainText(text);
  const lines = normalized.split("\n");
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (buffer.length) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
      continue;
    }
    buffer.push(line.trim());
  }
  if (buffer.length) paragraphs.push(buffer.join(" "));

  return paragraphs.filter(Boolean);
}

export function splitEmailBody(raw: string): MessageBodyParts {
  const text = normalizeEmailPlainText(raw);
  if (!text) return { main: "", quoted: null };

  for (const pattern of QUOTE_SPLIT_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.index !== undefined && match.index > 0) {
      const main = text.slice(0, match.index).trim();
      const quoted = text.slice(match.index).trim();
      if (main && quoted) return { main, quoted };
    }
  }

  const lines = text.split("\n");
  const quoteStart = lines.findIndex((line) => line.trimStart().startsWith(">"));
  if (quoteStart > 0) {
    return {
      main: lines.slice(0, quoteStart).join("\n").trim(),
      quoted: lines.slice(quoteStart).join("\n").trim(),
    };
  }

  return { main: text, quoted: null };
}

export type TextSegment = { type: "text"; value: string } | { type: "link"; href: string; label: string };

const URL_RE = /(?:\(?\s*)?(https?:\/\/[^\s<>"')\]]+)/g;

export function linkDisplayLabel(href: string): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname === "/" ? "" : url.pathname;
    const combined = host + path;
    if (combined.length <= 44) return combined;
    return `${combined.slice(0, 41)}…`;
  } catch {
    if (href.length <= 44) return href;
    return `${href.slice(0, 41)}…`;
  }
}

/** Break text into plain segments and clickable URLs (safe — no raw HTML). */
export function segmentLinks(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", value: text.slice(last, index) });
    const href = match[1].replace(/[.,;:!?)]+$/, "");
    segments.push({ type: "link", href, label: linkDisplayLabel(href) });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments.length ? segments : [{ type: "text", value: text }];
}
