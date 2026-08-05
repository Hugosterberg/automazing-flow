/**
 * Instagram Drive to-post queue: images from Drive → Instagram ads for the
 * active business profile.
 *
 * Features:
 * - One or more days ahead (batch) into scheduled-posts
 * - Brand / AI(+vision) / template captions
 * - A/B caption variants (random pick, experiment log)
 * - Optional Shopify product title match enrichment
 * - Move file to posted/ after successful Zernio publish
 */

import { randomUUID } from "crypto";
import {
  downloadDriveFileBytes,
  listDriveFolderImages,
  moveDriveFileToFolder,
  type DriveImageFile,
} from "../providers/googleDrive.ts";
import { fetchShopifyProducts, type NormalizedShopifyProduct } from "../providers/shopify.ts";
import { storeGeneratedMedia } from "./generatedMediaStore.ts";
import {
  loadProfileDocument,
  saveProfileDocument,
  updateProfileDocumentById,
} from "./profileDocumentStore.ts";
import { accountInBusinessProfile } from "./profileScope.ts";
import {
  parseScheduledPostsDoc,
  type StoredScheduledPost,
} from "./scheduledPostsPublisher.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

export const INSTAGRAM_DRIVE_QUEUE_DOC_KEY = "instagram-drive-queue";
export const INSTAGRAM_DRIVE_QUEUE_SOURCE = "instagram-drive-queue";

export type CaptionMode = "template" | "brand" | "ai";

export type CaptionExperiment = {
  postId: string;
  variants: [string, string];
  selected: 0 | 1;
  at: string;
  productTitle?: string;
};

export type InstagramDriveQueueConfig = {
  enabled: boolean;
  driveAccountId: string;
  toPostFolderId: string;
  toPostFolderName?: string;
  postedFolderId: string;
  postedFolderName?: string;
  instagramAccountId: string;
  captionMode: CaptionMode;
  captionTemplate: string;
  includeHashtags: boolean;
  /** How many calendar days ahead to keep filled (1–7). */
  daysAhead: number;
  /** Generate two captions and pick one (AI/brand). */
  abTesting: boolean;
  /** Try to match filename to a Shopify product title. */
  matchShopifyProducts: boolean;
  /** When captionMode is ai, send the image to vision. */
  useVision: boolean;
  lastEnqueuedFileId?: string;
  lastEnqueuedAt?: string;
  lastMovedFileId?: string;
  lastError?: string | null;
  lastFolderImageCount?: number;
  captionExperiments?: CaptionExperiment[];
};

export type ProfileCaptionContext = {
  name?: string;
  company?: string;
  website?: string;
  location?: string;
  notes?: string;
};

export type ProductMatch = {
  title: string;
  handle: string | null;
  price: string | null;
  currency: string;
  url: string;
};

interface TokenStoreLike {
  get(accountId: string): Promise<Record<string, unknown> | null | undefined>;
  set?(accountId: string, value: Record<string, unknown>): Promise<unknown>;
}

const DEFAULT_CAPTION = "{{name}}";
const IG_TAGS = ["#smallbusiness", "#behindthescenes", "#entrepreneur", "#contentcreator"];

function parseCaptionMode(raw: unknown): CaptionMode {
  const v = String(raw || "").trim();
  if (v === "brand" || v === "ai" || v === "template") return v;
  return "brand";
}

function clampDaysAhead(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(7, Math.max(1, Math.round(v)));
}

