/** Detect marketing / MIME HTML email bodies that should not be shown as plain text. */
export function isHtmlEmailContent(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  const sample = trimmed.slice(0, 4000).toLowerCase();
  if (sample.startsWith("<!doctype") || sample.startsWith("<html")) return true;
  if (/<!doctype\s+html/i.test(trimmed.slice(0, 2500))) return true;
  if (/<html[\s>]/i.test(trimmed.slice(0, 2500))) return true;

  const tagMatches = trimmed.match(/<(?:html|body|table|div|span|p|img|a|td|tr|style|center)\b/gi);
  return Boolean(tagMatches && tagMatches.length >= 3 && /<\/[\w:-]+>/.test(trimmed));
}

/** Strip scripts and prefer body inner HTML for iframe srcdoc. */
export function prepareEmailHtmlForIframe(raw: string): string {
  let html = raw.trim();
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch?.[1]) html = bodyMatch[1];
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

export function buildEmailIframeDocument(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    max-width: 100%;
    overflow-x: hidden;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    padding: 8px 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12.5px;
    line-height: 1.4;
    color: #1a1a1a;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  @media (min-width: 900px) {
    body {
      padding: 6px 8px;
      font-size: 12px;
      line-height: 1.38;
      zoom: 0.86;
    }
    img, video, iframe, embed, object {
      max-height: min(22vh, 160px) !important;
    }
  }
  @media (max-width: 640px) {
    body { padding: 8px 10px; font-size: 13px; line-height: 1.4; }
  }
  /* Marketing templates ship huge hero / attachment images — keep them readable. */
  img, video, iframe, embed, object, svg {
    max-width: 100% !important;
    height: auto !important;
  }
  img, video, iframe, embed, object {
    max-height: min(28vh, 200px) !important;
    object-fit: contain !important;
  }
  table {
    max-width: 100% !important;
  }
  td, th {
    word-break: break-word;
    font-size: inherit;
  }
  p, li, td, th, div {
    font-size: inherit;
    line-height: inherit;
  }
  h1 { font-size: 1.15em !important; margin: 0.35em 0 !important; }
  h2 { font-size: 1.08em !important; margin: 0.3em 0 !important; }
  h3, h4 { font-size: 1.02em !important; margin: 0.25em 0 !important; }
  pre, code {
    max-width: 100%;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.92em;
  }
  a { color: #2563eb; }
  blockquote {
    margin: 0.4em 0;
    padding-left: 0.65em;
    border-left: 2px solid #d4d4d8;
    color: #52525b;
    font-size: 0.95em;
  }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
