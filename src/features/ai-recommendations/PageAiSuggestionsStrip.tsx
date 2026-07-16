import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiRecommendations } from "./useAiRecommendations";
import type { AiRecommendationKind, AiRecommendationRow } from "./aiRecommendationsService";

function rankForPage(rows: AiRecommendationRow[], kinds: AiRecommendationKind[]): AiRecommendationRow[] {
  const kindSet = new Set(kinds);
  return rows
    .filter((r) => (r.status === "new" || r.status === "seen") && kindSet.has(r.kind))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "new" ? -1 : 1;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    });
}

type Props = {
  businessProfileId: string | null | undefined;
  kinds: AiRecommendationKind[];
  /** Short label for the strip header. */
  label?: string;
  maxItems?: number;
};

/**
 * Compact AI suggestions scoped to the current workflow page —
 * surfaces the next best recommendation without visiting /ai-recommendations.
 */
export function PageAiSuggestionsStrip({
  businessProfileId,
  kinds,
  label,
  maxItems = 2,
}: Props) {
  const { t } = useTranslation("aiRecommendations");
  const { recommendations, isLoading } = useAiRecommendations(businessProfileId);
  const ranked = rankForPage(recommendations, kinds).slice(0, maxItems);
  const stripLabel = label ?? t("strip.defaultLabel");
  const totalRanked = rankForPage(recommendations, kinds).length;

  if (!businessProfileId || isLoading || ranked.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-r from-primary/5 via-background/50 to-muted/20 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {stripLabel}
        </p>
        <Link
          to="/ai-recommendations"
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {t("strip.viewAll")}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <ul className="space-y-1.5">
        {ranked.map((rec) => (
          <li key={rec.id}>
            <Link
              to="/ai-recommendations"
              className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/60 px-2.5 py-2 text-xs hover:border-primary/30 hover:bg-accent/30 transition-colors"
            >
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {t(`kinds.${rec.kind}`)}
              </span>
              <span className="min-w-0 flex-1 leading-snug text-foreground line-clamp-2">{rec.title}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground mt-0.5" />
            </Link>
          </li>
        ))}
      </ul>
      {ranked.length < totalRanked ? (
        <Button asChild variant="ghost" size="sm" className="mt-2 h-7 w-full text-[11px]">
          <Link to="/ai-recommendations">
            {t("strip.moreSuggestions", { count: totalRanked - ranked.length })}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