export function parseInstagramDriveQueueConfig(raw: unknown): InstagramDriveQueueConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const experiments = Array.isArray(o.captionExperiments)
    ? (o.captionExperiments as CaptionExperiment[])
        .filter(
          (e) =>
            e &&
            typeof e === "object" &&
            typeof e.postId === "string" &&
            Array.isArray(e.variants) &&
            e.variants.length === 2
        )
        .slice(0, 20)
    : undefined;
  return {
    enabled: Boolean(o.enabled),
    driveAccountId: String(o.driveAccountId || "").trim(),
    toPostFolderId: String(o.toPostFolderId || "").trim(),
    toPostFolderName: String(o.toPostFolderName || "").trim() || undefined,
    postedFolderId: String(o.postedFolderId || "").trim(),
    postedFolderName: String(o.postedFolderName || "").trim() || undefined,
    instagramAccountId: String(o.instagramAccountId || "").trim(),
    captionMode: parseCaptionMode(o.captionMode),
    captionTemplate: String(o.captionTemplate || DEFAULT_CAPTION).trim() || DEFAULT_CAPTION,
    includeHashtags: o.includeHashtags == null ? true : Boolean(o.includeHashtags),
    daysAhead: clampDaysAhead(o.daysAhead),
    abTesting: o.abTesting == null ? true : Boolean(o.abTesting),
    matchShopifyProducts: o.matchShopifyProducts == null ? true : Boolean(o.matchShopifyProducts),
    useVision: o.useVision == null ? true : Boolean(o.useVision),
    lastEnqueuedFileId: String(o.lastEnqueuedFileId || "").trim() || undefined,
    lastEnqueuedAt: String(o.lastEnqueuedAt || "").trim() || undefined,
    lastMovedFileId: String(o.lastMovedFileId || "").trim() || undefined,
    lastError: o.lastError == null ? null : String(o.lastError).slice(0, 300),
    lastFolderImageCount:
      typeof o.lastFolderImageCount === "number" && Number.isFinite(o.lastFolderImageCount)
        ? Math.max(0, Math.floor(o.lastFolderImageCount))
        : undefined,
    captionExperiments: experiments,
  };
}

export function fileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || fileName.trim() || "Post";
}

export function expandCaptionTokens(template: string, tokens: Record<string, string>): string {
  let out = String(template || DEFAULT_CAPTION);
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out.trim();
}

export function captionFromTemplate(template: string, fileName: string): string {
  return expandCaptionTokens(template, { name: fileStem(fileName) }) || fileStem(fileName);
}

export function appendInstagramHashtags(caption: string, enabled: boolean): string {
  if (!enabled) return caption.trim();
  if (caption.includes("#")) return caption.trim();
  return `${caption.trim()}\n\n${IG_TAGS.slice(0, 4).join(" ")}`;
}

