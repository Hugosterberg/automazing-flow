import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Thin banner shown when the browser loses network connectivity. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning backdrop-blur-sm sm:py-1.5"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="line-clamp-1">
        Du är offline — vissa funktioner kan vara otillgängliga.
      </span>
    </div>
  );
}
