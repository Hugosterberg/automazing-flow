import { fetchPublicUrl, hostAllowed, readResponseWithLimit } from "../lib/publicFetch.ts";

export type AlibabaProductImport = {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  description: string;
  price: string | null;
  currency: string | null;
  images: string[];
  specs: Array<{ label: string; value: string }>;
  warnings: string[];
};

export const ALIBABA_PRODUCT_HOSTS = ["alibaba.com", "1688.com"];
export const ALIBABA_IMAGE_HOSTS = ["alicdn.com", "alibaba.com", "1688.com", "tbcdn.cn"];
export const MAX_ALIBABA_IMAGE_BYTES = 10 * 1024 * 1024;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function metaContent(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeHtml(match[1]).trim();
  }
  return "";
}

function titleTag(html: string): string {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return decodeHtml(match?.[1] || "").replace(/\s+/g, " ").trim();
}

function normalizeExternalUrl(raw: string, base?: string): string | null {
  const value = decodeHtml(String(raw || "").trim());
  if (!value || value.startsWith("data:")) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function upgradeAlicdnUrl(raw: string): string {
  return raw
    .replace(/(\.(?:jpg|jpeg|png|webp))_\d+x\d+\.(?:jpg|jpeg|png|webp)/gi, "$1")
    .replace(/_\d+x\d+(?=\.(?:jpg|jpeg|png|webp)(?:\?|$))/i, "")
    .replace(/(\.(?:jpg|jpeg|png|webp))\.(?:jpg|jpeg|png|webp)_\d+x\d+\.(?:jpg|jpeg|png|webp)/gi, "$1");
}

export function normalizeAlibabaProductUrl(raw: unknown): URL {
  const value = String(raw || "").trim();
  if (!value) throw new Error("missing_url");
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported_protocol");
  if (!hostAllowed(url.hostname, ALIBABA_PRODUCT_HOSTS)) {
    throw new Error("unsupported_host");
  }
  url.hash = "";
  return url;
}

export function normalizeAlibabaImageUrl(raw: unknown): URL {
  const normalized = normalizeExternalUrl(String(raw || "").trim());
  if (!normalized) throw new Error("invalid_image_url");
  const url = new URL(upgradeAlicdnUrl(normalized));
  if (!hostAllowed(url.hostname, ALIBABA_IMAGE_HOSTS)) {
    throw new Error("unsupported_image_host");
  }
  return url;
}

function extractJsonLdProduct(html: string): Partial<AlibabaProductImport> {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "");
        if (!/product/i.test(type)) continue;
        const images = Array.isArray(node.image)
          ? node.image.map((item: unknown) => normalizeExternalUrl(String(item))).filter(Boolean)
          : node.image
            ? [normalizeExternalUrl(String(node.image))].filter(Boolean)
            : [];
        const offers = node.offers && typeof node.offers === "object" ? node.offers : null;
        return {
          title: String(node.name || "").trim(),
          description: String(node.description || "").trim(),
          price: offers?.price != null ? String(offers.price) : null,
          currency: offers?.priceCurrency ? String(offers.priceCurrency) : null,
          images: (images as string[]).map(upgradeAlicdnUrl),
        };
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return {};
}

function extractInitData(html: string): Partial<AlibabaProductImport> {
  const patterns = [
    /window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\})\s*;\s*</i,
    /window\.detailData\s*=\s*(\{[\s\S]*?\})\s*;\s*</i,
    /"globalData"\s*:\s*(\{[\s\S]{0,50000}?\})\s*,\s*"/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match?.[1]) continue;
    try {
      const parsed = JSON.parse(match[1]);
      const title = String(parsed?.subject || parsed?.productTitle || parsed?.title || "").trim();
      const description = String(
        parsed?.description || parsed?.productDescription || parsed?.detailDesc || ""
      )
        .replace(/\\n/g, "\n")
        .trim();
      const imageList = Array.isArray(parsed?.imageList)
        ? parsed.imageList
        : Array.isArray(parsed?.images)
          ? parsed.images
          : Array.isArray(parsed?.imagePathList)
            ? parsed.imagePathList
            : [];
      const images = imageList
        .map((item: unknown) => {
          if (typeof item === "string") return normalizeExternalUrl(item);
          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            return normalizeExternalUrl(String(record.url || record.imageUrl || record.src || record.original || ""));
          }
          return null;
        })
        .filter(Boolean)
        .map((url) => upgradeAlicdnUrl(url as string));
      const price = parsed?.price ?? parsed?.formattedPrice ?? parsed?.unitPrice;
      const currency = parsed?.currency ?? parsed?.currencyCode;
      if (title || description || images.length > 0) {
        return {
          title,
          description,
          price: price != null ? String(price).trim() : null,
          currency: currency != null ? String(currency).trim() : null,
          images,
        };
      }
    } catch {
      // ignore malformed init data
    }
  }
  return {};
}

function extractEmbeddedProductJson(html: string): Partial<AlibabaProductImport> {
  const titlePatterns = [/"subject"\s*:\s*"([^"]+)"/i, /"productTitle"\s*:\s*"([^"]+)"/i];
  const title =
    titlePatterns.map((pattern) => decodeHtml(pattern.exec(html)?.[1] || "").trim()).find(Boolean) || "";

  const descriptionPatterns = [
    /"productDescription"\s*:\s*"([^"]+)"/i,
    /"detailDesc"\s*:\s*"([^"]+)"/i,
    /"description"\s*:\s*"([^"]{40,})"/i,
  ];
  const description =
    descriptionPatterns
      .map((pattern) => decodeHtml(pattern.exec(html)?.[1] || "").replace(/\\n/g, "\n").trim())
      .find((value) => value.length > 20) || "";

  const priceMatch =
    /"(?:formattedPrice|unitPrice)"\s*:\s*"([^"]+)"/i.exec(html) ||
    /"(?:formattedPrice|unitPrice)"\s*:\s*([\d.]+)/i.exec(html);
  const currencyMatch = /"(?:currency|currencyCode)"\s*:\s*"([^"]+)"/i.exec(html);

  return {
    title,
    description,
    price: priceMatch?.[1] ? String(priceMatch[1]).trim() : null,
    currency: currencyMatch?.[1] ? String(currencyMatch[1]).trim() : null,
  };
}