export function enrichCaptionWithProduct(caption: string, product: ProductMatch | null): string {
  if (!product) return caption;
  const lines = [caption.trim()];
  if (!caption.toLowerCase().includes(product.title.toLowerCase())) {
    lines.push(`\n${product.title}`);
  }
  if (product.price) {
    lines.push(`${product.price} ${product.currency}`.trim());
  }
  if (product.url && !caption.includes(product.url)) {
    lines.push(product.url);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Normalize for fuzzy product title matching. */
export function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9åäöéü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreProductMatch(fileStemValue: string, productTitle: string): number {
  const a = normalizeMatchText(fileStemValue);
  const b = normalizeMatchText(productTitle);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  const aTokens = new Set(a.split(" ").filter((t) => t.length > 2));
  const bTokens = b.split(" ").filter((t) => t.length > 2);
  if (aTokens.size === 0 || bTokens.length === 0) return 0;
  let hits = 0;
  for (const t of bTokens) if (aTokens.has(t)) hits += 1;
  return Math.round((hits / Math.max(aTokens.size, bTokens.length)) * 70);
}

export function findBestProductMatch(
  fileName: string,
  products: Array<Pick<NormalizedShopifyProduct, "title" | "handle" | "price" | "currency">>,
  shopDomain?: string
): ProductMatch | null {
  const stem = fileStem(fileName);
  let best: { score: number; product: (typeof products)[number] } | null = null;
  for (const product of products) {
    const score = scoreProductMatch(stem, product.title);
    if (score < 45) continue;
    if (!best || score > best.score) best = { score, product };
  }
  if (!best) return null;
  const handle = best.product.handle;
  const shop = String(shopDomain || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url =
    handle && shop
      ? `https://${shop}/products/${handle}`
      : handle
        ? `/products/${handle}`
        : "";
  return {
    title: best.product.title,
    handle,
    price: best.product.price,
    currency: best.product.currency,
    url,
  };
}

export function buildBrandCaption(
  fileName: string,
  profile: ProfileCaptionContext,
  includeHashtags = true,
  product?: ProductMatch | null
): string {
  const stem = fileStem(fileName);
  const brand = String(profile.company || profile.name || "").trim();
  const website = String(profile.website || "").trim();
  const location = String(profile.location || "").trim();
  const notes = String(profile.notes || "")
    .split(/\n/)
    .map((l) => l.trim())
    .find(Boolean);

  const lines: string[] = [];
  if (product?.title) lines.push(product.title);
  else if (stem && stem.toLowerCase() !== brand.toLowerCase()) lines.push(stem);
  if (brand) lines.push(lines.length ? `\n${brand}` : brand);
  if (notes) lines.push(notes.slice(0, 180));
  else if (location) lines.push(location);
  if (product?.price) lines.push(`${product.price} ${product.currency}`.trim());
  if (product?.url) lines.push(product.url);
  else if (website) lines.push(website.startsWith("http") ? website : `https://${website}`);
  if (lines.length === 0) lines.push(stem);

  return appendInstagramHashtags(lines.join("\n").replace(/\n{3,}/g, "\n\n"), includeHashtags);
}

function mimeToDataUrl(contentType: string, buffer: Buffer): string {
  const mime = contentType.split(";")[0].trim() || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function buildAiCaption(args: {
  fileName: string;
  profile: ProfileCaptionContext;
  openaiKey?: string | null;
  includeHashtags?: boolean;
  product?: ProductMatch | null;
  imageBuffer?: Buffer;
  imageContentType?: string;
  useVision?: boolean;
  temperature?: number;
  variantHint?: string;
}): Promise<{ caption: string; source: "openai" | "vision" | "brand" }> {
  const fallback = buildBrandCaption(
    args.fileName,
    args.profile,
    args.includeHashtags !== false,
    args.product
  );
  const key = String(args.openaiKey || "").trim();
  if (!key) return { caption: fallback, source: "brand" };

  const brand = String(args.profile.company || args.profile.name || "our brand").trim();
  const prompt =
    `Write one Instagram caption promoting ${brand}. ` +
    `Image/file hint: "${fileStem(args.fileName)}". ` +
    (args.product ? `Matched product: ${args.product.title}${args.product.price ? ` (${args.product.price} ${args.product.currency})` : ""}. ` : "") +
    (args.profile.notes ? `Brand notes: ${String(args.profile.notes).slice(0, 400)}. ` : "") +
    (args.profile.website ? `Website: ${args.profile.website}. ` : "") +
    (args.profile.location ? `Location: ${args.profile.location}. ` : "") +
    (args.variantHint ? `Angle: ${args.variantHint}. ` : "") +
    `Tone: warm, concrete, on-brand advertising — not generic influencer fluff. ` +
    `Return ONLY the caption text (2–5 short lines). ` +
    (args.includeHashtags === false ? "No hashtags." : "End with 3–5 relevant hashtags.");

  const useVision =
    Boolean(args.useVision) && Boolean(args.imageBuffer) && args.imageBuffer!.length > 0;
  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (useVision && args.imageBuffer) {
    // Cap payload ~4MB base64-ish — skip vision for huge files.
    if (args.imageBuffer.length <= 3_500_000) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: mimeToDataUrl(args.imageContentType || "image/jpeg", args.imageBuffer),
        },
      });
    }
  }

  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: args.temperature ?? 0.7,
        max_tokens: 260,
        messages: [
          { role: "system", content: "You write Instagram captions for small businesses." },
          { role: "user", content: useVision && userContent.length > 1 ? userContent : prompt },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!aiRes.ok) return { caption: fallback, source: "brand" };
    const body = (await aiRes.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = String(body.choices?.[0]?.message?.content || "").trim();
    if (!text) return { caption: fallback, source: "brand" };
    let caption = appendInstagramHashtags(
      text,
      args.includeHashtags !== false && !text.includes("#")
    );
    caption = enrichCaptionWithProduct(caption, args.product ?? null);
    return {
      caption,
      source: useVision && userContent.length > 1 ? "vision" : "openai",
    };
  } catch {
    return { caption: fallback, source: "brand" };
  }
}

