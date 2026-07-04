import { m } from "framer-motion";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Clock, RefreshCw, Zap } from "lucide-react";
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
          <Card key={entry.id} className="border-border bg-card">
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

export default function AutomationsPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;
  const { mode } = useWorkspaceMode();
  const prefetchFor = useRoutePrefetch();
  const runs = useAutomationRuns(businessProfileId);
  const [runsRefreshing, setRunsRefreshing] = useState(false);

  async function refreshRuns() {
    setRunsRefreshing(true);
    try {
      await runs.refetch();
    } finally {
      setRunsRefreshing(false);
    }
  }

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
            <span className="ml-1.5 hidden sm:inline">Refresh status</span>
          </Button>
        }
      />

      <m.div {...pageFadeUp} transition={{ delay: 0.02 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.automations}
          title="MCP developer tools"
          description="Documentation search and Era context queries for automation workflows."
        />
      </m.div>

      {AUTOMATION_TOPIC_ORDER.map((topic, index) => (
        <m.section
          key={topic}
          {...pageFadeUp}
          transition={{ delay: 0.04 + index * 0.03 }}
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
    </m.div>
  );
}
