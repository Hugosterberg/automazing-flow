import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useActivityFeed } from "@/features/activity";
import { useDailyBriefSummary } from "@/features/daily-brief/useDailyBriefSummary";
import { useOnlineStatus } from "./useOnlineStatus";

type Snapshot = {
  actionCount: number;
  unreadDms: number;
  reviewsPending: number;
  overdueTasks: number;
  newRecs: number;
  connectionIssues: number;
  leadsFollowUp: number;
  latestAlertId: string | null;
};

function pickSnapshot(
  brief: ReturnType<typeof useDailyBriefSummary>["brief"],
  events: ReturnType<typeof useActivityFeed>["events"]
): Snapshot {
  const messageItem = brief.items.find((i) => i.id === "messages");
  const reviewItem = brief.items.find((i) => i.id === "reviews-reply");
  const overdueItem = brief.items.find((i) => i.id === "tasks-overdue");
  const recItem = brief.items.find((i) => i.id === "recommendations");
  const connItem = brief.items.find((i) => i.id === "connections");
  const leadItem = brief.items.find((i) => i.id === "leads-followup");

  const alertEvent = events.find(
    (e) => e.severity === "error" || e.severity === "warning"
  );

  return {
    actionCount: brief.actionCount,
    unreadDms: messageItem?.count ?? 0,
    reviewsPending: reviewItem?.count ?? 0,
    overdueTasks: overdueItem?.count ?? 0,
    newRecs: recItem?.count ?? 0,
    connectionIssues: connItem?.count ?? 0,
    leadsFollowUp: leadItem?.count ?? 0,
    latestAlertId: alertEvent?.id ?? null,
  };
}

const TOAST_GAP_MS = 8_000;

/**
 * Surfaces subtle Sonner toasts when attention counts rise or new
 * warning/error activity arrives. Mounted once in Layout.
 */
export function useLiveChangeNotifications() {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const { brief, isLoading } = useDailyBriefSummary(businessProfileId);
  const { events } = useActivityFeed(businessProfileId, { limit: 8 });

  const prev = useRef<Snapshot | null>(null);
  const ready = useRef(false);
  const lastToastAt = useRef(0);

  useEffect(() => {
    if (!online || isLoading || !businessProfileId) return;

    const next = pickSnapshot(brief, events);
    if (!ready.current) {
      prev.current = next;
      ready.current = true;
      return;
    }

    const prior = prev.current;
    if (!prior) {
      prev.current = next;
      return;
    }

    const now = Date.now();
    const canToast = now - lastToastAt.current >= TOAST_GAP_MS;

    function notify(title: string, description: string, url: string) {
      if (!canToast) return;
      lastToastAt.current = now;
      toast(title, {
        description,
        action: {
          label: "Visa",
          onClick: () => navigate(url),
        },
      });
    }

    if (next.unreadDms > prior.unreadDms) {
      const delta = next.unreadDms - prior.unreadDms;
      notify(
        delta === 1 ? "Nytt meddelande" : `${delta} nya meddelanden`,
        "Obesvarade konversationer väntar i inkorgen.",
        "/messages"
      );
    } else if (next.reviewsPending > prior.reviewsPending) {
      notify(
        "Ny recension att svara på",
        "Ett omdöme behöver ditt svar.",
        "/reviews?filter=needs_reply"
      );
    } else if (next.newRecs > prior.newRecs) {
      notify(
        "Nya AI-rekommendationer",
        "Förslag redo att granskas.",
        "/ai-recommendations"
      );
    } else if (next.overdueTasks > prior.overdueTasks) {
      notify(
        "Försenade uppgifter",
        "En eller flera uppgifter har passerat deadline.",
        "/tasks?view=overdue"
      );
    } else if (next.connectionIssues > prior.connectionIssues) {
      notify(
        "Anslutningsproblem",
        "En integration behöver uppmärksamhet.",
        "/connections?tab=health"
      );
    } else if (
      next.latestAlertId &&
      next.latestAlertId !== prior.latestAlertId &&
      events[0]
    ) {
      const e = events[0]!;
      if (e.severity === "error" || e.severity === "warning") {
        notify(
          e.severity === "error" ? "Systemvarning" : "Obs — aktivitet",
          e.summary,
          "/activity"
        );
      }
    }

    prev.current = next;
  }, [brief, businessProfileId, events, isLoading, navigate, online]);
}
