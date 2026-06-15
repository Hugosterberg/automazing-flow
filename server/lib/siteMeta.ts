/**
 * Fetch a public website and extract basic company info (name + description)
 * from its meta tags — used to auto-fill a lead from its URL.
 *
 * Network access goes through the SSRF-safe publicFetch (blocks private hosts,
 * caps redirects/size). The HTML parsing is pure and unit-tested.
 */

import { fetchPublicUrl, readResponseWithLimit } from "./publicFetch.ts";

export interface SiteMeta {
  url: string;
  company?: string;
  description?: string;
}

const MAX_HTML_BYTES = 1_000_000;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/gi, "'");
}

function metaContent(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return "";
}

function titleTag(html: string): string {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return decodeEntities(m?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure: pull a company name + description out of a page's meta tags. */
export function extractSiteMeta(html: string): { company: string; description: string } {
  const company =
    metaContent(html, "og:site_name") ||
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    titleTag(html);
  const description =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    metaContent(html, "twitter:description");
  // Trim a trailing " | Site name" / " – Tagline" off the title-derived company.
  const cleanedCompany = company.replace(/\s*[|–—-]\s*.*$/, "").trim() || company.trim();
  return {
    company: cleanedCompany.slice(0, 160),
    description: description.replace(/\s+/g, " ").trim().slice(0, 400),
  };
}

export async function fetchSiteMeta(rawUrl: unknown): Promise<SiteMeta> {
  const value = String(rawUrl || "").trim();
  if (!value) throw new Error("missing_url");
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported_protocol");

  const res = await fetchPublicUrl(url.toString(), { timeoutMs: 12_000 });
  if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
  const buffer = await readResponseWithLimit(res, MAX_HTML_BYTES);
  const html = buffer.toString("utf8");
  const { company, description } = extractSiteMeta(html);
  return { url: res.url || url.toString(), company: company || undefined, description: description || undefined };
}