export function extractImageUrls(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/gi,
    /\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s>]*)?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const normalized = normalizeExternalUrl(match[0], baseUrl);
      if (!normalized) continue;
      try {
        const url = new URL(upgradeAlicdnUrl(normalized));
        if (!hostAllowed(url.hostname, ALIBABA_IMAGE_HOSTS)) continue;
        if (/logo|icon|sprite|avatar|badge|flag|qr|banner/i.test(url.pathname)) continue;
        found.add(url.toString());
      } catch {
        // ignore invalid URLs
      }
    }
  }
  return Array.from(found);
}

function extractSpecs(html: string): Array<{ label: string; value: string }> {
  const specs: Array<{ label: string; value: string }> = [];
  const pattern = /"(?:attrName|name|label)"\s*:\s*"([^"]+)"[\s\S]{0,120}?"(?:attrValue|value)"\s*:\s*"([^"]+)"/gi;
  for (const match of html.matchAll(pattern)) {
    const label = decodeHtml(match[1] || "").trim();
    const value = decodeHtml(match[2] || "").trim();
    if (!label || !value) continue;
    if (specs.some((entry) => entry.label === label && entry.value === value)) continue;
    specs.push({ label, value });
    if (specs.length >= 12) break;
  }
  return specs;
}

function cleanTitle(raw: string): string {
  return raw.replace(/\s*[|\-–—]\s*Alibaba\.com.*$/i, "").replace(/\s*[|\-–—]\s*1688\.com.*$/i, "").trim();
}

function buildWarnings(product: Omit<AlibabaProductImport, "warnings">): string[] {
  const warnings: string[] = [];
  if (!product.description) warnings.push("Ingen produktbeskrivning hittades.");
  if (product.images.length === 0) warnings.push("Inga produktbilder hittades.");
  else if (product.images.length === 1) warnings.push("Bara en bild hittades — galleriet kan vara ofullständigt.");
  if (!product.price) warnings.push("Inget pris hittades på sidan.");
  return warnings;
}

export async function importAlibabaProduct(rawUrl: unknown): Promise<AlibabaProductImport> {
  const url = normalizeAlibabaProductUrl(rawUrl);
  const response = await fetchPublicUrl(url.toString(), {
    allowedHosts: ALIBABA_PRODUCT_HOSTS,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  if (!response.ok) {
    throw new Error(`fetch_failed_${response.status}`);
  }
  const html = (await response.text()).slice(0, 2_000_000);
  const finalUrl = response.url || url.toString();

  const jsonLd = extractJsonLdProduct(html);
  const initData = extractInitData(html);
  const embedded = extractEmbeddedProductJson(html);
  const metaTitle = metaContent(html, "og:title") || metaContent(html, "twitter:title") || titleTag(html);
  const metaDescription =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    metaContent(html, "twitter:description");
  const metaImage = metaContent(html, "og:image");

  const title = cleanTitle(jsonLd.title || initData.title || embedded.title || metaTitle);
  const description = (jsonLd.description || initData.description || embedded.description || metaDescription)
    .replace(/\s+/g, " ")
    .trim();
  const images = Array.from(
    new Set(
      [
        ...(jsonLd.images || []),
        ...(initData.images || []),
        metaImage ? upgradeAlicdnUrl(normalizeExternalUrl(metaImage, finalUrl) || "") : null,
        ...extractImageUrls(html, finalUrl),
      ].filter(Boolean) as string[]
    )
  ).slice(0, 24);

  if (!title && images.length === 0 && !description) {
    throw new Error("product_not_found");
  }

  const product = {
    sourceUrl: url.toString(),
    finalUrl,
    title: title || "Importerad produkt",
    description,
    price: jsonLd.price || initData.price || embedded.price || null,
    currency: jsonLd.currency || initData.currency || embedded.currency || null,
    images,
    specs: extractSpecs(html),
    warnings: [] as string[],
  };
  product.warnings = buildWarnings(product);
  return product;
}

export async function fetchAlibabaImage(rawUrl: unknown): Promise<{ buffer: Buffer; contentType: string }> {
  const url = normalizeAlibabaImageUrl(rawUrl);
  const response = await fetchPublicUrl(url.toString(), {
    init: { method: "GET" },
    allowedHosts: ALIBABA_IMAGE_HOSTS,
    timeoutMs: 15000,
    accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  if (!response.ok) {
    throw new Error(`image_fetch_failed_${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!/^image\//i.test(contentType)) {
    throw new Error("not_an_image");
  }
  const buffer = await readResponseWithLimit(response, MAX_ALIBABA_IMAGE_BYTES);
  return { buffer, contentType };
}

export async function fetchAlibabaImagesForZip(imageUrls: unknown[]): Promise<Array<{ name: string; data: Buffer }>> {
  const urls = Array.isArray(imageUrls) ? imageUrls.slice(0, 24) : [];
  const entries: Array<{ name: string; data: Buffer }> = [];
  for (let index = 0; index < urls.length; index++) {
    const { buffer, contentType } = await fetchAlibabaImage(urls[index]);
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    entries.push({ name: `product-${index + 1}.${extension}`, data: buffer });
  }
  return entries;
}
