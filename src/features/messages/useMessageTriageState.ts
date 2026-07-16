import { useCallback, useMemo } from "react";
import { useProfileDocument } from "@/features/profile-documents";
import { toast as sonnerToast } from "sonner";
import {
  pruneSnoozeMap,
  snoozeUntilNextWeek,
  snoozeUntilTomorrowMorning,
  type SnoozeMap,
} from "./messageSnooze";
import type { UnifiedMessage } from "./types";

/** Cap for the persisted handled-ids list so the document stays bounded. */
export const MAX_HANDLED_IDS = 500;

/** Cap for the persisted read-ids list so the document stays bounded. */
export const MAX_READ_IDS = 1000;

/**
 * Handled / read / snooze profile-document state for the unified inbox.
 * Providers don't expose mark-as-read; these are app-level triage flags.
 */
export function useMessageTriageState() {
  const handledDoc = useProfileDocument<string[]>("messages-handled", []);
  const snoozeDoc = useProfileDocument<SnoozeMap>("messages-snoozed", {});
  const readDoc = useProfileDocument<string[]>("messages-read", []);

  const handledIds = useMemo(
    () => new Set(Array.isArray(handledDoc.data) ? handledDoc.data : []),
    [handledDoc.data]
  );
  const snoozeMap = useMemo(
    () => pruneSnoozeMap(snoozeDoc.data && typeof snoozeDoc.data === "object" ? snoozeDoc.data : {}),
    [snoozeDoc.data]
  );
  const readIds = useMemo(
    () => new Set(Array.isArray(readDoc.data) ? readDoc.data : []),
    [readDoc.data]
  );

  const snoozeMessage = useCallback(
    (id: string, until: "tomorrow" | "week") => {
      const untilIso = until === "week" ? snoozeUntilNextWeek() : snoozeUntilTomorrowMorning();
      const next = pruneSnoozeMap({ ...snoozeMap, [id]: untilIso });
      snoozeDoc.save(next);
      sonnerToast.success(until === "week" ? "Uppskjutet till nästa vecka" : "Uppskjutet till imorgon");
    },
    [snoozeDoc, snoozeMap]
  );

  const markHandled = useCallback(
    (ids: string[], opts?: { silent?: boolean }) => {
      const fresh = ids.filter((id) => !handledIds.has(id));
      if (fresh.length === 0) return;
      const prev = Array.isArray(handledDoc.data) ? handledDoc.data : [];
      const next = [...prev, ...fresh].slice(-MAX_HANDLED_IDS);
      handledDoc.save(next);
      if (opts?.silent) return;
      if (fresh.length === 1) {
        sonnerToast.success("Markerad som hanterad", {
          action: { label: "Ångra", onClick: () => handledDoc.save(prev) },
        });
      } else {
        sonnerToast.success(`${fresh.length} meddelanden markerade som hanterade`);
      }
    },
    [handledDoc, handledIds]
  );

  const unmarkHandled = useCallback(
    (ids: string[]) => {
      const remove = new Set(ids);
      const prev = Array.isArray(handledDoc.data) ? handledDoc.data : [];
      const next = prev.filter((id) => !remove.has(id));
      if (next.length === prev.length) return;
      handledDoc.save(next);
      sonnerToast.success("Meddelandet är öppet igen");
    },
    [handledDoc]
  );

  const markRead = useCallback(
    (id: string) => {
      if (readIds.has(id)) return;
      const prev = Array.isArray(readDoc.data) ? readDoc.data : [];
      readDoc.save([...prev, id].slice(-MAX_READ_IDS));
    },
    [readDoc, readIds]
  );

  const isUnanswered = useCallback(
    // Stay in the open/queue until explicitly marked handled — opening to read
    // must not empty the triage list (local readIds only softens the unread badge).
    (msg: UnifiedMessage) => msg.isUnread && !handledIds.has(msg.id),
    [handledIds]
  );

  const isVisuallyUnread = useCallback(
    (msg: UnifiedMessage) => msg.isUnread && !handledIds.has(msg.id) && !readIds.has(msg.id),
    [handledIds, readIds]
  );

  return {
    handledIds,
    snoozeMap,
    readIds,
    markHandled,
    unmarkHandled,
    markRead,
    snoozeMessage,
    isUnanswered,
    isVisuallyUnread,
  };
}
