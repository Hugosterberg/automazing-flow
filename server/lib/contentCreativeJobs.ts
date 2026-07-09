/**
 * Creative content automations — seed the pipeline from published heroes,
 * calendar gaps, and evergreen replays. Wired from content-pipeline cron when
 * social workflows are enabled.
 */

import crypto from "node:crypto";
import { heuristicContentIdeas } from "../ai/contentIdeas.ts";
import { loadProfileDocument, saveProfileDocument } from "./profileDocumentStore.ts";
import { parseScheduledPostsDoc, type StoredScheduledPost } from "./scheduledPostsPublisher.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

const CONTENT_PIPELINE_DOC_KEY = "content-pipeline-queue";
const SOCIAL_WORKFLOWS_DOC_KEY = "social-workflows";

interface ContentPipelineItem {
  id: string;
  title: string;
  captionHint?: string;
  accountIds: string[];
  platforms: string[];
  mediaUrls: string[];
  scheduledFor: string;
  status: "queued" | "scheduled" | "failed";
  error?: string;
  createdAt: string;
}

export interface SocialWorkflowsCreativeDoc {
  enabled: Record<string, boolean>;
  lastPipelineRunAt?: string;
  lastRepurposeAt?: string;
  lastGapFillAt?: string;
  lastEvergreenAt?: string;
}

function parseWorkflows(data: unknown): SocialWorkflowsCreativeDoc {
  if (!data || typeof data !== "object") return { enabled: {} };
  const raw = data as Record<string, unknown>;
  const enabled =
    raw.enabled && typeof raw.enabled === "object" && !Array.isArray(raw.enabled)
      ? (raw.enabled as Record<string, boolean>)
      : {};
  return {
    enabled,
    lastPipelineRunAt: raw.lastPipelineRunAt ? String(raw.lastPipelineRunAt) : undefined,
    lastRepurposeAt: raw.lastRepurposeAt ? String(raw.lastRepurposeAt) : undefined,
    lastGapFillAt: raw.lastGapFillAt ? String(raw.lastGapFillAt) : undefined,
    lastEvergreenAt: raw.lastEvergreenAt ? String(raw.lastEvergreenAt) : undefined,
  };
}

function parseContentPipeline(data: unknown): ContentPipelineItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e): e is ContentPipelineItem =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as ContentPipelineItem).id === "string" &&
      typeof (e as ContentPipelineItem).title === "string"
  );
}

function defaultScheduleIso(hoursFromNow: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}

function daysSince(iso: string | undefined, nowMs: number): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return (nowMs - t) / 86400000;
}

