import { Bell, AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useDailyBriefSummary } from "@/features/daily-brief/useDailyBriefSummary";
import type { BriefItemKind } from "@/features/daily-brief/buildDailyBrief";
import { useActivityFeed, type ActivityEventRow } from "./useActivityFeed";
import {
  Gauge,
  ListChecks,
  MessageSquare,
  PlugZap,
  Star,
  Target,
  Zap,
} from "lucide-react";

type Severity = ActivityEventRow["severity"];

const SEVERITY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  error: XCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};
const SEVERITY_TONE: Record<string, string> = {
  error: "text-destructive",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
};

const KIND_ICON: Record<BriefItemKind, React.ComponentType<{ className?: string }>> = {
  connection: PlugZap,
  message: MessageSquare,
  marketing: Gauge,
  lead: Target,
  task: ListChecks,
  recommendation: Sparkles,
  review: Star,
  automation: Zap,
};

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return formatDistanceToNow(new Date(t), { addSuffix: true, locale: sv });
  } catch {
    return "";
  }
}

/**
 * Notifications bell — prioritised brief items plus recent activity feed.
 * Badge reflects total items needing action across both sections.
 */
export function NotificationsBell() {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { brief, isLoading: briefLoading } = useDailyBriefSummary(businessProfileId);
  const { events } = useActivityFeed(businessProfileId, { limit: 10 });

  const priorityItems = brief.items.slice(0, 5);
  const activityAlerts = events.filter(
    (e) => e.severity === ("error" as Severity) || e.severity === ("warning" as Severity)
  );
  const badgeCount = brief.actionCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            badgeCount > 0 ? `Notiser, ${badgeCount} kräver uppmärksamhet` : "Notiser"
          }
          className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          {badgeCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums animate-pulse">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(100vw-2rem,22rem)] p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2.5">
          <span>Notiser</span>
          {!briefLoading && !brief.allClear ? (
            <span className="text-[10px] font-normal tabular-nums text-muted-foreground">
              {brief.actionCount} att hantera
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />

        {!briefLoading && priorityItems.length > 0 ? (
          <>
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Prioriterat
              </p>
            </div>
            <div className="max-h-[200px] overflow-y-auto pb-1">
              {priorityItems.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className="flex items-start gap-2.5 px-3 py-2 hover:bg-accent/30 transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground leading-snug">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
            <DropdownMenuSeparator className="my-0" />
          </>
        ) : !briefLoading && brief.allClear ? (
          <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            Allt under kontroll just nu.
          </div>
        ) : briefLoading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">Uppdaterar sammanfattning…</div>
        ) : null}

        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Senaste aktivitet
            {activityAlerts.length > 0 ? (
              <span className="ml-1 text-warning">· {activityAlerts.length} varningar</span>
            ) : null}
          </p>
        </div>
        <div className="max-h-[220px] overflow-y-auto py-1">
          {events.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Ingen aktivitet ännu.</p>
          ) : (
            events.map((e) => {
              const Icon = SEVERITY_ICON[e.severity] ?? Info;
              return (
                <div key={e.id} className="flex items-start gap-2.5 px-3 py-2 hover:bg-accent/30">
                  <Icon
                    className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", SEVERITY_TONE[e.severity] ?? "text-muted-foreground")}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground leading-snug">{e.summary}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {e.module ? `${e.module} · ` : ""}
                      {timeAgo(e.occurred_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="grid grid-cols-2 divide-x divide-border">
          <Link
            to="/"
            className="block px-3 py-2.5 text-center text-xs font-medium text-primary hover:bg-accent/30"
          >
            Dagens brief
          </Link>
          <Link
            to="/activity"
            className="block px-3 py-2.5 text-center text-xs font-medium text-primary hover:bg-accent/30"
          >
            All aktivitet
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
