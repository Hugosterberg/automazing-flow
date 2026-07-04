/**
 * Publishes locally scheduled social posts when their time arrives.
 *
 * The app keeps its publishing pipeline (draft → scheduled → published) in the
 * per-profile document "scheduled-posts" (see src/features/social/scheduledPosts.ts).
 * A scheduled post stays in that document — freely reschedulable from the
 * Calendar — until this sweep (cron `/api/cron/publish-scheduled-posts`) finds
 * it due and pushes it to Zernio with publishNow. The outcome is written back
 * onto the entry (`published` or `failed` + error), so the UI always shows the
 * true status.
 */

import type { ZernioModule } from "../providers/zernioModule.ts";
import { describeZernioFailure } from "../providers/zernioModule.ts";
import { accountInBusinessProfile } from "./profileScope.ts";

/** Map our app platform to the Zernio post platform slug. */
export const ZERNIO_POST_PLATFORM: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  youtube: "youtube",
  x: "twitter",
};

export interface StoredScheduledPost {
  id: string;
  caption: string;
  accountIds: string[];
  platforms: string[];
  status: "draft" | "scheduled" | "published" | "failed";
  scheduledFor: string | null;
  mediaUrls: string[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

/** A post is due when it is scheduled and its time has passed. */
export function isPostDue(post: StoredScheduledPost, nowMs: number): boolean {
  if (post.status !== "scheduled") return false;
  const t = post.scheduledFor ? Date.parse(post.scheduledFor) : NaN;
  return Number.isFinite(t) && t <= nowMs;
}

export function parseScheduledPostsDoc(data: unknown): StoredScheduledPost[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (entry): entry is StoredScheduledPost =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as StoredScheduledPost).id === "string" &&
      typeof (entry as StoredScheduledPost).status === "string"
  );
}

interface TokenStoreLike {
  get(accountId: string): Promise<Record<string, unknown> | null | undefined>;
}

interface SupabaseAdminLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: unknown; error: { message: string } | null }>;
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * Resolve the Zernio publish targets for a post's connected-account ids,
 * scoped to the owning business profile. Mirrors the checks in
 * POST /api/content/publish (minus the session, since cron runs as service).
 */
async function resolvePublishTargets(
  tokenStore: TokenStoreLike,
  accountIds: string[],
  businessProfileId: string
): Promise<Array<{ platform: string; accountId: string }>> {
  const targets: Array<{ platform: string; accountId: string }> = [];
  for (const accountId of accountIds) {
    const stored = await tokenStore.get(accountId);
    if (!stored) continue;
    if (!accountInBusinessProfile(stored, businessProfileId)) continue;
    const zernioAccountId = String(stored.zernioAccountId || stored.lateAccountId || "").trim();
    const slug = ZERNIO_POST_PLATFORM[String(stored.platform || "")];
    if (!zernioAccountId || !slug) continue;
    targets.push({ platform: slug, accountId: zernioAccountId });
  }
  return targets;
}

export interface PublishSweepResult {
  profiles: number;
  due: number;
  published: number;
  failed: number;
}

/**
 * One sweep across every profile's scheduled-posts document: publish what is
 * due, record the outcome on each entry. Per-post failures never abort the
 * sweep — the entry is marked `failed` with the reason and the user can
 * reschedule it (which puts it back in the queue).
 */
export async function publishDueScheduledPosts(deps: {
  supabaseAdmin: SupabaseAdminLike;
  zernio: ZernioModule;
  tokenStore: TokenStoreLike;
  now?: Date;
}): Promise<PublishSweepResult> {
  const nowMs = (deps.now ?? new Date()).getTime();
  const { data, error } = await deps.supabaseAdmin
    .from("profile_documents")
    .select("id,business_profile_id,data")
    .eq("key", "scheduled-posts");
  if (error) throw new Error(`scheduled-posts load failed: ${error.message}`);

  const rows = Array.isArray(data) ? data : [];
  const result: PublishSweepResult = { profiles: rows.length, due: 0, published: 0, failed: 0 };

  for (const rawRow of rows) {
    const row = rawRow as { id: string; business_profile_id: string; data: unknown };
    const posts = parseScheduledPostsDoc(row.data);
    const due = posts.filter((p) => isPostDue(p, nowMs));
    if (due.length === 0) continue;
    result.due += due.length;

    const updates = new Map<string, Partial<StoredScheduledPost>>();
    for (const post of due) {
      try {
        const targets = await resolvePublishTargets(
          deps.tokenStore,
          Array.isArray(post.accountIds) ? post.accountIds : [],
          String(row.business_profile_id)
        );
        if (targets.length === 0) {
          throw new Error("No publishable Zernio account (reconnect the social account).");
        }
        const mediaUrls = Array.isArray(post.mediaUrls) ? post.mediaUrls.filter(Boolean) : [];
        const publishResult = await deps.zernio.createPost({
          content: String(post.caption || ""),
          platforms: targets,
          publishNow: true,
          mediaItems:
            mediaUrls.length > 0
              ? mediaUrls.map((url) => ({
                  type: /\.(mp4|mov|webm)(\?|#|$)/i.test(url) ? "video" : "image",
                  url,
                }))
              : undefined,
        });
        if (!publishResult.ok) {
          throw new Error(describeZernioFailure(publishResult).message);
        }
        updates.set(post.id, { status: "published", error: undefined });
        result.published += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updates.set(post.id, { status: "failed", error: message.slice(0, 300) });
        result.failed += 1;
      }
    }

    const nextPosts = posts.map((p) =>
      updates.has(p.id)
        ? { ...p, ...updates.get(p.id), updatedAt: new Date().toISOString() }
        : p
    );
    const { error: updateError } = await deps.supabaseAdmin
      .from("profile_documents")
      .update({ data: nextPosts })
      .eq("id", String(row.id));
    if (updateError) {
      console.warn(
        `[cron] publish-scheduled-posts write-back failed bp=${row.business_profile_id}:`,
        updateError.message
      );
    }
  }

  return result;
}
