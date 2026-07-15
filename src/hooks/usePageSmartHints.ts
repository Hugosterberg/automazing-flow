import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { briefItemsForRoute } from "@/features/daily-brief/briefForRoute";
import { useDailyBriefSummary } from "@/features/daily-brief/useDailyBriefSummary";

export type SmartHintAction = {
  label: string;
  /** Navigate to a route. Prefer `onClick` for same-page actions. */
  to?: string;
  onClick?: () => void;
};

export type PageSmartHints = {
  /** Live signal text — overrides static tip when set. */
  liveHint: string | null;
  /** Quick actions derived from the daily brief for this page. */
  actions: SmartHintAction[];
  /** Total actionable count on this page. */
  pulseCount: number;
  allClear: boolean;
};

/**
 * Contextual intelligence for the current route — surfaces the same signals
 * as the daily brief, filtered to what matters on *this* page.
 */
export function usePageSmartHints(): PageSmartHints {
  const { pathname } = useLocation();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { brief } = useDailyBriefSummary(businessProfileId);

  return useMemo(() => {
    const relevant = briefItemsForRoute(pathname, brief.items);
    const pulseCount = relevant.reduce((sum, item) => sum + item.count, 0);

    if (relevant.length === 0) {
      return {
        liveHint: brief.allClear
          ? "Allt ser bra ut just nu — inget brådskande på den här sidan."
          : null,
        actions: [],
        pulseCount: 0,
        allClear: brief.allClear,
      };
    }

    const top = relevant[0];
    const liveHint =
      relevant.length === 1
        ? `${top.title} — ${top.description}`
        : `${relevant.length} saker behöver dig här: ${relevant.map((i) => i.title).join(" · ")}`;

    const actions: SmartHintAction[] = relevant.slice(0, 3).map((item) => ({
      label: item.count > 1 ? `${item.title}` : "Gå dit →",
      to: item.to,
    }));

    return {
      liveHint,
      actions,
      pulseCount,
      allClear: false,
    };
  }, [pathname, brief.items, brief.allClear]);
}
