import { Bell, AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useActivityFeed, type ActivityEventRow } from "./useActivityFeed";

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

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return formatDistanceToNow(new Date(t), { addSuffix: true });
  } catch {
    return "";
  }
}

/**
 * Notifications bell — surfaces the recent activity feed in a dropdown so
 * automations, connection changes and alerts are visible from anywhere. The
 * badge counts action-worthy (error/warning) events in the recent batch.
 */
export function NotificationsBell() {
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { events } = useActivityFeed(businessProfileId, { limit: 12 });
  const actionCount = events.filter((e) => e.severity === ("error" as Severity) || e.severity === ("warning" as Severity)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={actionCount > 0 ? `Notifications, ${actionCount} need attention` : "Notifications"}
          className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/40 text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
        >
          <Bell className="h-4 w-4" />
          {actionCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums">
              {actionCount > 9 ? "9+" : actionCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="px-3 py-2.5">Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-[360px] overflow-y-auto py-1">
          {events.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No recent activity.</p>
          ) : (
            events.map((e) => {
              const Icon = SEVERITY_ICON[e.severity] ?? Info;
              return (
                <div key={e.id} className="flex items-start gap-2.5 px-3 py-2 hover:bg-accent/30">
                  <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", SEVERITY_TONE[e.severity] ?? "text-muted-foreground")} aria-hidden />
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
        <Link
          to="/activity"
          className="block px-3 py-2.5 text-center text-xs font-medium text-primary hover:bg-accent/30"
        >
          View all activity
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