export function pickAbVariant(variants: [string, string], preferIndex?: 0 | 1 | null): 0 | 1 {
  if (preferIndex === 0 || preferIndex === 1) {
    // 70% stick with preferred, 30% explore
    if (Math.random() < 0.7) return preferIndex;
  }
  return Math.random() < 0.5 ? 0 : 1;
}

export function preferredVariantFromHistory(experiments: CaptionExperiment[] | undefined): 0 | 1 | null {
  if (!experiments || experiments.length === 0) return null;
  let zeros = 0;
  let ones = 0;
  for (const e of experiments.slice(0, 10)) {
    if (e.selected === 0) zeros += 1;
    else ones += 1;
  }
  if (zeros === ones) return null;
  return zeros > ones ? 0 : 1;
}

export type ResolvedCaption = {
  caption: string;
  variants?: [string, string];
  selected?: 0 | 1;
  product?: ProductMatch | null;
  source: string;
};

export async function resolveQueueCaption(args: {
  config: InstagramDriveQueueConfig;
  fileName: string;
  profile: ProfileCaptionContext;
  openaiKey?: string | null;
  product?: ProductMatch | null;
  imageBuffer?: Buffer;
  imageContentType?: string;
}): Promise<ResolvedCaption> {
  const tokens = {
    name: fileStem(args.fileName),
    business: String(args.profile.name || "").trim(),
    company: String(args.profile.company || args.profile.name || "").trim(),
    website: String(args.profile.website || "").trim(),
    location: String(args.profile.location || "").trim(),
    product: args.product?.title || "",
  };

  if (args.config.captionMode === "template") {
    const caption = enrichCaptionWithProduct(
      appendInstagramHashtags(
        expandCaptionTokens(args.config.captionTemplate, tokens),
        args.config.includeHashtags
      ),
      args.product ?? null
    );
    return { caption, product: args.product, source: "template" };
  }

  if (args.config.captionMode === "brand" && !args.config.abTesting) {
    return {
      caption: buildBrandCaption(
        args.fileName,
        args.profile,
        args.config.includeHashtags,
        args.product
      ),
      product: args.product,
      source: "brand",
    };
  }

  // AI mode, or brand+A/B → generate variants
  const shared = {
    fileName: args.fileName,
    profile: args.profile,
    openaiKey: args.openaiKey,
    includeHashtags: args.config.includeHashtags,
    product: args.product,
    imageBuffer: args.imageBuffer,
    imageContentType: args.imageContentType,
    useVision: args.config.captionMode === "ai" && args.config.useVision,
  };

  if (!args.config.abTesting) {
    const one = await buildAiCaption({ ...shared, temperature: 0.7 });
    return { caption: one.caption, product: args.product, source: one.source };
  }

  const [a, b] = await Promise.all([
    args.config.captionMode === "brand"
      ? Promise.resolve({
          caption: buildBrandCaption(
            args.fileName,
            args.profile,
            args.config.includeHashtags,
            args.product
          ),
          source: "brand" as const,
        })
      : buildAiCaption({ ...shared, temperature: 0.55, variantHint: "benefit-led and concrete" }),
    buildAiCaption({
      ...shared,
      temperature: 0.9,
      variantHint: "story-led and emotional",
      useVision: shared.useVision,
    }),
  ]);

  const variants: [string, string] = [a.caption, b.caption];
  if (variants[0] === variants[1]) {
    variants[1] = appendInstagramHashtags(
      `${variants[0].split("\n")[0] || fileStem(args.fileName)}\n\n${String(args.profile.company || args.profile.name || "").trim()}`,
      args.config.includeHashtags
    );
  }
  const preferred = preferredVariantFromHistory(args.config.captionExperiments);
  const selected = pickAbVariant(variants, preferred);
  return {
    caption: variants[selected],
    variants,
    selected,
    product: args.product,
    source: selected === 0 ? a.source : b.source,
  };
}

export function utcDayKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function scheduleTimeForDayOffset(now: Date, dayOffset: number): Date {
  if (dayOffset <= 0) return new Date(now);
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, 9, 0, 0, 0)
  );
}

