/**
 * Fetch a public website and extract company info from meta tags and JSON-LD.
 * Used to auto-fill leads and enrich registry data with live site content.
 */

import { fetchPublicUrl, readResponseWithLimit } from "./publicFetch.ts";

export interface SiteMeta {
  url: string;
  company?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  location?: string;
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

type Loose = Record<string, unknown>;

function asRecord(v: unknown): Loose | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : null;
}

function pickString(obj: Loose | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function isOrgType(type: unknown): boolean {
  const t = String(type || "").toLowerCase();
  return (
    t.includes("organization") ||
    t.includes("organisation") ||
    t.includes("localbusiness") ||
    t.includes("corporation") ||
    t.includes("store")
  );
}

function flattenJsonLdNodes(raw: unknown, out: Loose[] = []): Loose[] {
  if (Array.isArray(raw)) {
    for (const item of raw) flattenJsonLdNodes(item, out);
    return out;
  }
  const obj = asRecord(raw);
  if (!obj) return out;
  if (Array.isArray(obj["@graph"])) flattenJsonLdNodes(obj["@graph"], out);
  out.push(obj);
  return out;
}

function parseJsonLdBlocks(html: string): Loose[] {
  const nodes: Loose[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[1]?.trim();
    if (!text) continue;
    try {
      flattenJsonLdNodes(JSON.parse(text), nodes);
    } catch {
      /* ignore malformed blocks */
    }
  }
  return nodes;
}

function addressFromJsonLd(obj: Loose): { address?: string; location?: string } {
  const addr = obj.address;
  if (typeof addr === "string" && addr.trim()) {
    const parts = addr.split(",").map((p) => p.trim());
    return { address: addr.trim(), location: parts[parts.length - 2] || parts[parts.length - 1] };
  }
  const rec = asRecord(addr);
  if (!rec) return {};
  const street = pickString(rec, ["streetAddress"]);
  const locality = pickString(rec, ["addressLocality"]);
  const region = pickString(rec, ["addressRegion"]);
  const postal = pickString(rec, ["postalCode"]);
  const country = pickString(rec, ["addressCountry"]);
  const line = [street, [postal, locality].filter(Boolean).join(" "), region, country]
    .filter(Boolean)
    .join(", ");
  return { address: line || undefined, location: locality || region };
}

/** Pure: extract company fields from HTML meta tags + JSON-LD. */
export function extractSiteMeta(html: string): Omit<SiteMeta, "url"> {
  const company =
    metaContent(html, "og:site_name") ||
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    titleTag(html);
  const description =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    metaContent(html, "twitter:description");

  let phone: string | undefined;
  let email: string | undefined;
  let address: string | undefined;
  let location: string | undefined;
  let jsonLdCompany: string | undefined;
  let jsonLdDescription: string | undefined;

  for (const node of parseJsonLdBlocks(html)) {
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (!types.some(isOrgType)) continue;

    jsonLdCompany =
      jsonLdCompany ||
      pickString(node, ["legalName", "name"]) ||
      undefined;
    jsonLdDescription =
      jsonLdDescription || pickString(node, ["description", "slogan"]) || undefined;
    phone = phone || pickString(node, ["telephone", "phone"]) || undefined;
    email = email || pickString(node, ["email"]) || undefined;

    const addr = addressFromJsonLd(node);
    address = address || addr.address;
    location = location || addr.location;
  }

  const cleanedCompany = (company || jsonLdCompany || "")
    .replace(/\s*[|–—-]\s*.*$/, "")
    .trim() || (jsonLdCompany || "").trim();

  const finalDescription = (description || jsonLdDescription || "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    company: cleanedCompany.slice(0, 160) || undefined,
    description: finalDescription.slice(0, 400) || undefined,
    phone: phone?.slice(0, 40),
    email: email?.slice(0, 120),
    address: address?.slice(0, 200),
    location: location?.slice(0, 120),
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
  const meta = extractSiteMeta(html);
  return { url: res.url || url.toString(), ...meta };
}
