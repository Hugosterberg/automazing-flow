import { useState } from "react";
import { Bell, AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SheetGrabber } from "@/components/ui/sheet-grabber";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles/useActiveBusinessProfileId";
import { useDailyBriefSummary } from "@/features/daily-brief/useDailyBriefSummary";
import type { BriefItemKind } from "@/features/daily-brief/buildDailyBrief";
import { useActivityFeed, type ActivityEventRow } from "./useActivityFeed";
import {
  Banknote,
  Bot,
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
  agent: Bot,
  economy: Banknote,
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

function NotificationsPanel({
  briefLoading,
  allClear,
  actionCount,
  priorityItems,
  activityAlerts,
  events,
  onNavigate,
}: {
  briefLoading: boolean;
  allClear: boolean;
  actionCount: number;
  priorityItems: Array<{ id: string; title: string; description: string; kind: BriefItemKind; to: string }>;
  activityAlerts: ActivityEventRow[];
  events: ActivityEventRow[];
  onNavigate?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between px-1 pb-2 sm:px-3 sm:py-2.5">
        <span className="text-sm font-semibold sm:text-xs">Notiser</span>
        {!briefLoading && !allClear ? (
          <span className="text-[10px] font-normal tabular-nums text-muted-foreground">
            {actionCount} att hantera
          </span>
        ) : null}
      </div>

      {!briefLoading && priorityItems.length > 0 ? (
        <>
          <div className="px-1 py-1.5 sm:px-3 sm:py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prioriterat
            </p>
          </div>
          <div className="max-h-[240px] space-y-1.5 overflow-y-auto pb-2 sm:max-h-[200px] sm:space-y-0 sm:pb-1">
            {priorityItems.map((item) => {
              const Icon = KIND_ICON[item.kind];
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  onClick={onNavigate}
                  className="pressable flex items-start gap-2.5 rounded-2xl border border-border/50 bg-card/60 px-3 py-2.5 transition-colors sm:rounded-none sm:border-0 sm:bg-transparent sm:px-3 sm:py-2 sm:hover:bg-accent/30"
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-snug text-foreground">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="my-1 h-px bg-border/70" />
        </>
      ) : !briefLoading && allClear ? (
        <div className="flex items-center gap-2 px-1 py-4 text-xs text-muted-foreground sm:px-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          Allt under kontroll just nu.
        </div>
      ) : briefLoading ? (
        <div className="px-1 py-4 text-xs text-muted-foreground sm:px-3">Uppdaterar sammanfattning…</div>
      ) : null}

      <div className="px-1 py-1.5 sm:px-3 sm:py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Senaste aktivitet
          {activityAlerts.length > 0 ? (
            <span className="ml-1 text-warning">· {activityAlerts.length} varningar</span>
          ) : null}
        </p>
      </div>
      <div className="max-h-[260px] space-y-1 overflow-y-auto py-1 sm:max-h-[220px] sm:space-y-0">
        {events.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground sm:px-3">
            Ingen aktivitet ännu.
          </p>
        ) : (
          events.map((e) => {
            const Icon = SEVERITY_ICON[e.severity] ?? Info;
            return (
              <div
                key={e.id}
                className="flex items-start gap-2.5 rounded-xl px-3 py-2 sm:rounded-none sm:hover:bg-accent/30"
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    SEVERITY_TONE[e.severity] ?? "text-muted-foreground"
                  )}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-xs leading-snug text-foreground">{e.summary}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {e.module ? `${e.module} · ` : ""}
                    {timeAgo(e.occurred_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:gap-0 sm:divide-x sm:divide-border sm:border-t sm:border-border">
        <Link
          to="/"
          onClick={onNavigate}
          className="pressable block rounded-2xl border border-border/60 bg-card/50 px-3 py-3 text-center text-xs font-medium text-primary sm:rounded-none sm:border-0 sm:bg-transparent sm:py-2.5 sm:hover:bg-accent/30"
        >
          Dagens brief
        </Link>
        <Link
          to="/activity"
          onClick={onNavigate}
          className="pressable block rounded-2xl border border-border/60 bg-card/50 px-3 py-3 text-center text-xs font-medium text-primary sm:rounded-none sm:border-0 sm:bg-transparent sm:py-2.5 sm:hover:bg-accent/30"
        >
          All aktivitet
        </Link>
      </div>
    </div>
  );
}

/**
 * Notifications bell — prioritised brief items plus recent activity feed.
 * Badge reflects total items needing action across both sections.
 * Phones open a bottom sheet; desktop keeps the dropdown.
 */
export function NotificationsBell() {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { brief, isLoading: briefLoading } = useDailyBriefSummary(businessProfileId);
  const { events } = useActivityFeed(businessProfileId, { limit: 10 });

  const priorityItems = brief.items.slice(0, 5);
  const activityAlerts = events.filter(
    (e) => e.severity === ("error" as Severity) || e.severity === ("warning" as Severity)
  );
  const badgeCount = brief.actionCount;

  const trigger = (
    <button
      type="button"
      aria-label={badgeCount > 0 ? `Notiser, ${badgeCount} kräver uppmärksamhet` : "Notiser"}
      className="pressable relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground sm:h-8 sm:w-8"
      onClick={isMobile ? () => setSheetOpen(true) : undefined}
    >
      <Bell className="h-4 w-4" />
      {badgeCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold tabular-nums text-destructive-foreground animate-pulse">
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      ) : null}
    </button>
  );

  const panel = (
    <NotificationsPanel
      briefLoading={briefLoading}
      allClear={brief.allClear}
      actionCount={brief.actionCount}
      priorityItems={priorityItems}
      activityAlerts={activityAlerts}
      events={events}
      onNavigate={isMobile ? () => setSheetOpen(false) : undefined}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto px-4">
            <SheetGrabber />
            <SheetHeader className="sr-only">
              <SheetTitle>Notiser</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(100vw-2rem,22rem)] p-0">
        <DropdownMenuLabel className="sr-only">Notiser</DropdownMenuLabel>
        {panel}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
