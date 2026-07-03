import { useMemo, useState } from "react";
import { m } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp } from "@/lib/motion";
import { LightbulbGlowIcon } from "@/components/platform-icons";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import {
  useAiRecommendations,
  AiRecommendationCard,
  AI_REC_KIND_LABELS,
  AI_REC_KIND_ORDER,
  resolveNavigateTarget,
  type AiRecommendationKind,
  type AiRecommendationRow,
} from "@/features/ai-recommendations";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";

type TabValue = "active" | "accepted" | "dismissed";

/**
 * /ai-recommendations — tenant-scoped list of AI-generated recommendations.
 * Read-only for users: the AI pipeline (future) is the only writer of `new`
 * rows, and users can only transition status to accepted or dismissed.
 */
export default function AIRecommendationsPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;

  const {
    recommendations,
    isLoading,
    isFetching,
    error,
    refetch,
    transition,
    isTransitioning,
    generate,
    isGenerating,
  } = useAiRecommendations(businessProfileId);
  const { toast } = useToast();
  const navigate = useNavigate();

  /**
   * Accept → mark row as accepted → if the row carries a safe
   * `suggested_action: { type: "navigate", to }` deep-link the user
   * straight into the relevant area. Keeps the loop tight for the most
   * common action ("reconnect", "review tasks", ...).
   */
  async function handleAccept(rec: AiRecommendationRow) {
    try {
      await transition({ id: rec.id, status: "accepted" });
    } catch (err) {
      toast({
        title: "Could not accept recommendation",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      return;
    }
    const target = resolveNavigateTarget(rec.suggested_action);
    if (target) navigate(target);
  }

  async function handleDismiss(id: string) {
    try {
      await transition({ id, status: "dismissed" });
    } catch (err) {
      toast({
        title: "Could not dismiss recommendation",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handleMarkSeen(id: string) {
    try {
      await transition({ id, status: "seen" });
    } catch (err) {
      toast({
        title: "Could not update recommendation",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handleGenerate() {
    try {
      const result = await generate();
      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} new`);
      if (result.expired > 0) parts.push(`${result.expired} resolved`);
      if (parts.length === 0) parts.push("already up to date");
      toast({
        title: "Recommendations refreshed",
        description: parts.join(" · "),
      });
      if (result.errors && result.errors.length > 0) {
        toast({
          title: "Some heuristics had issues",
          description: result.errors.join("; ").slice(0, 240),
          variant: "destructive",
        });
      }
      // Surface LLM-specific status separately so users understand when the
      // content-ideas layer was a no-op (e.g. missing OPENAI_API_KEY in dev)
      // versus when the heuristics themselves were idempotent.
      if (result.llm?.skipped === "provider_error" && result.llm.error) {
        toast({
          title: "Content suggestions skipped",
          description: result.llm.error.slice(0, 240),
          variant: "destructive",
        });
      } else if (result.llm?.skipped === "no_api_key") {
        toast({
          title: "Content suggestions not configured",
          description: "Set OPENAI_API_KEY to enable AI-generated post ideas.",
        });
      } else if (result.llm?.skipped === "cached") {
        toast({
          title: "Using recent content suggestions",
          description:
            "We re-used the last batch of AI ideas to save on tokens. Try again in a minute for a fresh set.",
        });
      }
    } catch (err) {
      toast({
        title: "Could not refresh recommendations",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const [tab, setTab] = useState<TabValue>("active");
  const [kindFilter, setKindFilter] = useState<AiRecommendationKind | "all">(
    "all"
  );

  const { active, accepted, dismissed } = useMemo(() => {
    const a: typeof recommendations = [];
    const ac: typeof recommendations = [];
    const d: typeof recommendations = [];
    for (const r of recommendations) {
      if (r.status === "accepted") ac.push(r);
      else if (r.status === "dismissed") d.push(r);
      else if (r.status === "new" || r.status === "seen") a.push(r);
      // `expired` is filtered out by the service.
    }
    return { active: a, accepted: ac, dismissed: d };
  }, [recommendations]);

  function applyKindFilter(list: typeof recommendations) {
    if (kindFilter === "all") return list;
    return list.filter((r) => r.kind === kindFilter);
  }

  const visible: Record<TabValue, typeof recommendations> = {
    active: applyKindFilter(active),
    accepted: applyKindFilter(accepted),
    dismissed: applyKindFilter(dismissed),
  };

  if (!businessProfileId) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <LightbulbGlowIcon className="h-7 w-7 text-primary" />
          AI Recommendations
        </h1>
        <p className="text-sm text-muted-foreground">
          Select a business profile to see its AI recommendations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl w-full">
      <PageHeader
        icon={<LightbulbGlowIcon className="h-7 w-7 text-primary" />}
        title="AI Recommendations"
        description="Data-driven suggestions for this business profile."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching || isGenerating}
              className="text-muted-foreground"
              title="Reload the list"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Reload</span>
            </Button>
            <Button
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
              title="Re-run the heuristic producer"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="ml-1.5">Generate</span>
            </Button>
          </>
        }
      />

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load recommendations."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <m.div {...pageFadeUp} transition={{ duration: 0.25 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS["ai-recommendations"]}
          title="MCP context"
          description="Pull live context from Era MCP to enrich recommendations."
        />
      </m.div>

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="active">
                Active
                <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {active.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="accepted">
                Accepted
                <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {accepted.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="dismissed">
                Dismissed
                <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {dismissed.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <Select
              value={kindFilter}
              onValueChange={(v) =>
                setKindFilter(v as AiRecommendationKind | "all")
              }
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Filter by kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {AI_REC_KIND_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {AI_REC_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(["active", "accepted", "dismissed"] as TabValue[]).map((value) => (
            <TabsContent key={value} value={value} className="mt-4">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading recommendations…
                </div>
              ) : visible[value].length === 0 ? (
                <RecommendationsEmpty
                  tab={value}
                  hasKindFilter={kindFilter !== "all"}
                  onGenerate={value === "active" ? () => void handleGenerate() : undefined}
                  isGenerating={isGenerating}
                />
              ) : (
                <div className="space-y-3">
                  {visible[value].map((rec) => (
                    <AiRecommendationCard
                      key={rec.id}
                      rec={rec}
                      onAccept={
                        value === "active"
                          ? () => void handleAccept(rec)
                          : undefined
                      }
                      onDismiss={
                        value === "active"
                          ? (id) => void handleDismiss(id)
                          : undefined
                      }
                      onMarkSeen={
                        value === "active"
                          ? (id) => void handleMarkSeen(id)
                          : undefined
                      }
                      isBusy={isTransitioning}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </m.div>
    </div>
  );
}

function RecommendationsEmpty({
  tab,
  hasKindFilter,
  onGenerate,
  isGenerating,
}: {
  tab: TabValue;
  hasKindFilter: boolean;
  onGenerate?: () => void;
  isGenerating?: boolean;
}) {
  if (hasKindFilter) {
    return (
      <EmptyState
        size="compact"
        title="No matches"
        description="No recommendations match the selected kind."
      />
    );
  }

  switch (tab) {
    case "active":
      return (
        <EmptyState
          icon={Sparkles}
          title="No active recommendations"
          description="Run Generate to analyse your connections, tasks, and content for fresh suggestions."
          action={
            onGenerate ? (
              <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" aria-hidden />
                )}
                Generate
              </Button>
            ) : undefined
          }
        />
      );
    case "accepted":
      return (
        <EmptyState
          size="compact"
          title="Nothing accepted yet"
          description="Recommendations you accept will land here so you can look them up later."
        />
      );
    case "dismissed":
      return (
        <EmptyState
          size="compact"
          title="No dismissed recommendations"
        />
      );
  }
}
