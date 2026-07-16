import { Link } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MARKETING_PATH_GROUPS,
  MARKETING_PATH_KIND_LABELS,
  MARKETING_PATHS,
  type MarketingPath,
} from "./marketingPaths";
import { cn } from "@/lib/utils";

function PathCard({ path, statusLabel }: { path: MarketingPath; statusLabel?: string | null }) {
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
              <CardTitle className="text-sm leading-snug">{path.title}</CardTitle>
              <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                {MARKETING_PATH_KIND_LABELS[path.kind]}
              </Badge>
              {statusLabel ? (
                <Badge variant="secondary" className="mt-1 ml-1 text-[10px]">
                  {statusLabel}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <CardDescription className="text-xs leading-relaxed pt-1">{path.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <ul className="space-y-1">
          {path.actions.map((action) => (
            <li key={action} className="text-[11px] text-muted-foreground before:mr-1.5 before:content-['•']">
              {action}
            </li>
          ))}
        </ul>
        <Button asChild size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs">
          <Link to={path.href}>
            {path.href.startsWith("/marketing") ? "Öppna här" : "Öppna"}
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
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="h-4 w-4 text-primary" />
          Marknadsvägar
        </CardTitle>
        <CardDescription className="max-w-3xl">
          Flera sätt att nå kunder — välj en väg för betald annonsering, organiskt innehåll, e-post, e-handel,
          lokala recensioner eller partnerskap. Du behöver inte alla kanaler; börja med en eller två som passar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {MARKETING_PATH_GROUPS.map((group) => {
          const paths = MARKETING_PATHS.filter((path) => path.kind === group.kind);
          return (
            <section key={group.kind} className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
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
