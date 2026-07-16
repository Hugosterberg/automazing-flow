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

/** Every N light ticks, also refresh medium attention queries (2 min). */
const MEDIUM_EVERY_N = 2;
/** Every N light ticks, also refresh marketing + page live-sync (5 min). */
const HEAVY_EVERY_N = 5;

function invalidateLight(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | null,
  businessProfileId: string
) {
  void qc.invalidateQueries({ queryKey: UNREAD_DM_KEY });
  void qc.invalidateQueries({ queryKey: [...TASKS_KEY, userId, businessProfileId] });
}

function invalidateMedium(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | null,
  businessProfileId: string
) {
  void qc.invalidateQueries({ queryKey: [...ACTIVITY_FEED_KEY, businessProfileId] });
  void qc.invalidateQueries({ queryKey: [...AI_RECS_KEY, userId, businessProfileId] });
  void qc.invalidateQueries({ queryKey: [...CONNECTIONS_KEY, userId, businessProfileId] });
  void qc.invalidateQueries({ queryKey: [...LEADS_KEY, userId, businessProfileId] });
}

function invalidateHeavy(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: MARKETING_CAMPAIGNS_KEY });
  void qc.invalidateQueries({ queryKey: MARKETING_TREND_KEY });
  dispatchLiveSync("all");
}

/** Full refresh — profile switch, reconnect, or first intentional sync. */
function invalidateAttentionQueries(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | null,
  businessProfileId: string
) {
  invalidateLight(qc, userId, businessProfileId);
  invalidateMedium(qc, userId, businessProfileId);
  invalidateHeavy(qc);
}

/**
 * Global background sync for cross-page attention data. Mounted once in
 * Layout so briefs, badges, toasts and page-level inboxes stay fresh.
 *
 * Tiered cadence: light attention every minute, medium every 2 min, heavy
 * (marketing + full inbox/reviews live-sync) every 5 min — avoids burning
 * provider quota while the tab is merely open.
 */
export function useBackgroundDataSync(businessProfileId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const wasOffline = useRef(false);
  const tickRef = useRef(0);
  const userId = user?.id ?? null;

  useVisibleIntervalRefetch(
    () => {
      if (!businessProfileId) {
        void qc.invalidateQueries({ queryKey: UNREAD_DM_KEY });
        // Inbox-only when no profile — still throttle heavy page sync.
        tickRef.current += 1;
        if (tickRef.current % HEAVY_EVERY_N === 0) {
          dispatchLiveSync("messages");
        }
        return;
      }
      tickRef.current += 1;
      const tick = tickRef.current;
      invalidateLight(qc, userId, businessProfileId);
      if (tick % MEDIUM_EVERY_N === 0) {
        invalidateMedium(qc, userId, businessProfileId);
      }
      if (tick % HEAVY_EVERY_N === 0) {
        invalidateHeavy(qc);
      }
    },
    BACKGROUND_SYNC_MS,
    { enabled: online, skipInitial: false }
  );

  // Profile switches must refresh attention data immediately (not wait for the interval).
  const prevProfileId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!online) return;
    const prev = prevProfileId.current;
    prevProfileId.current = businessProfileId;
    if (prev === undefined || prev === businessProfileId) return;
    tickRef.current = 0;
    if (businessProfileId) {
      invalidateAttentionQueries(qc, userId, businessProfileId);
    } else {
      void qc.invalidateQueries({ queryKey: UNREAD_DM_KEY });
      dispatchLiveSync("messages");
    }
  }, [businessProfileId, online, qc, userId]);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    tickRef.current = 0;
    if (businessProfileId) {
      invalidateAttentionQueries(qc, userId, businessProfileId);
    } else {
      void qc.invalidateQueries({ queryKey: UNREAD_DM_KEY });
      dispatchLiveSync("messages");
    }
  }, [businessProfileId, online, qc, userId]);
}
