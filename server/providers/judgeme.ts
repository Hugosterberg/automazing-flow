/**
 * Judge.me product reviews API (https://judge.me/api/docs).
 *
 * Auth model per the official docs: every request carries `shop_domain` and
 * `api_token` as query parameters. The private API token (Judge.me admin →
 * Settings → Integrations → View API tokens) grants read/write and is only
 * ever used server-side here.
 *
 * Endpoints used:
 *   GET  /api/v1/reviews                              — list reviews (paginated)
 *   POST /api/v1/orders/send_manual_review_request    — trigger a review-request email
 */

import { normalizeShopifyShopDomain } from "../lib/shopifyShopDomain.ts";

const JUDGEME_API_BASE = "https://judge.me/api/v1";
const JUDGEME_TIMEOUT_MS = 15_000;

export interface JudgemeCredentials {
  shopDomain: string;
  apiToken: string;
}

export interface JudgemeReviewPicture {
  /** Small rendition for inline thumbnails. */
  thumb: string;
  /** Largest available rendition, for the click-through. */
  full: string;
}

export interface JudgemeReview {
  id: string;
  author: string;
  rating?: number;
  title?: string;
  text: string;
  createdAt?: string;
  verified?: boolean;
  hidden?: boolean;
  pictures: JudgemeReviewPicture[];
  productExternalId?: string;
  source: "judgeme";
}

/**
 * Judge.me's `shop_domain` is the store's permanent platform domain
 * (`*.myshopify.com` for Shopify). Accept handles/URLs like the Shopify
 * connect flow does, but keep non-Shopify hosts as-is so other platforms
 * supported by Judge.me still work.
 */
export function normalizeJudgemeShopDomain(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const shopify = normalizeShopifyShopDomain(raw);
  if (shopify) return shopify;
  const host = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/, 1)[0]
    ?.toLowerCase();
  return host && host.includes(".") ? host : null;
}

function judgemeUrl(path: string, creds: JudgemeCredentials, params?: Record<string, string | number>): string {
  const url = new URL(`${JUDGEME_API_BASE}${path}`);
  url.searchParams.set("shop_domain", creds.shopDomain);
  url.searchParams.set("api_token", creds.apiToken);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function judgemeApiError(body: unknown, status: number): string {
  const root = asRecord(body);
  const message = str(root?.error) || str(root?.message);
  if (message) return message;
  if (status === 401 || status === 403) {
    return "Judge.me rejected the credentials. Check the shop domain and private API token.";
  }
  return `Judge.me API request failed (${status}).`;
}

function mapJudgemeReview(raw: unknown, index: number): JudgemeReview {
  const r = asRecord(raw) ?? {};
  const reviewer = asRecord(r.reviewer);
  const pictures = Array.isArray(r.pictures)
    ? (r.pictures as unknown[])
        .map((p): JudgemeReviewPicture | null => {
          const urls = asRecord(asRecord(p)?.urls);
          const thumb = str(urls?.small) || str(urls?.compact) || str(urls?.original) || str(urls?.huge);
          const full = str(urls?.huge) || str(urls?.original) || thumb;
          return thumb ? { thumb, full } : null;
        })
        .filter((p): p is JudgemeReviewPicture => p !== null)
    : [];
  const verifiedRaw = r.verified;
  return {
    id: str(r.id) || String(index),
    author: str(reviewer?.name) || str(r.reviewer_name) || "Anonymous",
    rating: num(r.rating),
    title: str(r.title) || undefined,
    text: str(r.body),
    createdAt: str(r.created_at) || undefined,
    verified: typeof verifiedRaw === "boolean" ? verifiedRaw : verifiedRaw === "buyer" || verifiedRaw === "verified",
    hidden: r.hidden === true,
    pictures,
    productExternalId: str(r.product_external_id) || undefined,
    source: "judgeme",
  };
}

/**
 * Flat result shape on purpose: the repo compiles with `strictNullChecks:
 * false`, where boolean-discriminated unions do not narrow — callers check
 * `ok` and read the optional fields directly.
 */
export interface JudgemeResult {
  ok: boolean;
  status?: number;
  error?: string;
  reviews?: JudgemeReview[];
}

/**
 * List reviews. `per_page` maxes out at 100 per the API docs; callers wanting
 * more must page.
 */
export async function fetchJudgemeReviews(
  creds: JudgemeCredentials,
  options?: { page?: number; perPage?: number; rating?: number }
): Promise<JudgemeResult> {
  const params: Record<string, string | number> = {
    page: options?.page ?? 1,
    per_page: Math.min(Math.max(options?.perPage ?? 50, 1), 100),
  };
  if (options?.rating) params.rating = options.rating;
  const res = await fetch(judgemeUrl("/reviews", creds, params), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(JUDGEME_TIMEOUT_MS),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: judgemeApiError(body, res.status) };
  }
  const list = asRecord(body)?.reviews;
  const reviews = Array.isArray(list) ? list.map((r, i) => mapJudgemeReview(r, i)) : [];
  return { ok: true, reviews };
}

/**
 * Total published review count via `GET /reviews/count`. Best-effort — the
 * endpoint is cheap and gives the true total even when the list fetch is
 * capped, but callers must tolerate `null` (older shops / transient errors).
 */
export async function fetchJudgemeReviewCount(creds: JudgemeCredentials): Promise<number | null> {
  try {
    const res = await fetch(judgemeUrl("/reviews/count", creds), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(JUDGEME_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => ({}));
    const count = num(asRecord(body)?.count);
    return count != null && count >= 0 ? Math.trunc(count) : null;
  } catch {
    return null;
  }
}

/** Connect-time credential check: one cheap authenticated list call. */
export async function verifyJudgemeCredentials(creds: JudgemeCredentials): Promise<JudgemeResult> {
  const result = await fetchJudgemeReviews(creds, { perPage: 1 });
  return result.ok ? { ok: true } : { ok: false, status: result.status, error: result.error };
}

/**
 * Trigger Judge.me's own branded review-request email for an order
 * (`POST /orders/send_manual_review_request`). Judge.me handles the template,
 * review form link, and reminder logic — much stronger than a plain email.
 */
export async function sendJudgemeReviewRequest(
  creds: JudgemeCredentials,
  request: { orderId: string; email: string; name?: string; platform?: string }
): Promise<JudgemeResult> {
  const res = await fetch(judgemeUrl("/orders/send_manual_review_request", creds), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      id: request.orderId,
      email: request.email,
      ...(request.name ? { name: request.name } : {}),
      platform: request.platform ?? "shopify",
    }),
    signal: AbortSignal.timeout(JUDGEME_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, error: judgemeApiError(body, res.status) };
  }
  return { ok: true };
}

/** Extract stored Judge.me credentials from a token-store entry. */
export function judgemeCredentialsFromStored(
  stored: Record<string, unknown> | null | undefined
): JudgemeCredentials | null {
  const shopDomain = str(stored?.judgemeShopDomain);
  const apiToken = str(stored?.judgemeApiToken);
  return shopDomain && apiToken ? { shopDomain, apiToken } : null;
}