/** UTC day keys that already have a drive-queue post scheduled/published. */
export function occupiedScheduleDays(posts: StoredScheduledPost[]): Set<string> {
  const days = new Set<string>();
  for (const post of posts) {
    if ((post as StoredScheduledPost & { source?: string }).source !== INSTAGRAM_DRIVE_QUEUE_SOURCE) {
      continue;
    }
    if (post.status !== "draft" && post.status !== "scheduled" && post.status !== "published") {
      continue;
    }
    const day = utcDayKey(post.scheduledFor || post.createdAt);
    if (day) days.add(day);
  }
  return days;
}

export function neededDayOffsets(now: Date, posts: StoredScheduledPost[], daysAhead: number): number[] {
  const occupied = occupiedScheduleDays(posts);
  const needed: number[] = [];
  const ahead = clampDaysAhead(daysAhead);
  for (let offset = 0; offset < ahead; offset += 1) {
    const day = utcDayKey(scheduleTimeForDayOffset(now, offset));
    if (!occupied.has(day)) needed.push(offset);
  }
  return needed;
}

export function alreadyEnqueuedToday(config: InstagramDriveQueueConfig, now: Date): boolean {
  if (!config.lastEnqueuedAt) return false;
  return utcDayKey(config.lastEnqueuedAt) === utcDayKey(now);
}

export function pickNextDriveImage(
  images: DriveImageFile[],
  occupiedFileIds: Set<string>
): DriveImageFile | null {
  for (const image of images) {
    if (occupiedFileIds.has(image.id)) continue;
    return image;
  }
  return null;
}

export function occupiedDriveFileIds(posts: StoredScheduledPost[]): Set<string> {
  const ids = new Set<string>();
  for (const post of posts) {
    const driveFileId = String((post as StoredScheduledPost & { driveFileId?: string }).driveFileId || "").trim();
    if (!driveFileId) continue;
    if (post.status === "draft" || post.status === "scheduled" || post.status === "published") {
      ids.add(driveFileId);
    }
  }
  return ids;
}

