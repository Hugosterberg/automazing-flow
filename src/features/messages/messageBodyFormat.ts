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

export function splitEmailBody(raw: string): MessageBodyParts {
  const text = raw.trim();
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

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Break text into plain segments and clickable URLs (safe — no raw HTML). */
export function segmentLinks(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ type: "text", value: text.slice(last, index) });
    const href = match[0].replace(/[.,;:!?)]+$/, "");
    segments.push({ type: "link", href, label: href });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments.length ? segments : [{ type: "text", value: text }];
}
