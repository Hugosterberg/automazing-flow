import { m } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageAiSuggestionsStrip } from "@/features/ai-recommendations/PageAiSuggestionsStrip";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Clock, RefreshCw, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp } from "@/lib/motion";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { useWorkspaceMode } from "@/features/workspace-mode";
import { formatScheduleSummarySv } from "@/lib/profileJobSchedule";
import {
  AutomationPanel,
  AutomatedUpdatesCard,
  AutomationRunStatus,
  AutomationScheduleEditor,
  FlowAutomationStatusCard,
  AUTOMATION_TOPICS,
  AUTOMATION_TOPIC_ORDER,
  catalogEntriesForTopic,
  retryAutomation,
  useAutomationRuns,
  useAutomationSchedules,
  type AutomationCatalogEntry,
  type AutomationRunsState,
  type AutomationTopic,
} from "@/features/automation";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";

function AutomationFailuresStrip({
  businessProfileId,
  runs,
  mode,
}: {
  businessProfileId: string | null;
  runs: AutomationRunsState;
  mode: WorkspaceMode;
}) {
  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  const failedEntries = useMemo(() => {
    const out: { cronKey: string; title: string; message?: string | null }[] = [];
    for (const topic of AUTOMATION_TOPIC_ORDER) {
      for (const entry of catalogEntriesForTopic(topic, { includeBusinessOnly: mode === "business" })) {
        if (!entry.cronKey) continue;
        const run = runs.byKey[entry.cronKey];
        if (run?.lastRun?.status === "failed") {
          out.push({
            cronKey: entry.cronKey,
            title: entry.title,
            message: run.lastRun.errorMessage ?? null,
          });
        }
      }
    }
    return out;
  }, [runs.byKey, mode]);

  async function handleRetry(cronKey: string, title: string) {
    if (!businessProfileId || retryingKey) return;
    setRetryingKey(cronKey);
    try {
      await retryAutomation(businessProfileId, cronKey);
      toast.success(`"${title}" kördes om.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte köra om automationen.");
    } finally {
      setRetryingKey(null);
      void runs.refetch();
    }
  }

  if (failedEntries.length === 0) return null;

  return (
    <div
      id="automation-failures"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {failedEntries.length === 1
              ? "1 automation misslyckades vid senaste körning"
              : `${failedEntries.length} automationer misslyckades vid senaste körning`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Kör om direkt här eller scrolla till jobbkortet för mer detalj.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {failedEntries.map((entry) => (
          <li
            key={entry.cronKey}
            className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{entry.title}</p>
              {entry.message ? (
                <p className="text-xs text-muted-foreground truncate">{entry.message}</p>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-8"
              disabled={!businessProfileId || retryingKey === entry.cronKey}
              onClick={() => void handleRetry(entry.cronKey, entry.title)}
            >
              {retryingKey === entry.cronKey ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Kör om
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScheduleList({
  entries,
  prefetchFor,
  runs,
  businessProfileId,
}: {
  entries: AutomationCatalogEntry[];
  prefetchFor: (path: string) => void;
  runs: AutomationRunsState;
  businessProfileId: string | null;
}) {
  const schedules = useAutomationSchedules(businessProfileId);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  async function handleRetry(cronKey: string, title: string) {
    if (!businessProfileId || retryingKey) return;
    setRetryingKey(cronKey);
    try {
      await retryAutomation(businessProfileId, cronKey);
      toast.success(`"${title}" kördes om.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte köra om automationen.");
    } finally {
      setRetryingKey(null);
      void runs.refetch();
    }
  }

  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {entries.map((entry) => {
        const cronKey = entry.cronKey;
        const schedule = cronKey ? schedules.scheduleFor(cronKey) : null;
        return (
          <Card
            key={entry.id}
            id={
              cronKey && runs.byKey[cronKey]?.lastRun?.status === "failed"
                ? `automation-${cronKey}`
                : undefined
            }
            className="border-border bg-card"
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <entry.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <p className="text-sm font-medium text-foreground min-w-0 truncate">{entry.title}</p>
                {schedule ? (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground max-w-[45%] truncate">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">
                      {schedule.enabled ? formatScheduleSummarySv(schedule) : "Av"}
                    </span>
                  </span>
                ) : (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden />
                    {entry.cadence}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{entry.description}</p>
              {entry.outputHref ? (
                <Link
                  to={entry.outputHref}
                  onPointerEnter={() => prefetchFor(entry.outputHref!)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Se resultatet
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              ) : null}
              {cronKey ? (
                <AutomationRunStatus
                  run={runs.byKey[cronKey]}
                  loading={runs.loading}
                  error={runs.error}
                  onRetry={
                    businessProfileId
                      ? () => void handleRetry(cronKey, entry.title)
                      : undefined
                  }
                  retrying={retryingKey === cronKey}
                />
              ) : null}
              {cronKey && businessProfileId ? (
                schedules.loading ? (
                  <p className="text-xs text-muted-foreground">Laddar schema…</p>
                ) : (
                  <AutomationScheduleEditor
                    cronKey={cronKey}
                    schedule={schedules.scheduleFor(cronKey)}
                    disabled={!businessProfileId}
                    saving={schedules.savingKey === cronKey}
                    dirty={schedules.isDirty(cronKey)}
                    onChange={(next) => schedules.patchSchedule(cronKey, next)}
                    onSave={() => void schedules.saveSchedule(cronKey)}
                  />
                )
              ) : !businessProfileId ? (
                <p className="text-xs text-muted-foreground">Välj profil för att ställa in schema.</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TopicHeading({ topic }: { topic: AutomationTopic }) {
  const info = AUTOMATION_TOPICS[topic];
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <info.icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{info.title}</h2>
        <p className="text-xs text-muted-foreground">{info.description}</p>
      </div>
    </div>
  );
}

const AUTOMATION_TAB_LABELS: Record<AutomationTopic, string> = {
  messages: "Meddelanden",
  content: "Innehåll",
  reports: "Rapporter",
  insights: "Insikter",
};

export default function AutomationsPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;
  const { mode } = useWorkspaceMode();
  const prefetchFor = useRoutePrefetch();
  const runs = useAutomationRuns(businessProfileId);
  const [runsRefreshing, setRunsRefreshing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawAutomationTab = searchParams.get("tab");
  const automationTab: AutomationTopic =
    rawAutomationTab && (AUTOMATION_TOPIC_ORDER as string[]).includes(rawAutomationTab)
      ? (rawAutomationTab as AutomationTopic)
      : "messages";

  function setAutomationTab(topic: AutomationTopic) {
    const next = new URLSearchParams(searchParams);
    if (topic === "messages") next.delete("tab");
    else next.set("tab", topic);
    setSearchParams(next, { replace: true });
  }

  const runStats = useMemo(() => {
    const values = Object.values(runs.byKey);
    let ok = 0;
    let failed = 0;
    let never = 0;
    for (const run of values) {
      if (!run.lastRun) never += 1;
      else if (run.lastRun.status === "failed") failed += 1;
      else ok += 1;
    }
    return { ok, failed, never, total: values.length };
  }, [runs.byKey]);

  async function refreshRuns() {
    setRunsRefreshing(true);
    try {
      await runs.refetch();
    } finally {
      setRunsRefreshing(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || isShortcutBlocked()) return;
      if (matchesKey(e, "f") && isPlainLetterShortcut(e) && runStats.failed > 0) {
        e.preventDefault();
        document.getElementById("automation-failures")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runStats.failed]);

  return (
    <m.div {...pageFadeUp} className="space-y-8 max-w-5xl w-full mx-auto">
      <PageHeader
        icon={Zap}
        title="Automationer"
        description="Allt som körs automatiskt åt dig — välj dagar, antal körningar per dag och körningstider för varje automation."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refreshRuns()}
            disabled={runsRefreshing || runs.loading}
            className="text-muted-foreground"
          >
            {runsRefreshing || runs.loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Uppdatera status</span>
          </Button>
        }
      />

      <PageSmartBar
        title="Automationer sköter det repetitiva — snapshots, påminnelser och synk — så du slipper manuellt underhåll."
        steps={[
          "Se status för varje jobb — senaste körning och nästa schemalagda tid",
          "Justera schema (dagar, tider) efter hur din verksamhet jobbar",
          "Följ länken ”Se resultatet” för att se vad jobbet faktiskt gjorde",
        ]}
        tip={
          runStats.failed > 0
            ? "Misslyckade körningar kan oftast köras om direkt från jobbkortet."
            : "Här körs digests, snapshots, AI-jobb och synk på schema — så du slipper manuellt underhåll."
        }
        liveHintOverride={
          runStats.failed > 0
            ? `${runStats.failed} jobb misslyckades vid senaste körning — kör om från listan eller jobbkortet.`
            : runStats.never > 0 && runStats.ok === 0 && runStats.failed === 0
              ? `${runStats.never} jobb har ännu ingen körningshistorik — kontrollera att schemat är aktiverat.`
              : null
        }
        extraActions={
          runStats.failed > 0
            ? [{ label: `${runStats.failed} misslyckade — granska`, to: "/automations#automation-failures" }]
            : []
        }
      />

      <PageAiSuggestionsStrip
        businessProfileId={businessProfileId}
        kinds={["maintenance"]}
        label="AI underhållsförslag"
      />

      <div className="app-workspace-stats grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Jobb</p>
          <p className="text-xs font-semibold tabular-nums">{runStats.total}</p>
        </div>
        <div className="rounded-lg border border-success/30 bg-success/5 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Senaste OK</p>
          <p className="text-xs font-semibold tabular-nums text-success">{runStats.ok}</p>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Senaste fel</p>
          <p className="text-xs font-semibold tabular-nums text-destructive">{runStats.failed}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Aldrig körda</p>
          <p className="text-xs font-semibold tabular-nums">{runStats.never}</p>
        </div>
      </div>

      <div className="app-workspace-shell !min-h-0 space-y-6 p-3 sm:p-4">
      <AutomationFailuresStrip businessProfileId={businessProfileId} runs={runs} mode={mode} />

      {businessProfileId ? (
        <m.div {...pageFadeUp} transition={{ delay: 0.015 }}>
          <FlowAutomationStatusCard businessProfileId={businessProfileId} />
        </m.div>
      ) : null}

      {automationTab === "insights" ? (
      <m.div {...pageFadeUp} transition={{ delay: 0.02 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.automations}
          title="MCP-utvecklarverktyg"
          description="Dokumentationssökning och Era-kontextfrågor för automatiseringsflöden."
        />
      </m.div>
      ) : null}

      <PageModeTabs
        value={automationTab}
        aria-label="Automationsflikar"
        onChange={setAutomationTab}
        options={AUTOMATION_TOPIC_ORDER.map((topic) => ({
          value: topic,
          label: AUTOMATION_TAB_LABELS[topic],
          count: catalogEntriesForTopic(topic, { includeBusinessOnly: mode === "business" }).length,
        }))}
      />

      {AUTOMATION_TOPIC_ORDER.filter((topic) => topic === automationTab).map((topic) => (
        <m.section
          key={topic}
          {...pageFadeUp}
          transition={{ delay: 0.04 }}
          aria-label={AUTOMATION_TOPICS[topic].title}
          className="space-y-4"
        >
          <TopicHeading topic={topic} />

          {topic === "messages" ? (
            businessProfileId ? (
              <AutomationPanel businessProfileId={businessProfileId} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Välj en aktiv profil för att hantera auto-svar.
              </p>
            )
          ) : null}

          {topic === "reports" ? (
            <AutomatedUpdatesCard businessProfileId={businessProfileId} />
          ) : null}

          <ScheduleList
            entries={catalogEntriesForTopic(topic, {
              includeBusinessOnly: mode === "business",
            })}
            prefetchFor={prefetchFor}
            runs={runs}
            businessProfileId={businessProfileId}
          />
        </m.section>
      ))}
      </div>
    </m.div>
  );
}