function driveAuthArgs(stored: Record<string, unknown>, accountId: string, tokenStore: TokenStoreLike) {
  return {
    accessToken: String(stored.accessToken || ""),
    refreshToken: stored.refreshToken ? String(stored.refreshToken) : undefined,
    accountId,
    tokenStore: {
      set: async (id: string, value: Record<string, unknown>) => {
        if (tokenStore.set) return tokenStore.set(id, value);
      },
    },
    stored,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

export type InstagramDriveQueueResult = {
  enqueued: number;
  skipped?: string;
  postIds?: string[];
  error?: string;
};

export async function runInstagramDriveQueue(deps: {
  supabaseAdmin: SupabaseAdminLike;
  tokenStore: TokenStoreLike;
  businessProfileId: string;
  publicBaseUrl: string;
  now?: Date;
  openaiKey?: string | null;
}): Promise<InstagramDriveQueueResult> {
  const now = deps.now ?? new Date();
  const businessProfileId = deps.businessProfileId;
  const configDoc = await loadProfileDocument(
    deps.supabaseAdmin,
    businessProfileId,
    INSTAGRAM_DRIVE_QUEUE_DOC_KEY
  );
  const config = parseInstagramDriveQueueConfig(configDoc?.data);
  if (!config) return { enqueued: 0, skipped: "missing_config" };
  if (!config.enabled) return { enqueued: 0, skipped: "disabled" };
  if (
    !config.driveAccountId ||
    !config.toPostFolderId ||
    !config.postedFolderId ||
    !config.instagramAccountId
  ) {
    return { enqueued: 0, skipped: "incomplete_config" };
  }

  const driveStored = await deps.tokenStore.get(config.driveAccountId);
  if (!driveStored || String(driveStored.platform || "") !== "google_drive") {
    return { enqueued: 0, skipped: "drive_disconnected", error: "Google Drive account missing" };
  }
  if (!accountInBusinessProfile(driveStored, businessProfileId)) {
    return { enqueued: 0, skipped: "drive_wrong_profile" };
  }

  const igStored = await deps.tokenStore.get(config.instagramAccountId);
  if (!igStored || String(igStored.platform || "") !== "instagram") {
    return { enqueued: 0, skipped: "instagram_disconnected", error: "Instagram account missing" };
  }
  if (!accountInBusinessProfile(igStored, businessProfileId)) {
    return { enqueued: 0, skipped: "instagram_wrong_profile" };
  }

  const { data: profileRow } = await deps.supabaseAdmin
    .from("business_profiles")
    .select("name,company,website,location,notes")
    .eq("id", businessProfileId)
    .maybeSingle();
  const profileRaw = (profileRow || {}) as Record<string, unknown>;
  const profile: ProfileCaptionContext = {
    name: String(profileRaw.name || "").trim() || undefined,
    company: String(profileRaw.company || "").trim() || undefined,
    website: String(profileRaw.website || "").trim() || undefined,
    location: String(profileRaw.location || "").trim() || undefined,
    notes: String(profileRaw.notes || "").trim() || undefined,
  };

  let shopifyCatalog: { products: NormalizedShopifyProduct[]; shop: string } | null = null;
  if (config.matchShopifyProducts) {
    try {
      const { data: accounts } = await deps.supabaseAdmin
        .from("connected_accounts")
        .select("id,platform,disconnected_at")
        .eq("business_profile_id", businessProfileId)
        .eq("platform", "shopify");
      const shopifyId = (Array.isArray(accounts) ? accounts : [])
        .filter((a) => !a.disconnected_at)
        .map((a) => String(a.id))[0];
      if (shopifyId) {
        const stored = await deps.tokenStore.get(shopifyId);
        if (stored && accountInBusinessProfile(stored, businessProfileId)) {
          const shop = String(stored.shop || stored.shopDomain || "").trim();
          const token = String(stored.accessToken || "").trim();
          if (shop && token) {
            const result = await fetchShopifyProducts(token, shop, 100);
            if ("products" in result) {
              shopifyCatalog = { products: result.products, shop };
            }
          }
        }
      }
    } catch {
      shopifyCatalog = null;
    }
  }

  const postsDoc = await loadProfileDocument(deps.supabaseAdmin, businessProfileId, "scheduled-posts");
  let posts = parseScheduledPostsDoc(postsDoc?.data);
  const dayOffsets = neededDayOffsets(now, posts, config.daysAhead);
  if (dayOffsets.length === 0) {
    return { enqueued: 0, skipped: "week_full" };
  }

  try {
    const auth = driveAuthArgs(driveStored, config.driveAccountId, deps.tokenStore);
    let images = await listDriveFolderImages({ ...auth, folderId: config.toPostFolderId });
    let occupied = occupiedDriveFileIds(posts);
    const postIds: string[] = [];
    const experiments = [...(config.captionExperiments || [])];
    let lastFileId = config.lastEnqueuedFileId;

    for (const offset of dayOffsets) {
      occupied = occupiedDriveFileIds(posts);
      const next = pickNextDriveImage(images, occupied);
      if (!next) break;

      const downloaded = await downloadDriveFileBytes({ ...auth, fileId: next.id });
      const mediaId = storeGeneratedMedia(downloaded.buffer, downloaded.contentType);
      const mediaUrl = `${deps.publicBaseUrl.replace(/\/$/, "")}/api/content/media/${encodeURIComponent(mediaId)}`;
      const product = shopifyCatalog
        ? findBestProductMatch(next.name, shopifyCatalog.products, shopifyCatalog.shop)
        : null;
      const resolved = await resolveQueueCaption({
        config,
        fileName: next.name,
        profile,
        openaiKey: deps.openaiKey,
        product,
        imageBuffer: downloaded.buffer,
        imageContentType: downloaded.contentType,
      });

      const nowIso = now.toISOString();
      const scheduledFor = scheduleTimeForDayOffset(now, offset).toISOString();
      const postId = randomUUID();
      const post: StoredScheduledPost & {
        source: string;
        driveFileId: string;
        driveAccountId: string;
        toPostFolderId: string;
        postedFolderId: string;
        captionVariants?: [string, string];
        selectedCaptionVariant?: 0 | 1;
        matchedProductTitle?: string;
      } = {
        id: postId,
        caption: resolved.caption,
        accountIds: [config.instagramAccountId],
        platforms: ["instagram"],
        status: "scheduled",
        scheduledFor,
        mediaUrls: [mediaUrl],
        createdAt: nowIso,
        updatedAt: nowIso,
        source: INSTAGRAM_DRIVE_QUEUE_SOURCE,
        driveFileId: next.id,
        driveAccountId: config.driveAccountId,
        toPostFolderId: config.toPostFolderId,
        postedFolderId: config.postedFolderId,
        captionVariants: resolved.variants,
        selectedCaptionVariant: resolved.selected,
        matchedProductTitle: resolved.product?.title,
      };

      posts = [post, ...posts].slice(0, 100);
      postIds.push(postId);
      lastFileId = next.id;
      occupied.add(next.id);

      if (resolved.variants && resolved.selected != null) {
        experiments.unshift({
          postId,
          variants: resolved.variants,
          selected: resolved.selected,
          at: nowIso,
          productTitle: resolved.product?.title,
        });
      }
    }

    if (postIds.length === 0) {
      await saveProfileDocument(deps.supabaseAdmin, businessProfileId, INSTAGRAM_DRIVE_QUEUE_DOC_KEY, {
        ...config,
        lastFolderImageCount: 0,
        lastError: null,
      });
      return { enqueued: 0, skipped: "empty_folder" };
    }

    if (postsDoc?.id) {
      await updateProfileDocumentById(deps.supabaseAdmin, postsDoc.id, posts);
    } else {
      await saveProfileDocument(deps.supabaseAdmin, businessProfileId, "scheduled-posts", posts);
    }

    const remaining = images.filter((img) => !occupiedDriveFileIds(posts).has(img.id)).length;
    await saveProfileDocument(deps.supabaseAdmin, businessProfileId, INSTAGRAM_DRIVE_QUEUE_DOC_KEY, {
      ...config,
      lastEnqueuedFileId: lastFileId,
      lastEnqueuedAt: now.toISOString(),
      lastFolderImageCount: remaining,
      captionExperiments: experiments.slice(0, 20),
      lastError: null,
    });

    return { enqueued: postIds.length, postIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await saveProfileDocument(deps.supabaseAdmin, businessProfileId, INSTAGRAM_DRIVE_QUEUE_DOC_KEY, {
      ...config,
      lastError: message.slice(0, 300),
    });
    return { enqueued: 0, error: message.slice(0, 300) };
  }
}

/** After a successful Zernio publish, move the source Drive file to posted/. */
export async function movePublishedDriveQueueFile(deps: {
  tokenStore: TokenStoreLike;
  businessProfileId: string;
  post: StoredScheduledPost & {
    driveFileId?: string;
    driveAccountId?: string;
    toPostFolderId?: string;
    postedFolderId?: string;
    source?: string;
  };
}): Promise<{ moved: boolean; skipped?: string; error?: string }> {
  if (deps.post.source !== INSTAGRAM_DRIVE_QUEUE_SOURCE) {
    return { moved: false, skipped: "not_drive_queue" };
  }
  const fileId = String(deps.post.driveFileId || "").trim();
  const driveAccountId = String(deps.post.driveAccountId || "").trim();
  const fromFolderId = String(deps.post.toPostFolderId || "").trim();
  const toFolderId = String(deps.post.postedFolderId || "").trim();
  if (!fileId || !driveAccountId || !fromFolderId || !toFolderId) {
    return { moved: false, skipped: "missing_move_meta" };
  }

  const stored = await deps.tokenStore.get(driveAccountId);
  if (!stored || String(stored.platform || "") !== "google_drive") {
    return { moved: false, skipped: "drive_disconnected", error: "Google Drive account missing" };
  }
  if (!accountInBusinessProfile(stored, deps.businessProfileId)) {
    return { moved: false, skipped: "drive_wrong_profile" };
  }

  try {
    await moveDriveFileToFolder({
      ...driveAuthArgs(stored, driveAccountId, deps.tokenStore),
      fileId,
      fromFolderId,
      toFolderId,
    });
    return { moved: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { moved: false, error: message.slice(0, 300) };
  }
}
