import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle } from "lucide-react";
import { useAccounts } from "@/context/AccountsContext";
import { useWorkspaceMode } from "@/features/workspace-mode";
import {
  AREA_LABELS,
  areaOrderForMode,
  catalogConnectSteps,
  catalogPageName,
  getCatalogByArea,
} from "@/lib/connectionCatalog";
import { t } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Full-page overview: every integration, linked or not, with prerequisites and deep links.
 */
export function ConnectionsMap() {
  const { activeProfile, activeProfileId, allAccounts } = useAccounts();
  const { mode } = useWorkspaceMode();
  const byArea = getCatalogByArea();
  const areaOrder = useMemo(() => areaOrderForMode(mode), [mode]);

  const linked = useMemo(
    () => allAccounts.filter((a) => a.profileId === activeProfileId && !a.disconnectedAt),
    [allAccounts, activeProfileId]
  );

  const totalIntegrations = useMemo(
    () => areaOrder.reduce((n, a) => n + byArea[a].length, 0),
    [areaOrder, byArea]
  );
  const linkedPlatforms = useMemo(() => new Set(linked.map((a) => a.platform)), [linked]);
  const linkedCount = useMemo(() => {
    let c = 0;
    for (const area of areaOrder) {
      for (const row of byArea[area]) {
        if (linkedPlatforms.has(row.platform)) c += 1;
      }
    }
    return c;
  }, [areaOrder, byArea, linkedPlatforms]);

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground space-y-2"
        role="region"
        aria-label="How connections and server configuration relate"
      >
        <p>
          <span className="font-medium text-foreground">Active profile:</span>{" "}
          {activeProfile?.name ?? "—"}. Status below is{" "}
          <span className="text-foreground">only for this profile</span> in this browser (what you have linked in the
          sidebar).
        </p>
        <p>
          <span className="font-medium text-foreground">Summary:</span>{" "}
          <span className="tabular-nums text-foreground">{linkedCount}</span> of{" "}
          <span className="tabular-nums text-foreground">{totalIntegrations}</span> integration types have at least one
          linked account.
        </p>
        <p>
          Filling values under <Link to="/preferences" className="underline underline-offset-2 text-foreground">Preferences → API keys</Link>{" "}
          only prepares the server; you still need to run each provider&apos;s Connect flow from the app (or sidebar).
        </p>
      </div>

      {areaOrder.map((area) => (
        <Card key={area} className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{AREA_LABELS[area]}</CardTitle>
            <CardDescription>
              Open the page and use Connect buttons, or use Connect more in the sidebar for this section.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {byArea[area].map((entry) => {
              const accs = linked.filter((a) => a.platform === entry.platform);
              const ok = accs.length > 0;
              return (
                <div
                  key={entry.platform}
                  className="rounded-md border border-border/80 bg-muted/15 px-3 py-2.5 sm:px-4 space-y-1.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {ok ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/45" aria-hidden />
                      )}
                      <span className="font-medium text-sm">{entry.label}</span>
                    </div>
                    <Link
                      to={entry.pageHref}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline shrink-0"
                    >
                      {t("catalog:openPage", { page: catalogPageName(entry) })}
                    </Link>
                  </div>
                  {ok ? (
                    <p className="text-xs text-muted-foreground pl-6">
                      Kopplat: {accs.map((a) => a.displayName || a.username).join(" · ")}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-800 dark:text-amber-500/95 pl-6">Inte kopplat för den här profilen än.</p>
                  )}
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                    <span className="font-medium text-foreground/80">{t("catalog:inApp")}</span>{" "}
                    {catalogConnectSteps(entry)}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                    <span className="font-medium text-foreground/80">På servern (.env / Inställningar):</span>{" "}
                    {entry.serverNeeds}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
