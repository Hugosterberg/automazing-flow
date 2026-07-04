/**
 * Local publishing pipeline for social posts: draft → scheduled → published.
 *
 * Posts live in the per-profile document "scheduled-posts" (Supabase
 * `profile_documents`), which is the source of truth until publish time.
 * "Publish now" goes straight to Zernio; "scheduled" posts are picked up by
 * the `/api/cron/publish-scheduled-posts` sweep when their time arrives, so
 * they can be freely rescheduled (e.g. from the Calendar) until then.
 */

export type ScheduledPostStatus = "draft" | "scheduled" | "published" | "failed";

export interface ScheduledPost {
  id: string;
  caption: string;
  /** Connected-account ids (our tokenStore ids) the post targets. */
  accountIds: string[];
  /** App platform slugs (instagram, facebook, …) for badges. */
  platforms: string[];
  status: ScheduledPostStatus;
  /** ISO timestamp; null for drafts without a planned time. */
  scheduledFor: string | null;
  mediaUrls: string[];
  createdAt: string;
  updatedAt: string;
  /** Publish failure reason, set by the cron sweep. */
  error?: string;
}

export const SCHEDULED_POSTS_DOC_KEY = "scheduled-posts";

/** Keep the document bounded — old published/failed entries fall off first. */
const MAX_POSTS = 100;

export const SCHEDULED_POST_STATUS_LABELS: Record<ScheduledPostStatus, string> = {
  draft: "Utkast",
  scheduled: "Schemalagd",
  published: "Publicerad",
  failed: "Misslyckad",
};

function timeOf(post: ScheduledPost): number {
  const t = post.scheduledFor ? Date.parse(post.scheduledFor) : NaN;
  return Number.isFinite(t) ? t : Date.parse(post.createdAt) || 0;
}

/** Drafts and upcoming scheduled posts first (soonest on top), history last. */
export function sortScheduledPosts(posts: ScheduledPost[]): ScheduledPost[] {
  const rank = (p: ScheduledPost) => (p.status === "draft" || p.status === "scheduled" || p.status === "failed" ? 0 : 1);
  return [...posts].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    // Active queue: soonest first. History: newest first.
    return rank(a) === 0 ? timeOf(a) - timeOf(b) : timeOf(b) - timeOf(a);
  });
}

/** Insert or replace by id, capping the document size (oldest history first out). */
export function upsertScheduledPost(posts: ScheduledPost[], post: ScheduledPost): ScheduledPost[] {
  const next = [post, ...posts.filter((p) => p.id !== post.id)];
  if (next.length <= MAX_POSTS) return next;
  const history = next
    .filter((p) => p.status === "published")
    .sort((a, b) => timeOf(a) - timeOf(b));
  const dropIds = new Set(history.slice(0, next.length - MAX_POSTS).map((p) => p.id));
  return next.filter((p) => !dropIds.has(p.id)).slice(0, MAX_POSTS);
}

export function removeScheduledPost(posts: ScheduledPost[], id: string): ScheduledPost[] {
  return posts.filter((p) => p.id !== id);
}

/**
 * Move a draft/scheduled post to a new time. Published posts are immutable.
 * Returns the same array reference when nothing changed.
 */
export function rescheduleScheduledPost(
  posts: ScheduledPost[],
  id: string,
  scheduledForIso: string
): ScheduledPost[] {
  const target = posts.find((p) => p.id === id);
  if (!target || target.status === "published") return posts;
  return posts.map((p) =>
    p.id === id
      ? {
          ...p,
          scheduledFor: scheduledForIso,
          // A failed post that gets a new time goes back into the queue.
          status: p.status === "failed" ? "scheduled" : p.status,
          error: p.status === "failed" ? undefined : p.error,
          updatedAt: new Date().toISOString(),
        }
      : p
  );
}
