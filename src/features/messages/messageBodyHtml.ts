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
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    padding: 20px 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #1a1a1a;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  a { color: #2563eb; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}
