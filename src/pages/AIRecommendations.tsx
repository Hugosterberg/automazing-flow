import { useMemo, useState, useEffect, useRef } from "react";
import { m } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { pageFadeUp } from "@/lib/motion";
import { LightbulbGlowIcon } from "@/components/platform-icons";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import {
  useAiRecommendations,
  AiRecommendationCard,
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
  const { t: tPage } = useTranslation("pages");
  const { t } = useTranslation("aiRecommendations");
  const { t: tCommon } = useTranslation("common");
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
        title: t("toasts.acceptFailed"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
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
        title: t("toasts.dismissFailed"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
        variant: "destructive",
      });
    }
  }

  async function handleMarkSeen(id: string) {
    try {
      await transition({ id, status: "seen" });
    } catch (err) {
      toast({
        title: t("toasts.updateFailed"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
        variant: "destructive",
      });
    }
  }

  async function handleGenerate() {
    try {
      const result = await generate();
      const parts: string[] = [];
      if (result.created > 0) parts.push(t("toasts.generateCreated", { count: result.created }));
      if (result.expired > 0) parts.push(t("toasts.generateExpired", { count: result.expired }));
      if (parts.length === 0) parts.push(t("toasts.generateAlreadyUpToDate"));
      toast({
        title: t("toasts.generateUpdated"),
        description: parts.join(" · "),
      });
      if (result.errors && result.errors.length > 0) {
        toast({
          title: t("toasts.checksPartialFailure"),
          description: result.errors.join("; ").slice(0, 240),
          variant: "destructive",
        });
      }
      // Surface LLM-specific status separately so users understand when the
      // content-ideas layer was a no-op (e.g. missing OPENAI_API_KEY in dev)
      // versus when the heuristics themselves were idempotent.
      if (result.llm?.skipped === "provider_error" && result.llm.error) {
        toast({
          title: t("toasts.llmSkippedProvider"),
          description: result.llm.error.slice(0, 240),
          variant: "destructive",
        });
      } else if (result.llm?.skipped === "no_api_key") {
        toast({
          title: t("toasts.llmNotConfiguredTitle"),
          description: t("toasts.llmNotConfiguredDescription"),
        });
      } else if (result.llm?.skipped === "cached") {
        toast({
          title: t("toasts.llmCachedTitle"),
          description: t("toasts.llmCachedDescription"),
        });
      }
    } catch (err) {
      toast({
        title: t("toasts.generateFailed"),
        description: err instanceof Error ? err.message : t("errors.unknown"),
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
          {tPage("aiRecommendations.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("noProfile.description")}</p>
        <Button asChild size="sm" variant="outline" className="mt-2">
          <Link to="/company">{t("actions.openCompany")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl w-full">
      <PageHeader
        icon={<LightbulbGlowIcon className="h-7 w-7 text-primary" />}
        title={tPage("aiRecommendations.title")}
        description={tPage("aiRecommendations.description")}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching || isGenerating}
              className="text-muted-foreground"
              title={t("actions.reloadListTitle")}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">{t("actions.reload")}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
              title={t("actions.generateTitle")}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span className="ml-1.5">{t("actions.generate")}</span>
            </Button>
          </>
        }
      />

      <PageSmartBar
        title={tPage("aiRecommendations.smartBar")}
        steps={[
          tPage("aiRecommendations.step1"),
          tPage("aiRecommendations.step2"),
          tPage("aiRecommendations.step3"),
        ]}
        tip={tPage("aiRecommendations.tip")}
        liveHintOverride={
          newRecCount > 0
            ? tPage("aiRecommendations.liveNew", { count: newRecCount })
            : active.length > 0
              ? tPage("aiRecommendations.liveActive", { count: active.length })
              : null
        }
      />

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : t("errors.loadFailed")}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {tCommon("common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <PageModeTabs
        value={tab}
        aria-label={t("tabs.ariaLabel")}
        onChange={setTab}
        options={[
          { value: "active", label: t("tabs.active"), count: active.length },
          { value: "accepted", label: t("tabs.accepted"), count: accepted.length },
          { value: "dismissed", label: t("tabs.dismissed"), count: dismissed.length },
        ]}
      />

      {tab === "active" ? (
        <details className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {t("mcp.optional")}
          </summary>
          <m.div {...pageFadeUp} transition={{ duration: 0.25 }} className="mt-3">
            <McpFeatureSection
              businessProfileId={businessProfileId}
              featureIds={MCP_PAGE_FEATURE_IDS["ai-recommendations"]}
              title={t("mcp.title")}
              description={t("mcp.description")}
            />
          </m.div>
        </details>
      ) : null}

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }} className="app-workspace-shell">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)} className="flex min-h-0 flex-1 flex-col">
          <div className="app-workspace-toolbar flex flex-wrap items-center justify-end gap-2 px-3 py-2.5 sm:px-4">
            <Select
              value={kindFilter}
              onValueChange={(v) => setKindFilter(v as AiRecommendationKind | "all")}
            >
              <SelectTrigger className="h-8 w-[160px] border-border/60 bg-background/60 text-xs shadow-sm">
                <SelectValue placeholder={t("filter.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filter.allKinds")}</SelectItem>
                {AI_REC_KIND_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`kinds.${k}`)}
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
  const { t } = useTranslation("aiRecommendations");

  if (hasKindFilter) {
    return (
      <EmptyState
        size="compact"
        title={t("empty.noMatchesTitle")}
        description={t("empty.noMatchesDescription")}
      />
    );
  }

  switch (tab) {
    case "active":
      return (
        <EmptyState
          icon={Sparkles}
          title={t("empty.activeTitle")}
          description={
            hasConnections
              ? t("empty.activeWithConnections")
              : t("empty.activeNoConnections")
          }
          action={
            hasConnections && onGenerate ? (
              <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1.5" aria-hidden />
                )}
                {t("actions.generate")}
              </Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/connections">{t("actions.openConnections")}</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/company">{t("actions.openCompany")}</Link>
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
          title={t("empty.acceptedTitle")}
          description={t("empty.acceptedDescription")}
        />
      );
    case "dismissed":
      return (
        <EmptyState
          size="compact"
          title={t("empty.dismissedTitle")}
          description={t("empty.dismissedDescription")}
          action={
            onShowActive ? (
              <Button size="sm" variant="outline" onClick={onShowActive}>
                {t("actions.showActive")}
              </Button>
            ) : undefined
          }
        />
      );
  }
}
