import { useMemo, useState, useEffect, useRef } from "react";
import { m } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { PageSmartBar } from "@/components/ui/page-smart-bar";
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
  const { accounts } = legacy;
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
  const markedSeenRef = useRef(false);

  useEffect(() => {
    if (markedSeenRef.current || isLoading || !businessProfileId) return;
    const fresh = recommendations.filter((r) => r.status === "new");
    if (fresh.length === 0) return;
    markedSeenRef.current = true;
    void Promise.all(
      fresh.map((r) => transition({ id: r.id, status: "seen" }).catch(() => undefined))
    );
  }, [isLoading, recommendations, businessProfileId, transition]);

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
        title: "Kunde inte acceptera rekommendationen",
        description: err instanceof Error ? err.message : "Okänt fel",
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
        title: "Kunde inte avfärda rekommendationen",
        description: err instanceof Error ? err.message : "Okänt fel",
        variant: "destructive",
      });
    }
  }

  async function handleMarkSeen(id: string) {
    try {
      await transition({ id, status: "seen" });
    } catch (err) {
      toast({
        title: "Kunde inte uppdatera rekommendationen",
        description: err instanceof Error ? err.message : "Okänt fel",
        variant: "destructive",
      });
    }
  }

  async function handleGenerate() {
    try {
      const result = await generate();
      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} nya`);
      if (result.expired > 0) parts.push(`${result.expired} lösta`);
      if (parts.length === 0) parts.push("redan uppdaterat");
      toast({
        title: "Rekommendationer uppdaterade",
        description: parts.join(" · "),
      });
      if (result.errors && result.errors.length > 0) {
        toast({
          title: "Vissa kontroller fick problem",
          description: result.errors.join("; ").slice(0, 240),
          variant: "destructive",
        });
      }
      // Surface LLM-specific status separately so users understand when the
      // content-ideas layer was a no-op (e.g. missing OPENAI_API_KEY in dev)
      // versus when the heuristics themselves were idempotent.
      if (result.llm?.skipped === "provider_error" && result.llm.error) {
        toast({
          title: "Innehållsförslag hoppades över",
          description: result.llm.error.slice(0, 240),
          variant: "destructive",
        });
      } else if (result.llm?.skipped === "no_api_key") {
        toast({
          title: "Innehållsförslag är inte konfigurerade",
          description: "Sätt OPENAI_API_KEY för att aktivera AI-genererade inläggsidéer.",
        });
      } else if (result.llm?.skipped === "cached") {
        toast({
          title: "Använder senaste innehållsförslagen",
          description:
            "Vi återanvände förra omgången AI-idéer för att spara tokens. Försök igen om en minut för nya förslag.",
        });
      }
    } catch (err) {
      toast({
        title: "Kunde inte uppdatera rekommendationerna",
        description: err instanceof Error ? err.message : "Okänt fel",
        variant: "destructive",
      });
    }
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const TAB_VALUES: TabValue[] = ["active", "accepted", "dismissed"];
  const rawTab = searchParams.get("tab");
  const tab: TabValue =
    rawTab && (TAB_VALUES as string[]).includes(rawTab) ? (rawTab as TabValue) : "active";

  function setTab(next: TabValue) {
    const params = new URLSearchParams(searchParams);
    if (next === "active") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

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

  const newRecCount = useMemo(() => active.filter((r) => r.status === "new").length, [active]);

  if (!businessProfileId) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <LightbulbGlowIcon className="h-7 w-7 text-primary" />
          AI-rekommendationer
        </h1>
        <p className="text-sm text-muted-foreground">
          Välj en företagsprofil under Företag för att se AI-rekommendationer.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-2">
          <Link to="/company">Öppna Företag</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl w-full">
      <PageHeader
        icon={<LightbulbGlowIcon className="h-7 w-7 text-primary" />}
        title="AI-rekommendationer"
        description="Datadrivna förslag för den här företagsprofilen."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching || isGenerating}
              className="text-muted-foreground"
              title="Ladda om listan"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">Ladda om</span>
            </Button>
            <Button
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
              title="Kör om heuristikproducenten"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="ml-1.5">Generera</span>
            </Button>
          </>
        }
      />

      <PageSmartBar
        title="AI-rekommendationer analyserar din profil och föreslår nästa steg — innehåll, outreach och underhåll."
        steps={[
          "Klicka Generera för att köra heuristik + AI på kopplingar, uppgifter och innehåll",
          "Acceptera för att navigera till rätt sida, eller avvisa det som inte passar",
          "Granska accepterade och avvisade under flikarna för historik",
        ]}
        tip="Nya förslag markeras automatiskt som sedda när du öppnar sidan."
        liveHintOverride={
          newRecCount > 0
            ? `${newRecCount} ny${newRecCount === 1 ? "" : "a"} rekommendation${newRecCount === 1 ? "" : "er"} att granska`
            : active.length > 0
              ? `${active.length} aktiv${active.length === 1 ? "" : "a"} förslag — acceptera eller avvisa`
              : null
        }
      />

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Kunde inte ladda rekommendationer."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Försök igen
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <m.div {...pageFadeUp} transition={{ duration: 0.25 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS["ai-recommendations"]}
          title="MCP-kontext"
          description="Hämta live-kontext från Era MCP för att berika rekommendationer."
        />
      </m.div>

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }} className="app-workspace-shell">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="flex min-h-0 flex-1 flex-col">
          <div className="app-workspace-toolbar flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
            <TabsList className="h-8 bg-background/50 p-0.5">
              <TabsTrigger value="active" className="h-7 px-2.5 text-xs">
                Aktiva
                <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground">{active.length}</span>
              </TabsTrigger>
              <TabsTrigger value="accepted" className="h-7 px-2.5 text-xs">
                Accepterade
                <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground">{accepted.length}</span>
              </TabsTrigger>
              <TabsTrigger value="dismissed" className="h-7 px-2.5 text-xs">
                Avvisade
                <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground">{dismissed.length}</span>
              </TabsTrigger>
            </TabsList>

            <Select
              value={kindFilter}
              onValueChange={(v) => setKindFilter(v as AiRecommendationKind | "all")}
            >
              <SelectTrigger className="h-8 w-[160px] border-border/60 bg-background/60 text-xs shadow-sm">
                <SelectValue placeholder="Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla typer</SelectItem>
                {AI_REC_KIND_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {AI_REC_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            {(["active", "accepted", "dismissed"] as TabValue[]).map((value) => (
              <TabsContent key={value} value={value} className="mt-0 space-y-3">
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-28 rounded-lg border border-border/50 bg-muted/20 shimmer" />
                    ))}
                  </div>
                ) : visible[value].length === 0 ? (
                  <RecommendationsEmpty
                    tab={value}
                    hasKindFilter={kindFilter !== "all"}
                    onGenerate={value === "active" ? () => void handleGenerate() : undefined}
                    isGenerating={isGenerating}
                    hasConnections={accounts.length > 0}
                    onShowActive={() => setTab("active")}
                  />
                ) : (
                  visible[value].map((rec) => (
                    <AiRecommendationCard
                      key={rec.id}
                      rec={rec}
                      onAccept={value === "active" ? () => void handleAccept(rec) : undefined}
                      onDismiss={value === "active" ? (id) => void handleDismiss(id) : undefined}
                      onMarkSeen={value === "active" ? (id) => void handleMarkSeen(id) : undefined}
                      isBusy={isTransitioning}
                    />
                  ))
                )}
              </TabsContent>
            ))}
          </div>
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
  hasConnections = true,
  onShowActive,
}: {
  tab: TabValue;
  hasKindFilter: boolean;
  onGenerate?: () => void;
  isGenerating?: boolean;
  hasConnections?: boolean;
  onShowActive?: () => void;
}) {
  if (hasKindFilter) {
    return (
      <EmptyState
        size="compact"
        title="Inga träffar"
        description="Inga rekommendationer matchar den valda typen."
      />
    );
  }

  switch (tab) {
    case "active":
      return (
        <EmptyState
          icon={Sparkles}
          title="Inga aktiva rekommendationer"
          description={
            hasConnections
              ? "Klicka Generera för att analysera kopplingar, uppgifter och innehåll efter nya förslag."
              : "Koppla konton under Kopplingar och fyll i Företag — sedan kan Generera ge meningsfulla förslag."
          }
          action={
            hasConnections && onGenerate ? (
              <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" aria-hidden />
                )}
                Generera
              </Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/connections">Öppna Kopplingar</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/company">Öppna Företag</Link>
                </Button>
              </div>
            )
          }
        />
      );
    case "accepted":
      return (
        <EmptyState
          size="compact"
          title="Inget accepterat ännu"
          description="Rekommendationer du accepterar hamnar här så du kan hitta dem senare."
        />
      );
    case "dismissed":
      return (
        <EmptyState
          size="compact"
          title="Inga avvisade rekommendationer"
          description="Det du avvisar sparas här. Gå tillbaka till Aktiva om du vill granska nya förslag."
          action={
            onShowActive ? (
              <Button size="sm" variant="outline" onClick={onShowActive}>
                Visa aktiva
              </Button>
            ) : undefined
          }
        />
      );
  }
}
