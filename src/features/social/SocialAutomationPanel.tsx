import { m } from "framer-motion";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { BarChart3, CalendarDays, FileText, Heart, RefreshCw, Sparkles, Target, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useProfileDocument } from "@/features/profile-documents";
import { useScheduledPosts } from "@/features/social/useScheduledPosts";
import type { CalendarEvent } from "@/types/calendar";

const SOCIAL_AUTOMATIONS_STORAGE_KEY = "automazing-social-workflows";
const SOCIAL_WORKFLOWS_DOC_KEY = "social-workflows";
const CALENDAR_STORAGE_KEY = "automazing-calendar-events";

const WORKFLOW_DEFINITIONS = [
  { id: "repurpose-weekly-hero", icon: FileText },
  { id: "caption-hashtag-optimizer", icon: Sparkles },
  { id: "content-gap-filler", icon: CalendarDays },
  { id: "evergreen-repost", icon: RefreshCw },
  { id: "engagement-followup", icon: Heart },
  { id: "weekly-insight-digest", icon: BarChart3 },
] as const;

const PIPELINE_STAGE_IDS = ["research", "production", "distribution", "followup"] as const;

type WorkflowId = (typeof WORKFLOW_DEFINITIONS)[number]["id"];

interface LocalizedWorkflow {
  id: WorkflowId;
  title: string;
  summary: string;
  cadence: string;
  value: string;
  steps: string[];
  icon: LucideIcon;
}

type SocialWorkflowsDoc = {
  enabled: Record<string, boolean>;
  lastPipelineRunAt?: string;
};

const EMPTY_WORKFLOWS: SocialWorkflowsDoc = { enabled: {} };

function localizeWorkflow(id: WorkflowId, icon: LucideIcon, t: TFunction<"social">): LocalizedWorkflow {
  const base = `automation.flows.${id}`;
  const steps = t(`${base}.steps`, { returnObjects: true });
  return {
    id,
    icon,
    title: t(`${base}.title`),
    summary: t(`${base}.summary`),
    cadence: t(`${base}.cadence`),
    value: t(`${base}.value`),
    steps: Array.isArray(steps) ? (steps as string[]) : [],
  };
}

function loadLegacyAutomationState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SOCIAL_AUTOMATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function formatDateForCalendar(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildAutomationEvents(activeWorkflows: LocalizedWorkflow[], t: TFunction<"social">): CalendarEvent[] {
  const now = new Date();
  const timeSlots = ["09:00", "11:00", "14:00", "16:00", "18:00"];
  return activeWorkflows.map((workflow, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() + index + 1);
    return {
      id: crypto.randomUUID(),
      title: t("automation.calendarEventPrefix", { title: workflow.title }),
      date: formatDateForCalendar(date),
      time: timeSlots[index % timeSlots.length],
      isAutomated: true,
      description: workflow.summary,
      createdAt: new Date().toISOString(),
    };
  });
}

