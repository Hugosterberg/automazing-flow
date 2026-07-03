import { m } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp } from "@/lib/motion";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { useWorkspaceMode } from "@/features/workspace-mode";
import {
  AutomationPanel,
  AutomatedUpdatesCard,
  AutomationRunStatus,
  AUTOMATION_TOPICS,
  AUTOMATION_TOPIC_ORDER,
  catalogEntriesForTopic,
  useAutomationRuns,
  type AutomationCatalogEntry,
  type AutomationRunsState,
  type AutomationTopic,
} from "@/features/automation";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";

/**
 * Compact "what runs, when, and where the result lands" cards for one topic.
 * Complements the settings cards: schedules mirror `vercel.json` via the
 * automation catalog, and the output link jumps to the page fed by the job.
 */
function ScheduleList({
  entries,
  prefetchFor,
  runs,
}: {
  entries: AutomationCatalogEntry[];
  prefetchFor: (path: string) => void;
  runs: AutomationRunsState;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {entries.map((entry) => (
        <Card key={entry.id} className="border-border bg-card">
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <entry.icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <p className="text-sm font-medium text-foreground min-w-0 truncate">{entry.title}</p>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden />
                {entry.cadence}
              </span>
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
            {entry.cronKey ? (
              <AutomationRunStatus
                run={runs.byKey[entry.cronKey]}
                loading={runs.loading}
                error={runs.error}
              />
            ) : null}
          </CardContent>
        </Card>
      ))}
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

/**
 * /automations — the single home for everything the app does automatically,
 * grouped by topic so each manual chore has one obvious place:
 *
 *   Meddelanden & inbox   → DM auto-reply (settings + audit log)
 *   Rapporter & utskick   → digest / weekly report / marketing alert emails
 *   AI & insikter         → recommendation refresh, marketing snapshots
 *
 * Settings live next to the schedule description, so "what runs, when, and
 * where the result lands" is answered on one page. The same settings cards
 * are reused on the Company page — everything edits the same
 * `automation_settings` row per profile.
 */
export default function AutomationsPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;
  const { mode } = useWorkspaceMode();
  const prefetchFor = useRoutePrefetch();
  const runs = useAutomationRuns(businessProfileId);

  return (
    <m.div {...pageFadeUp} className="space-y-8 max-w-5xl w-full mx-auto">
      <PageHeader
        icon={Zap}
        title="Automationer"
        description="Allt som körs automatiskt åt dig — samlat per ämne, med inställningar och schema på samma ställe."
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
          />
        </m.section>
      ))}
    </m.div>
  );
}
