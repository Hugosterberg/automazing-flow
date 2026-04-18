import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "@/lib/relativeTime";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAiRecommendations } from "./useAiRecommendations";
import {
  AI_REC_KIND_LABELS,
  type AiRecommendationRow,
} from "./aiRecommendationsService";

interface Props {
  businessProfileId: string | null | undefined;
  /** Max number of active recommendations to preview. Defaults to 3. */
  previewCount?: number;
}

function safeRelative(iso: string | null | undefined): string | null {
  try {
    return formatRelativeTime(iso);
  } catch {
    return null;
  }
}

/**
 * Rank active recommendations for a compact preview.
 * Priority order:
 *   1. Status `new` before `seen` (fresh signals win).
 *   2. Higher confidence first.
 *   3. Most recent `created_at`.
 *
 * Deterministic so the home page does not reshuffle on each render — users
 * should be able to re-find an item they glanced at a moment ago.
 */
function rankActive(rows: AiRecommendationRow[]): AiRecommendationRow[] {
  const active = rows.filter((r) => r.status === "new" || r.status === "seen");
  return [...active].sort((a, b) => {
    if (a.status !== b.status) return a.status === "new" ? -1 : 1;
    const ac = a.confidence ?? 0;
    const bc = b.confidence ?? 0;
    if (ac !== bc) return bc - ac;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

/**
 * Expanded home-screen widget for AI recommendations. Shows up to
 * `previewCount` active recommendations with kind and title so users can
 * triage without leaving the home page. The full list is one click away via
 * the "View all" link.
 *
 * Always renders when a business profile is active — including the
 * zero-state — so the feature is discoverable before the producer has fired.
 */
export function AiRecommendationsWidget({
  businessProfileId,
  previewCount = 3,
}: Props) {
  const { recommendations, isLoading } = useAiRecommendations(businessProfileId);

  const { activeCount, preview, lastUpdated } = useMemo(() => {
    const ranked = rankActive(recommendations);
    const lastUpdated = recommendations.reduce<string | null>((latest, r) => {
      const ts = r.updated_at || r.created_at;
      if (!ts) return latest;
      if (!latest || ts > latest) return ts;
      return latest;
    }, null);
    return {
      activeCount: ranked.length,
      preview: ranked.slice(0, previewCount),
      lastUpdated,
    };
  }, [recommendations, previewCount]);

  if (!businessProfileId) return null;

  const lastUpdatedRelative = safeRelative(lastUpdated);
  const remaining = Math.max(activeCount - preview.length, 0);

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold tracking-tight">
                  AI Recommendations
                </h3>
                {activeCount > 0 ? (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {activeCount} active
                  </span>
                ) : null}
              </div>
              <Link
                to="/ai-recommendations"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : activeCount === 0 ? (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Check className="h-3 w-3 text-success" />
                All caught up
                {lastUpdatedRelative ? (
                  <span className="text-muted-foreground/80">
                    · checked {lastUpdatedRelative}
                  </span>
                ) : null}
              </p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {preview.map((rec) => (
                    <li
                      key={rec.id}
                      className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5"
                    >
                      <Badge
                        variant="outline"
                        className="text-[11px] uppercase border-border text-muted-foreground shrink-0 mt-0.5"
                      >
                        {AI_REC_KIND_LABELS[rec.kind]}
                      </Badge>
                      <p className="text-xs text-foreground leading-snug truncate">
                        {rec.title}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground/80">
                  {remaining > 0
                    ? `+${remaining} more`
                    : lastUpdatedRelative
                      ? `Updated ${lastUpdatedRelative}`
                      : null}
                </p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
