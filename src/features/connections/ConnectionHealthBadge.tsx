import { CheckCircle2, CircleAlert, CircleDashed, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionHealth } from "@/types/connection";

const LABELS: Record<ConnectionHealth, string> = {
  healthy: "Frisk",
  expired: "Kräver inloggning",
  failed: "Synkfel",
  disconnected: "Frånkopplad",
  pending: "Väntar",
  missing: "Kräver inloggning",
};

const STYLES: Record<ConnectionHealth, string> = {
  healthy: "border-success/30 bg-success/10 text-success",
  expired: "border-warning/40 bg-warning/10 text-warning",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  disconnected: "border-warning/40 bg-warning/5 text-warning/90",
  pending: "border-info/40 bg-info/10 text-info",
  missing: "border-warning/40 bg-warning/10 text-warning",
};

function Icon({ health, className }: { health: ConnectionHealth; className?: string }) {
  switch (health) {
    case "healthy":
      return <CheckCircle2 className={className} aria-hidden />;
    case "expired":
      return <CircleAlert className={className} aria-hidden />;
    case "failed":
      return <XCircle className={className} aria-hidden />;
    case "disconnected":
      return <XCircle className={className} aria-hidden />;
    case "pending":
      return <Clock className={className} aria-hidden />;
    case "missing":
    default:
      return <CircleDashed className={className} aria-hidden />;
  }
}

export function ConnectionHealthBadge({
  health,
  className,
}: {
  health: ConnectionHealth;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        STYLES[health],
        className
      )}
    >
      <Icon health={health} className="h-3 w-3" />
      {LABELS[health]}
    </span>
  );
}
