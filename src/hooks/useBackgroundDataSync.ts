import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { ACTIVITY_FEED_KEY } from "@/features/activity";
import { AI_RECS_KEY } from "@/features/ai-recommendations";
import { CONNECTIONS_KEY } from "@/features/connections";
import { UNREAD_DM_KEY } from "@/features/daily-brief/useUnreadDmCount";
import { LEADS_KEY } from "@/features/leads";
import { MARKETING_CAMPAIGNS_KEY, MARKETING_TREND_KEY } from "@/features/marketing";
import { TASKS_KEY } from "@/features/tasks";
import { dispatchLiveSync } from "@/lib/liveSyncEvents";
import { useOnlineStatus } from "./useOnlineStatus";
import { useVisibleIntervalRefetch } from "./useVisibleIntervalRefetch";

/** How often the shell refreshes shared attention data while visible. */
export const BACKGROUND_SYNC_MS = 60_000;

function invalidateAttentionQueries(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | null,
  businessProfileId: string
) {
  void qc.invalidateQueries({ queryKey: UNREAD_DM_KEY });
  void qc.invalidateQueries({ queryKey: [...TASKS_KEY, userId, businessProfileId] });
  void qc.invalidateQueries({ queryKey: [...ACTIVITY_FEED_KEY, businessProfileId] });
  void qc.invalidateQueries({ queryKey: [...AI_RECS_KEY, userId, businessProfileId] });
  void qc.invalidateQueries({ queryKey: [...CONNECTIONS_KEY, userId, businessProfileId] });
  void qc.invalidateQueries({ queryKey: [...LEADS_KEY, userId, businessProfileId] });
  void qc.invalidateQueries({ queryKey: MARKETING_CAMPAIGNS_KEY });
  void qc.invalidateQueries({ queryKey: MARKETING_TREND_KEY });
  dispatchLiveSync("all");
}

/**
 * Global background sync for cross-page attention data. Mounted once in
 * Layout so briefs, badges, toasts and page-level inboxes stay fresh.
 */
export function useBackgroundDataSync(businessProfileId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const wasOffline = useRef(false);
  const userId = user?.id ?? null;

  useVisibleIntervalRefetch(
    () => {
      if (!businessProfileId) {
        void qc.invalidateQueries({ queryKey: UNREAD_DM_KEY });
        dispatchLiveSync("messages");
        return;
      }
      invalidateAttentionQueries(qc, userId, businessProfileId);
    },
    BACKGROUND_SYNC_MS,
    { enabled: online, skipInitial: false }
  );

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    if (businessProfileId) {
      invalidateAttentionQueries(qc, userId, businessProfileId);
    } else {
      void qc.invalidateQueries({ queryKey: UNREAD_DM_KEY });
      dispatchLiveSync("messages");
    }
  }, [businessProfileId, online, qc, userId]);
}