/** Pick the most recently published post from the last `withinDays` days. */
export function pickHeroPost(
  posts: StoredScheduledPost[],
  nowMs: number,
  withinDays = 7
): StoredScheduledPost | null {
  const cutoff = nowMs - withinDays * 86400000;
  let best: StoredScheduledPost | null = null;
  let bestTime = 0;
  for (const post of posts) {
    if (post.status !== "published") continue;
    const t = Date.parse(post.updatedAt || post.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    const caption = String(post.caption || "").trim();
    if (!caption) continue;
    if (t > bestTime) {
      bestTime = t;
      best = post;
    }
  }
  return best;
}

/** Count posts scheduled (or draft) within the next N hours. */
export function countUpcomingPosts(
  posts: StoredScheduledPost[],
  nowMs: number,
  withinHours = 72
): number {
  const horizon = nowMs + withinHours * 3600000;
  let count = 0;
  for (const post of posts) {
    if (post.status !== "scheduled" && post.status !== "draft") continue;
    const t = post.scheduledFor ? Date.parse(post.scheduledFor) : NaN;
    if (!Number.isFinite(t) || t < nowMs || t > horizon) continue;
    count += 1;
  }
  return count;
}

/** Find an older published post suitable for an evergreen replay. */
export function pickEvergreenPost(
  posts: StoredScheduledPost[],
  nowMs: number,
  minAgeDays = 30
): StoredScheduledPost | null {
  const cutoff = nowMs - minAgeDays * 86400000;
  let best: StoredScheduledPost | null = null;
  let bestTime = 0;
  for (const post of posts) {
    if (post.status !== "published") continue;
    const t = Date.parse(post.updatedAt || post.createdAt);
    if (!Number.isFinite(t) || t > cutoff) continue;
    const caption = String(post.caption || "").trim();
    if (!caption || caption.startsWith("[Evergreen replay]")) continue;
    if (t > bestTime) {
      bestTime = t;
      best = post;
    }
  }
  return best;
}

export function buildRepurposeVariants(hero: StoredScheduledPost, nowIso: string): ContentPipelineItem[] {
  const titleLine = String(hero.caption || "Weekly hero").split("\n")[0].slice(0, 80);
  const accountIds = Array.isArray(hero.accountIds) ? hero.accountIds : [];
  const platforms = Array.isArray(hero.platforms) ? hero.platforms : [];
  const mediaUrls = Array.isArray(hero.mediaUrls) ? hero.mediaUrls : [];
  const base = { accountIds, platforms, mediaUrls };

  return [
    {
      id: crypto.randomUUID(),
      title: `Clip: ${titleLine}`,
      captionHint: "15–30s hook from your hero post — lead with the strongest line.",
      ...base,
      scheduledFor: defaultScheduleIso(26),
      status: "queued",
      createdAt: nowIso,
    },
    {
      id: crypto.randomUUID(),
      title: `Carousel: 3 tips from "${titleLine}"`,
      captionHint: "Slide 1 = hook, slides 2–4 = actionable tips pulled from the hero.",
      ...base,
      scheduledFor: defaultScheduleIso(50),
      status: "queued",
      createdAt: nowIso,
    },
    {
      id: crypto.randomUUID(),
      title: `Quote card: ${titleLine}`,
      captionHint: "Pull the most quotable sentence — add a soft CTA in the caption.",
      ...base,
      scheduledFor: defaultScheduleIso(74),
      status: "queued",
      createdAt: nowIso,
    },
  ];
}

const HASHTAG_PACKS: Record<string, string[]> = {
  instagram: ["#smallbusiness", "#behindthescenes", "#entrepreneur", "#contentcreator"],
  tiktok: ["#fyp", "#smallbiz", "#learnontiktok", "#businesstips"],
  facebook: ["#localbusiness", "#community", "#shoplocal"],
  youtube: ["#shorts", "#business", "#howto"],
  x: ["#buildinpublic", "#startup", "#marketing"],
  default: ["#marketing", "#business", "#growth"],
};

/** Add platform-aware hashtags when the caption optimizer workflow is on. */
export function buildOptimizedCaption(title: string, hint?: string, platforms?: string[]): string {
  const base = title.trim() || "New post";
  let caption = hint?.trim() ? `${base}\n\n${hint.trim()}` : `${base} — tap the link in bio to learn more.`;
  const slug = (platforms && platforms[0] ? String(platforms[0]).toLowerCase() : "default") as keyof typeof HASHTAG_PACKS;
  const tags = HASHTAG_PACKS[slug] || HASHTAG_PACKS.default;
  if (!caption.includes("#")) {
    caption += `\n\n${tags.slice(0, 4).join(" ")}`;
  }
  return caption;
}

export interface ContentCreativeSeedResult {
  enqueued: number;
  repurpose: number;
  gapFill: number;
  evergreen: number;
}

/** Seed content-pipeline-queue from enabled social workflows. */
export async function runContentCreativeSeed(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  businessName?: string;
  now?: Date;
}): Promise<ContentCreativeSeedResult> {
  const nowMs = (deps.now ?? new Date()).getTime();
  const nowIso = new Date(nowMs).toISOString();
  const empty: ContentCreativeSeedResult = { enqueued: 0, repurpose: 0, gapFill: 0, evergreen: 0 };

  const workflowsDoc = await loadProfileDocument(deps.supabaseAdmin, deps.businessProfileId, SOCIAL_WORKFLOWS_DOC_KEY);
  const workflows = parseWorkflows(workflowsDoc?.data);
  const enabled = workflows.enabled;

  const repurposeOn = Boolean(enabled["repurpose-weekly-hero"]);
  const gapFillOn = Boolean(enabled["content-gap-filler"]);
  const evergreenOn = Boolean(enabled["evergreen-repost"]);
  if (!repurposeOn && !gapFillOn && !evergreenOn) return empty;

  const postsDoc = await loadProfileDocument(deps.supabaseAdmin, deps.businessProfileId, "scheduled-posts");
  const posts = parseScheduledPostsDoc(postsDoc?.data);
  const pipelineDoc = await loadProfileDocument(deps.supabaseAdmin, deps.businessProfileId, CONTENT_PIPELINE_DOC_KEY);
  let queue = parseContentPipeline(pipelineDoc?.data);

  const newItems: ContentPipelineItem[] = [];
  let repurpose = 0;
  let gapFill = 0;
  let evergreen = 0;

  if (repurposeOn && daysSince(workflows.lastRepurposeAt, nowMs) >= 6) {
    const hero = pickHeroPost(posts, nowMs);
    if (hero) {
      newItems.push(...buildRepurposeVariants(hero, nowIso));
      repurpose = 3;
    }
  }

  if (gapFillOn && daysSince(workflows.lastGapFillAt, nowMs) >= 2) {
    const upcoming = countUpcomingPosts(posts, nowMs, 72);
    if (upcoming < 2) {
      const ideas = heuristicContentIdeas({ businessName: deps.businessName || "your business", platform: "Instagram" });
      for (const idea of ideas.slice(0, 2)) {
        newItems.push({
          id: crypto.randomUUID(),
          title: idea.title,
          captionHint: `${idea.hook}\n\nFormat: ${idea.format}. CTA: ${idea.cta}`,
          accountIds: [],
          platforms: ["instagram"],
          mediaUrls: [],
          scheduledFor: defaultScheduleIso(36 + gapFill * 12),
          status: "queued",
          createdAt: nowIso,
        });
        gapFill += 1;
      }
    }
  }

  if (evergreenOn && daysSince(workflows.lastEvergreenAt, nowMs) >= 14) {
    const upcomingWeek = countUpcomingPosts(posts, nowMs, 168);
    if (upcomingWeek < 1) {
      const old = pickEvergreenPost(posts, nowMs);
      if (old) {
        const titleLine = String(old.caption || "").split("\n")[0].slice(0, 100);
        newItems.push({
          id: crypto.randomUUID(),
          title: `[Evergreen replay] ${titleLine}`,
          captionHint: "Still relevant — refreshed evergreen replay with a new intro line.",
          accountIds: Array.isArray(old.accountIds) ? old.accountIds : [],
          platforms: Array.isArray(old.platforms) ? old.platforms : [],
          mediaUrls: Array.isArray(old.mediaUrls) ? old.mediaUrls : [],
          scheduledFor: defaultScheduleIso(96),
          status: "queued",
          createdAt: nowIso,
        });
        evergreen = 1;
      }
    }
  }

  if (newItems.length === 0) return empty;

  queue = [...newItems, ...queue].slice(0, 50);
  await saveProfileDocument(deps.supabaseAdmin, deps.businessProfileId, CONTENT_PIPELINE_DOC_KEY, queue);

  const workflowPatch: SocialWorkflowsCreativeDoc = {
    ...workflows,
    enabled: workflows.enabled,
  };
  if (repurpose > 0) workflowPatch.lastRepurposeAt = nowIso;
  if (gapFill > 0) workflowPatch.lastGapFillAt = nowIso;
  if (evergreen > 0) workflowPatch.lastEvergreenAt = nowIso;
  await saveProfileDocument(deps.supabaseAdmin, deps.businessProfileId, SOCIAL_WORKFLOWS_DOC_KEY, workflowPatch);

  return { enqueued: newItems.length, repurpose, gapFill, evergreen };
}