export function SocialAutomationPanel() {
  const { t } = useTranslation("social");

  const automationWorkflows = useMemo(
    () => WORKFLOW_DEFINITIONS.map(({ id, icon }) => localizeWorkflow(id, icon, t)),
    [t]
  );

  const pipelineStages = useMemo(
    () =>
      PIPELINE_STAGE_IDS.map((id) => {
        const tasks = t(`automation.pipeline.${id}.tasks`, { returnObjects: true });
        return {
          id,
          title: t(`automation.pipeline.${id}.title`),
          tasks: Array.isArray(tasks) ? (tasks as string[]) : [],
        };
      }),
    [t]
  );

  const workflowsDoc = useProfileDocument<SocialWorkflowsDoc>(SOCIAL_WORKFLOWS_DOC_KEY, EMPTY_WORKFLOWS, {
    legacyRead: () => {
      const legacy = loadLegacyAutomationState();
      return Object.keys(legacy).length > 0 ? { enabled: legacy } : undefined;
    },
    legacyWrite: (_bp, value) => {
      try {
        localStorage.setItem(SOCIAL_AUTOMATIONS_STORAGE_KEY, JSON.stringify(value.enabled));
      } catch {
        /* ignore */
      }
    },
  });

  const { upsert } = useScheduledPosts();

  const enabledAutomations = useMemo(() => {
    const merged = { ...workflowsDoc.data.enabled };
    for (const workflow of automationWorkflows) {
      if (merged[workflow.id] == null) merged[workflow.id] = false;
    }
    return merged;
  }, [automationWorkflows, workflowsDoc.data.enabled]);

  const activeAutomations = automationWorkflows.filter((workflow) => enabledAutomations[workflow.id]);

  function handleToggleAutomation(workflowId: string, checked: boolean) {
    workflowsDoc.save({
      ...workflowsDoc.data,
      enabled: { ...enabledAutomations, [workflowId]: checked },
    });
  }

  function handleCreateAutomationWeekPlan() {
    if (activeAutomations.length === 0) {
      toast({
        title: t("automation.toasts.enableOne"),
        description: t("automation.toasts.enableOneDesc"),
      });
      return;
    }

    try {
      const raw = localStorage.getItem(CALENDAR_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const existingEvents: CalendarEvent[] = Array.isArray(parsed) ? parsed : [];
      const newEvents = buildAutomationEvents(activeAutomations, t);
      localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify([...existingEvents, ...newEvents]));

      const now = new Date();
      activeAutomations.slice(0, 3).forEach((workflow, index) => {
        const scheduled = new Date(now);
        scheduled.setDate(now.getDate() + index + 1);
        scheduled.setHours(10 + index, 0, 0, 0);
        upsert({
          id: crypto.randomUUID(),
          caption: t("automation.draftCaption", { title: workflow.title, summary: workflow.summary }),
          accountIds: [],
          platforms: [],
          status: "draft",
          scheduledFor: scheduled.toISOString(),
          mediaUrls: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      toast({
        title: t("automation.toasts.weekPlanCreated"),
        description: t("automation.toasts.weekPlanCreatedDesc", { count: newEvents.length }),
      });
    } catch {
      toast({
        title: t("automation.toasts.weekPlanFailed"),
        description: t("automation.toasts.weekPlanFailedDesc"),
      });
    }
  }

  return (
    <>
      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="h-5 w-5" />
                  {t("automation.title")}
                </CardTitle>
                <CardDescription>{t("automation.description")}</CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit">
                {t("automation.activeCount", { count: activeAutomations.length })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {automationWorkflows.map((workflow) => {
                const Icon = workflow.icon;
                const isEnabled = Boolean(enabledAutomations[workflow.id]);
                return (
                  <div key={workflow.id} className="rounded-lg border border-border/60 bg-secondary/30 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {workflow.title}
                        </h4>
                        <p className="text-xs text-muted-foreground">{workflow.summary}</p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => handleToggleAutomation(workflow.id, checked)}
                        aria-label={t("automation.enableAria", { title: workflow.title })}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] px-2 py-1 rounded-full bg-accent text-muted-foreground">
                        {workflow.cadence}
                      </span>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-accent text-muted-foreground">
                        {workflow.value}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {workflow.steps.map((step) => (
                        <li key={step} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="mt-0.5">•</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg border border-dashed border-border/80 bg-secondary/20 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("automation.weekPlanTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("automation.weekPlanDesc")}</p>
              </div>
              <Button
                onClick={handleCreateAutomationWeekPlan}
                disabled={activeAutomations.length === 0}
                className="w-full sm:w-auto"
              >
                <CalendarDays className="h-4 w-4 mr-2" />
                {t("automation.weekPlanButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </m.div>

      <m.div {...fadeUp} transition={{ duration: 0.4, delay: 0.45 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" />
              {t("automation.pipelineTitle")}
            </CardTitle>
            <CardDescription>{t("automation.pipelineDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {pipelineStages.map((stage) => (
                <div key={stage.id} className="rounded-lg border border-border/60 bg-secondary/30 p-3">
                  <p className="text-sm font-medium mb-2">{stage.title}</p>
                  <ul className="space-y-1">
                    {stage.tasks.map((task) => (
                      <li key={task} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="mt-0.5">→</span>
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </m.div>
    </>
  );
}
