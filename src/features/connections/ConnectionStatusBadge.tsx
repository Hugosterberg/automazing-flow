import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CONNECTION_STATUS_LABELS, type ConnectionStatus } from "./connectionStatus";

const STYLES: Record<ConnectionStatus, string> = {
  connected: "border-success/30 bg-success/10 text-success",
  not_connected: "border-border bg-muted/40 text-muted-foreground",
  reconnect_required: "border-warning/40 bg-warning/10 text-warning",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  syncing: "border-info/40 bg-info/10 text-info",
};

function Icon({
  status,
  className,
}: {
  status: ConnectionStatus;
  className?: string;
}) {
  switch (status) {
    case "connected":
      return <CheckCircle2 className={className} aria-hidden />;
    case "reconnect_required":
      return <CircleAlert className={className} aria-hidden />;
    case "error":
      return <XCircle className={className} aria-hidden />;
    case "syncing":
      return <Loader2 className={cn(className, "animate-spin")} aria-hidden />;
    case "not_connected":
    default:
      return <CircleDashed className={className} aria-hidden />;
  }
}

/**
 * Page-facing badge. Uses the ConnectionStatus taxonomy (user vocabulary).
 * For internal DB health (pending / missing etc.) use ConnectionHealthBadge.
 */
export function ConnectionStatusBadge({
  status,
  className,
}: {
  status: ConnectionStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        STYLES[status],
        className
      )}
    >
      <Icon status={status} className="h-3 w-3" />
      {CONNECTION_STATUS_LABELS[status]}
    </span>
  );
}
