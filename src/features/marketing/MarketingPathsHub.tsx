import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Compass } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MARKETING_PATH_GROUPS, MARKETING_PATHS, type MarketingPath } from "./marketingPaths";
import { cn } from "@/lib/utils";

function PathCard({
  path,
  statusLabel,
}: {
  path: MarketingPath;
  statusLabel?: string | null;
}) {
  const { t } = useTranslation("marketing");
  const Icon = path.icon;

  return (
    <Card className="border-border/80 transition-colors hover:border-primary/25 hover:bg-muted/15">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-sm leading-snug">{t(`paths.${path.id}.title`)}</CardTitle>
              <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                {t(`pathKinds.${path.kind}`)}
              </Badge>
              {statusLabel ? (
                <Badge variant="secondary" className="mt-1 ml-1 text-[10px]">
                  {statusLabel}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <CardDescription className="text-xs leading-relaxed pt-1">
          {t(`paths.${path.id}.description`)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <ul className="space-y-1">
          {path.actionKeys.map((actionKey) => (
            <li
              key={actionKey}
              className="text-[11px] text-muted-foreground before:mr-1.5 before:content-['•']"
            >
              {t(`paths.${path.id}.actions.${actionKey}`)}
            </li>
          ))}
        </ul>
        <Button asChild size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs">
          <Link to={path.href}>
            {path.href.startsWith("/marketing") ? t("pathsHub.openHere") : t("pathsHub.open")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Overview of every way to market the company and its products — grouped by
 * paid, organic, owned and partnership paths with links into the rest of the app.
 */
export function MarketingPathsHub({
  pathStatus,
}: {
  pathStatus?: Partial<Record<string, string>>;
}) {
  const { t } = useTranslation("marketing");

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="h-4 w-4 text-primary" />
          {t("pathsHub.title")}
        </CardTitle>
        <CardDescription className="max-w-3xl">{t("pathsHub.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {MARKETING_PATH_GROUPS.map((group) => {
          const paths = MARKETING_PATHS.filter((path) => path.kind === group.kind);
          return (
            <section key={group.kind} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t(`pathGroups.${group.kind}.title`)}</h3>
                <p className="text-xs text-muted-foreground">{t(`pathGroups.${group.kind}.description`)}</p>
              </div>
              <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3")}>
                {paths.map((path) => (
                  <PathCard key={path.id} path={path} statusLabel={pathStatus?.[path.id] ?? null} />
                ))}
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
