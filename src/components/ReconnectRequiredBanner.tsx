import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useConnections } from "@/features/connections/useConnections";
import { statusFromConnection } from "@/features/connections/connectionStatus";
import { useTokenExpiryNotifier } from "@/hooks/useTokenExpiryNotifier";
import { platformLabel } from "@/lib/platformLabels";
import { cn } from "@/lib/utils";

/**
 * Sticky chrome banner when any connection needs re-auth / is failed.
 * Complements toasts (useTokenExpiryNotifier) so reconnect is hard to miss
 * outside the Connections page.
 */
export function ReconnectRequiredBanner() {
  const { t } = useTranslation();
  const businessProfileId = useActiveBusinessProfileIdOptional();
  const { connections } = useConnections(businessProfileId);
  useTokenExpiryNotifier(connections);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  const issues = useMemo(
    () =>
      connections.filter((c) => {
        if (c.disconnectedAt) return false;
        const status = statusFromConnection(c);
        return status === "reconnect_required" || status === "error";
      }),
    [connections]
  );

  if (sessionDismissed || issues.length === 0) return null;

  const platforms = [...new Set(issues.map((c) => c.platform))];
  const labels = platforms.map((p) => platformLabel(p));
  const shown = labels.slice(0, 2).join(", ") + (labels.length > 2 ? "…" : "");
  const target =
    platforms.length === 1
      ? `/connections?filter=attention&q=${encodeURIComponent(labels[0])}`
      : "/connections?filter=attention";
  const cta =
    platforms.length === 1
      ? t("chrome.fixOne", { platform: labels[0] })
      : t("chrome.fixMany");

  return (
    <div
      className={cn(
        "shrink-0 border-b border-warning/40 bg-warning/10 px-3 py-2 sm:px-4",
        "text-warning-foreground"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="min-w-0 flex-1 text-xs text-foreground sm:text-sm">
          <span className="font-medium">
            {issues.length === 1
              ? t("chrome.reconnectOne")
              : t("chrome.reconnectMany", { count: issues.length })}
          </span>
          <span className="text-muted-foreground">
            {" "}
            {t("chrome.reconnectPause", { platforms: shown })}
          </span>
        </p>
        <Button asChild type="button" size="sm" className="h-7 shrink-0 text-xs">
          <Link to={target}>{cta}</Link>
        </Button>
        <button
          type="button"
          onClick={() => setSessionDismissed(true)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          aria-label={t("chrome.dismissUntilReload")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
