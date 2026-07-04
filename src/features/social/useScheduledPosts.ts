import { useCallback } from "react";
import { useProfileDocument } from "@/features/profile-documents";
import {
  SCHEDULED_POSTS_DOC_KEY,
  removeScheduledPost,
  rescheduleScheduledPost,
  sortScheduledPosts,
  upsertScheduledPost,
  type ScheduledPost,
} from "./scheduledPosts";

/**
 * The per-profile publishing pipeline (draft → scheduled → published), synced
 * across devices via `profile_documents`. Scheduled entries are published by
 * the server's publish-scheduled-posts sweep when their time arrives.
 */
export function useScheduledPosts() {
  const doc = useProfileDocument<ScheduledPost[]>(SCHEDULED_POSTS_DOC_KEY, []);
  const { data, save } = doc;

  const upsert = useCallback(
    (post: ScheduledPost) => save(upsertScheduledPost(data, post)),
    [data, save]
  );
  const remove = useCallback(
    (id: string) => save(removeScheduledPost(data, id)),
    [data, save]
  );
  const reschedule = useCallback(
    (id: string, scheduledForIso: string) => save(rescheduleScheduledPost(data, id, scheduledForIso)),
    [data, save]
  );

  return {
    posts: sortScheduledPosts(data),
    isLoading: doc.isLoading,
    upsert,
    remove,
    reschedule,
  };
}
