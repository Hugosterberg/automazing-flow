import { useMemo } from "react";
import {
  AlertTriangle,
  Bot,
  Gauge,
  ListChecks,
  MessageSquare,
  PlugZap,
  Sparkles,
  Star,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useDailyBriefSummary } from "@/features/daily-brief/useDailyBriefSummary";
import type { BriefItemKind } from "@/features/daily-brief/buildDailyBrief";

export type AppPulseItem = {
  id: string;
  label: string;
  description: string;
  url: string;
  icon: LucideIcon;
  severity: "critical" | "warning" | "info";
};

const KIND_ICON: Record<BriefItemKind, LucideIcon> = {
  connection: PlugZap,
  message: MessageSquare,
  marketing: Gauge,
  lead: Target,
  task: ListChecks,
  recommendation: Sparkles,
  review: Star,
  automation: Zap,
  agent: Bot,
};

/**
 * Cross-app attention aggregator — mirrors the daily brief priority list
 * for command palette, badges and quick actions.
 */
export function useAppPulse(): { items: AppPulseItem[]; total: number } {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { brief } = useDailyBriefSummary(businessProfileId);

  const items = useMemo(
    () =>
      brief.items.slice(0, 6).map((item) => ({
        id: item.id,
        label: item.title,
        description: item.description,
        url: item.to,
        icon: KIND_ICON[item.kind] ?? AlertTriangle,
        severity: item.severity,
      })),
    [brief.items]
  );

  return { items, total: brief.actionCount };
}
