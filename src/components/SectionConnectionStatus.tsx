import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { useAccounts } from "@/context/AccountsContext";
import { useConnections, aggregateStatus } from "@/features/connections";
import {
  AREA_LABELS,
  catalogConnectSteps,
  getConnectionEntriesForArea,
  type AppArea,
} from "@/lib/connectionCatalog";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  area: AppArea;
  className?: string;
  /** Hide when every entry for the area is connected and healthy. */
  hideWhenHealthy?: boolean;
};

type RowState = "ok" | "attention" | "missing";

/**
 * Compact checklist for the current app page: what is linked for the active
 * profile, what needs reconnect, and what is still missing.
 */
export function SectionConnectionStatus({ area, className, hideWhenHealthy = false }: Props) {
  const { activeProfileId, allAccounts } = useAccounts();
  const { connections } = useConnections(activeProfileId);
  const entries = getConnectionEntriesForArea(area);

  const linkedAccounts = useMemo(
    () => allAccounts.filter((a) => a.profileId === activeProfileId && !a.disconnectedAt),
    [allAccounts, activeProfileId]
  );

  const total = entries.length;
  const rows = useMemo(() => {
    return entries.map((entry) => {
      const platformConnections = connections.filter((c) => c.platform === entry.platform);
      const status =
        platformConnections.length > 0
          ? aggregateStatus(platformConnections)
          : linkedAccounts.some((a) => a.platform === entry.platform)
            ? ("connected" as const)
            : ("not_connected" as const);
      const state: RowState =
        status === "error" || status === "reconnect_required"
          ? "attention"
          : status === "connected" || status === "syncing"
            ? "ok"
            : "missing";
      const names = platformConnections
        .map((c) => c.displayName || c.username)
        .filter(Boolean);
      const fallbackNames = linkedAccounts
        .filter((a) => a.platform === entry.platform)
        .map((a) => a.displayName || a.username)
        .filter(Boolean);
      return {
        entry,
        state,
        status,
        names: names.length > 0 ? names : fallbackNames,
      };
    });
  }, [entries, connections, linkedAccounts]);

  const okCount = rows.filter((r) => r.state === "ok").length;
  const attentionCount = rows.filter((r) => r.state === "attention").length;
  const missingCount = rows.filter((r) => r.state === "missing").length;

  if (hideWhenHealthy && attentionCount === 0 && missingCount === 0 && total > 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "space-y-2.5 rounded-lg border border-border/80 bg-muted/20 px-3 py-3 sm:px-4 sm:py-3.5",
        className
      )}
      role="region"
      aria-label={t("catalog:statusAria", { area: AREA_LABELS[area] })}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("catalog:statusHeading", { area: AREA_LABELS[area] })}
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {okCount} av {total} i gott skick
            {attentionCount > 0 ? ` · ${attentionCount} behöver åtgärd` : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <Link
            to={attentionCount > 0 ? "/connections?filter=attention" : "/connections"}
            className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
          >
            Hantera kopplingar
          </Link>
          <Link
            to="/preferences?tab=api-keys"
            className="underline underline-offset-2 hover:text-foreground"
          >
            API-nycklar
          </Link>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map(({ entry, state, names }) => (
          <li key={entry.platform} className="flex gap-2.5 text-sm">
            {state === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            ) : state === "attention" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="font-medium text-foreground">{entry.label}</span>
                {state === "ok" ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {names.join(" · ") || "Kopplad"}
                  </span>
                ) : state === "attention" ? (
                  <span className="text-xs text-warning/90">Kräver återanslutning</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Ej kopplad</span>
                )}
              </div>
              {state !== "ok" ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {catalogConnectSteps(entry)}{" "}
                  <Link
                    to={
                      state === "attention"
                        ? `/connections?filter=attention&q=${encodeURIComponent(entry.label)}&session=${encodeURIComponent(entry.platform)}`
                        : `/connections?session=${encodeURIComponent(entry.platform)}`
                    }
                    className="whitespace-nowrap font-medium text-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {state === "attention" ? (
                      <span className="inline-flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" aria-hidden />
                        Koppla om
                      </span>
                    ) : (
                      "Koppla nu"
                    )}
                  </Link>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
