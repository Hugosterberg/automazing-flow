import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Thin banner shown when the browser loses network connectivity. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-warning"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Du är offline — vissa funktioner kan vara otillgängliga tills anslutningen återkommer.</span>
    </div>
  );
}
