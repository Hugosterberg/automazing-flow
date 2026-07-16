import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { m } from "framer-motion";
import {
  ChevronRight,
  CircleDot,
  Clock,
  Loader2,
  Plus,
  Target,
  Trash2,
  Trophy,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { PageModeTabs } from "@/components/ui/page-mode-tabs";
import { PageAiSuggestionsStrip } from "@/features/ai-recommendations/PageAiSuggestionsStrip";
import { AutomationEnableHint } from "@/features/automation";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles, CompanyProfileNudge } from "@/features/business-profiles";
import { LeadsSection, LeadSuggestionsSection, LeadFollowUpsWorkspace, useLeads, buildLeadSuggestionContext, isLeadOpen, isFollowUpOverdue, isFollowUpDueToday, type Lead } from "@/features/leads";
import { fetchProducts } from "@/lib/productsApi";
import { BrandDiscoverySection } from "@/features/brand-discovery";
import { SalesPlaybookSection } from "@/features/sales-playbook";
import { SalesActionHub } from "@/features/sales/SalesActionHub";
import { useMarketingCampaigns } from "@/features/marketing";
import { formatMoney } from "@/features/marketing/format";
import { OutreachContentCard, OutreachDraftDialog, OutreachQueueSection, OutreachQueueWorkspace, pendingOutreachItems, type OutreachDraftTarget } from "@/features/outreach";
import { OUTREACH_QUEUE_DOC_KEY, type OutreachQueueItem } from "@/features/outreach/outreachQueueTypes";
import { useProfileDocument } from "@/features/profile-documents";
import { isShortcutBlocked, isTypingTarget } from "@/lib/keyboardShortcuts";
import { dateInputToEndOfDayIso, isoToLocalDateInputValue } from "@/lib/localDate";
import { McpFeatureSection, MCP_PAGE_FEATURE_IDS } from "@/features/intelligence";
import { useTasks, TaskEditDialog } from "@/features/tasks";
import type { TaskRow, TaskStatus } from "@/features/tasks/tasksService";
import { pageFadeUp } from "@/lib/motion";
import { stashContentCaption } from "@/lib/contentCaptionHandoff";
import { cn } from "@/lib/utils";
import { formatNumber, formatShortDate } from "@/lib/format";
import { useStackedWorkspace } from "@/hooks/use-mobile";

import type { TFunction } from "i18next";

// Pipeline stages - mapped to task statuses (labels resolved via i18n in render)
const PIPELINE_STAGE_META: { status: TaskStatus; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { status: "open", icon: CircleDot, color: "text-muted-foreground" },
  { status: "in_progress", icon: ChevronRight, color: "text-blue-500" },
  { status: "blocked", icon: Clock, color: "text-yellow-500" },
  { status: "done", icon: Trophy, color: "text-green-500" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

type GoalItem = { id: string; title: string; current: number; target: number; unit: string };

const DEFAULT_GOAL_SPECS = [
  { id: "g1", current: 0, target: 10 },
  { id: "g2", current: 0, target: 100000 },
  { id: "g3", current: 0, target: 80 },
] as const;

function buildDefaultGoals(t: TFunction<"sales">): GoalItem[] {
  return DEFAULT_GOAL_SPECS.map((spec) => ({
    ...spec,
    title: t(`goals.defaults.${spec.id}.title`),
    unit: t(`goals.defaults.${spec.id}.unit`),
  }));
}

function normalizeGoal(goal: GoalItem, defaults: GoalItem[]): GoalItem {
  const defaultGoal = defaults.find((item) => item.id === goal.id);
  if (!defaultGoal) return goal;
  return { ...goal, title: defaultGoal.title, unit: defaultGoal.unit };
}

function goalLabel(goal: GoalItem, t: TFunction<"sales">): { title: string; unit: string } {
  const known = DEFAULT_GOAL_SPECS.some((spec) => spec.id === goal.id);
  if (!known) return { title: goal.title, unit: goal.unit };
  return {
    title: t(`goals.defaults.${goal.id}.title`),
    unit: t(`goals.defaults.${goal.id}.unit`),
  };
}

function PipelineCard({ task, onMove, onDelete, onEdit, isDeleting }: {
  task: TaskRow;
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: TaskRow) => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation("sales");
  const nextStageMap: Partial<Record<TaskStatus, TaskStatus>> = {
    open: "in_progress",
    in_progress: "blocked",
    blocked: "done",
  };
  const next = nextStageMap[task.status];

  return (
    <div className="group rounded-lg border border-border bg-card px-3 py-2.5 space-y-2 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug flex-1">{task.title}</p>
        <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="text-muted-foreground hover:text-foreground transition-opacity shrink-0 p-1"
              aria-label={t("pipeline.editDealAria")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-1"
            aria-label={t("pipeline.deleteAria")}
          >
            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5", PRIORITY_COLORS[task.priority])}>
          {t(`pipeline.priority.${task.priority}`)}
        </Badge>
        {next && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
            onClick={() => onMove(task.id, next)}
          >
            {t("pipeline.moveForward")}
          </Button>
        )}
      </div>
      {task.due_at && (
        <p className="text-[11px] text-muted-foreground">
          {t("pipeline.deadline", { date: formatShortDate(task.due_at) })}
        </p>
      )}
    </div>
  );
}

function GoalCard({ goal, onUpdate }: {
  goal: GoalItem;
  onUpdate: (id: string, current: number, target: number) => void;
}) {
  const { t } = useTranslation("sales");
  const { t: tc } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(String(goal.current));
  const [target, setTarget] = useState(String(goal.target));
  const { title, unit } = goalLabel(goal, t);
  // Guard against target 0 from legacy/stored docs — otherwise NaN%.
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;

  function save() {
    const c = Number(current);
    const t = Number(target);
    if (!isNaN(c) && !isNaN(t) && t > 0) {
      onUpdate(goal.id, c, t);
    }
    setEditing(false);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={() => { setCurrent(String(goal.current)); setTarget(String(goal.target)); setEditing(true); }}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {t("goals.edit")}
        </button>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatNumber(goal.current)} {unit}</span>
        <span className={cn("font-medium", pct >= 100 ? "text-green-600" : "text-foreground")}>
          {t("goals.percentOf", { pct, target: formatNumber(goal.target) })}
        </span>
      </div>

      {editing && (
        <div className="flex gap-2 pt-1">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">{t("goals.current")}</Label>
            <Input value={current} onChange={(e) => setCurrent(e.target.value)} className="h-7 text-xs" type="number" />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">{t("goals.target")}</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} className="h-7 text-xs" type="number" />
          </div>
          <div className="flex items-end gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={save}>{tc("common.save")}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>{tc("common.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesMarketingPage() {
  const { t: tPage } = useTranslation("pages");
  const { t } = useTranslation("sales");
  const { t: tOutreach } = useTranslation("outreach");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const activeBp = useActiveBusinessProfileIdOptional();
  const { activeProfileId } = useAccounts();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const showFollowUpsOnly = searchParams.get("view") === "followups";
  const showOutreachQueue = searchParams.get("view") === "outreach-queue";
  const isStackedWorkspace = useStackedWorkspace();
  const focusedFilterChrome =
    isStackedWorkspace && (showFollowUpsOnly || showOutreachQueue);

  type SalesTab = "overview" | "leads" | "outreach" | "pipeline" | "discover" | "goals";
  const SALES_TAB_VALUES: SalesTab[] = ["leads", "outreach", "pipeline", "overview", "discover", "goals"];
  const rawSalesTab = searchParams.get("tab");
  const salesTab: SalesTab =
    rawSalesTab && (SALES_TAB_VALUES as string[]).includes(rawSalesTab)
      ? (rawSalesTab as SalesTab)
      : "leads";

  function clearViewFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    setSearchParams(next, { replace: true });
  }

  const setSalesTab = useCallback(
    (tab: SalesTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("view");
          if (tab === "leads") next.delete("tab");
          else next.set("tab", tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const showSalesChrome = !showFollowUpsOnly && !showOutreachQueue && !focusedFilterChrome;
  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((p) => p.id === businessProfileId);
  const [productNames, setProductNames] = useState<string[]>([]);

  // KPIs are driven by the real leads pipeline (not pipeline-tagged tasks).
  const { leads, createLead, updateLead } = useLeads(businessProfileId);

  const leadSuggestionInput = useMemo(
    () =>
      buildLeadSuggestionContext({
        businessProfileId,
        profile: activeProfile,
        leads,
        productNames,
      }),
    [activeProfile, businessProfileId, leads, productNames]
  );

  useEffect(() => {
    if (!businessProfileId) {
      setProductNames([]);
      return;
    }
    let cancelled = false;
    void fetchProducts(businessProfileId)
      .then((products) => {
        if (cancelled) return;
        setProductNames(products.map((p) => p.name).filter(Boolean).slice(0, 12));
      })
      .catch(() => {
        if (!cancelled) setProductNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [businessProfileId]);

  const marketingContext = {
    businessName: activeProfile?.name,
    company: activeProfile?.company,
    website: activeProfile?.website,
    email: activeProfile?.email,
    location: activeProfile?.location,
    notes: activeProfile?.notes,
  };

  function handoffContentIdea(text: string) {
    stashContentCaption(text);
    navigate("/content?tab=publish");
    toast.success(t("toasts.contentIdeaReady"));
  }

  const { tasks, isLoading, createTask, updateTask, deleteTask, isDeleting, isUpdating } = useTasks(businessProfileId);

  // Pipeline tasks = module starts with "pipeline"
  const pipelineTasks = useMemo(
    () => tasks.filter((t) => t.module === "pipeline" && t.status !== "archived"),
    [tasks]
  );

  // Goals persist per business profile in the DB (synced across devices), with
  // a one-time migration from the legacy per-profile localStorage key.
  const legacyGoalsKey = `automazing-goals-${businessProfileId ?? "default"}`;
  const defaultGoals = useMemo(() => buildDefaultGoals(t), [t]);
  const goalsDoc = useProfileDocument<GoalItem[]>("goals", defaultGoals.map((g) => ({ ...g })), {
    legacyRead: () => {
      try {
        const stored = localStorage.getItem(legacyGoalsKey);
        return stored ? (JSON.parse(stored) as GoalItem[]).map((goal) => normalizeGoal(goal, defaultGoals)) : undefined;
      } catch {
        return undefined;
      }
    },
    legacyWrite: (_bpId, value) => {
      try {
        localStorage.setItem(legacyGoalsKey, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
  });
  const goals = goalsDoc.data;

  function updateGoal(id: string, current: number, target: number) {
    goalsDoc.save(goals.map((g) => (g.id === id ? { ...g, current, target } : g)));
  }

  // Add pipeline lead dialog
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineTitle, setPipelineTitle] = useState("");
  const [pipelineDesc, setPipelineDesc] = useState("");
  const [pipelinePriority, setPipelinePriority] = useState<"low" | "medium" | "high">("medium");
  const [pipelineDue, setPipelineDue] = useState("");
  const [pipelineAdding, setPipelineAdding] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [outreachDraftOpen, setOutreachDraftOpen] = useState(false);
  const [outreachDraftTarget, setOutreachDraftTarget] = useState<OutreachDraftTarget | null>(null);
  const [draftLeadId, setDraftLeadId] = useState<string | null>(null);
  const { performance, connected: marketingConnected } = useMarketingCampaigns();

  const openAddLeadRef = useRef<(() => void) | null>(null);
  const registerAddLeadOpener = useCallback((open: () => void) => {
    openAddLeadRef.current = open;
  }, []);

  const openAddLeadDialog = useCallback(() => {
    setSalesTab("leads");
    window.setTimeout(() => {
      document.getElementById("leads-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      openAddLeadRef.current?.();
    }, 120);
  }, [setSalesTab]);

  // Deep link: /sales?new=lead | ?new=deal opens CRM dialogs.
  useEffect(() => {
    const action = searchParams.get("new");
    if (action !== "lead" && action !== "deal") return;
    if (action === "lead") {
      openAddLeadDialog();
    } else {
      setSalesTab("pipeline");
      setPipelineOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, openAddLeadDialog, setSalesTab]);

  async function addLead() {
    if (!pipelineTitle.trim()) return;
    setPipelineAdding(true);
    try {
      await createTask({
        title: pipelineTitle.trim(),
        description: pipelineDesc.trim() || null,
        priority: pipelinePriority,
        status: "open",
        module: "pipeline",
        // End of the chosen day in local time — a bare date string would be
        // parsed as UTC midnight and flag the lead overdue all day.
        dueAt: pipelineDue ? dateInputToEndOfDayIso(pipelineDue) : null,
      });
      setPipelineOpen(false);
      setPipelineTitle("");
      setPipelineDesc("");
      setPipelineDue("");
    } finally {
      setPipelineAdding(false);
    }
  }

  function openPipelineFromLead(lead: Lead) {
    setSalesTab("pipeline");
    setPipelineTitle(lead.company);
    const contact = [lead.contactName, lead.email, lead.phone].filter(Boolean).join(" · ");
    const desc = [contact, lead.notes?.trim()].filter(Boolean).join("\n");
    setPipelineDesc(desc);
    setPipelinePriority("medium");
    setPipelineDue(lead.nextFollowUpAt ? isoToLocalDateInputValue(lead.nextFollowUpAt) : "");
    setPipelineOpen(true);
  }

  async function moveTask(id: string, status: TaskStatus) {
    await updateTask({ id, patch: { status } });
  }

  // Add pipeline lead dialog
  const activeLeads = leads.filter((l) => isLeadOpen(l.status)).length;

  const dueLeadsList = useMemo(() => {
    const nowMs = Date.now();
    return leads.filter(
      (l) =>
        isLeadOpen(l.status) &&
        (isFollowUpOverdue(l.nextFollowUpAt, nowMs) || isFollowUpDueToday(l.nextFollowUpAt, nowMs))
    );
  }, [leads]);

  const outreachDoc = useProfileDocument<OutreachQueueItem[]>(OUTREACH_QUEUE_DOC_KEY, []);
  const pendingOutreachCount = useMemo(
    () => pendingOutreachItems(outreachDoc.data).length,
    [outreachDoc.data]
  );

  const salesLiveHint =
    dueLeadsList.length > 0
      ? tPage("sales.liveFollowups", { count: dueLeadsList.length })
      : pendingOutreachCount > 0
        ? tPage("sales.liveOutreach", { count: pendingOutreachCount })
        : null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked() || isTypingTarget(e.target)) return;
      if (e.key === "/" && !e.shiftKey) {
        e.preventDefault();
        if (showOutreachQueue) {
          document.querySelector<HTMLInputElement>(`[aria-label="${tOutreach("queue.searchAria")}"]`)?.focus();
        } else if (showFollowUpsOnly) {
          document.getElementById("sales-followups-search")?.focus();
        } else {
          document.getElementById("sales-leads-search")?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFollowUpsOnly, showOutreachQueue]);

  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (!leadId || searchParams.get("view")) return;
    setSalesTab("leads");
    window.setTimeout(() => {
      document.getElementById("leads-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, [searchParams, setSalesTab]);

  function leadToOutreachTarget(lead: Lead): OutreachDraftTarget {
    return {
      prospectCompany: lead.company,
      prospectContact: lead.contactName || undefined,
      prospectEmail: lead.email || undefined,
      prospectWebsite: lead.website || undefined,
      prospectNotes: lead.notes || undefined,
    };
  }

  function openOutreachForLead(lead: Lead) {
    setDraftLeadId(lead.id);
    setOutreachDraftTarget(leadToOutreachTarget(lead));
    setOutreachDraftOpen(true);
  }

  function startDueLeadDrafts() {
    const lead = dueLeadsList[0];
    if (!lead) return;
    openOutreachForLead(lead);
  }

  async function markLeadContactedAndContinue() {
    if (draftLeadId) {
      try {
        await updateLead({ id: draftLeadId, patch: { status: "contacted" } });
      } catch {
        toast.error(t("toasts.leadStatusError"));
      }
    }
    const idx = draftLeadId ? dueLeadsList.findIndex((l) => l.id === draftLeadId) : -1;
    const next = idx >= 0 ? dueLeadsList[idx + 1] : null;
    if (next) {
      openOutreachForLead(next);
      toast.message(t("toasts.nextLead", { company: next.company }));
    } else {
      setOutreachDraftOpen(false);
      setDraftLeadId(null);
      setOutreachDraftTarget(null);
    }
  }

  function syncGoalsFromShopify() {
    if (!performance?.revenue && !performance?.orders) {
      toast.message(t("toasts.shopifyConnect"));
      return;
    }
    goalsDoc.save(
      goals.map((g) => {
        if (g.id === "g2" && performance.revenue != null) {
          return { ...g, current: Math.round(performance.revenue) };
        }
        if (g.id === "g1" && performance.orders != null) {
          return { ...g, current: performance.orders };
        }
        return g;
      })
    );
    toast.success(t("toasts.goalsSynced"));
  }

  const pipelineStages = useMemo(
    () =>
      PIPELINE_STAGE_META.map((stage) => ({
        ...stage,
        label: t(`pipeline.stages.${stage.status}`),
      })),
    [t]
  );

  const shopifyRevenueLabel =
    performance?.revenue != null
      ? formatMoney(performance.revenue, performance.revenueCurrency)
      : null;

  return (
    <div className={cn("max-w-6xl", focusedFilterChrome ? "space-y-0" : "space-y-8")}>
      {focusedFilterChrome ? (
        <div className="sticky top-0 z-20 -mx-1 mb-2 flex items-center gap-2 border-b border-border/60 bg-background/95 px-1 py-2 backdrop-blur-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-sm"
            onClick={clearViewFilter}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("filters.backToSales")}
          </Button>
        </div>
      ) : (
        <>
          <PageHeader
            icon={Target}
            title={tPage("sales.title")}
            description={tPage("sales.description")}
          />

          <PageSmartBar
            title={tPage("sales.smartBar")}
            steps={[tPage("sales.step1"), tPage("sales.step2"), tPage("sales.step3")]}
            tip={tPage("sales.tip")}
            liveHintOverride={salesLiveHint}
            extraActions={
              dueLeadsList.length > 0
                ? [{ label: tPage("sales.actionFollowups"), to: "/sales?view=followups" }]
                : pendingOutreachCount > 0
                  ? [{ label: tPage("sales.actionOutreach"), to: "/sales?view=outreach-queue" }]
                  : []
            }
          />

          <PageModeTabs
            value={salesTab}
            aria-label={tPage("sales.tabsAria")}
            onChange={setSalesTab}
            options={[
              { value: "leads", label: tPage("sales.tabLeads"), count: activeLeads },
              { value: "outreach", label: tPage("sales.tabOutreach"), count: pendingOutreachCount },
              { value: "pipeline", label: tPage("sales.tabPipeline"), count: pipelineTasks.length },
              { value: "overview", label: tPage("sales.tabOverview") },
              { value: "discover", label: tPage("sales.tabDiscover") },
              { value: "goals", label: tPage("sales.tabGoals") },
            ]}
          />

          {salesTab === "overview" ? (
            <>
              <PageAiSuggestionsStrip
                businessProfileId={businessProfileId}
                kinds={["outreach", "insight"]}
                label={t("overview.aiSuggestionsLabel")}
              />
              <CompanyProfileNudge profile={activeProfile} />
            </>
          ) : null}
        </>
      )}

      <div className={cn("app-workspace-shell !min-h-0 space-y-4 p-3 sm:p-4", focusedFilterChrome && "rounded-none border-0 p-0 shadow-none sm:p-0")}>
      {showSalesChrome && salesTab === "overview" ? (
        <m.div {...pageFadeUp} transition={{ delay: 0.035 }}>
          <SalesActionHub
            followUpCount={dueLeadsList.length}
            activeLeads={activeLeads}
            pipelineCount={pipelineTasks.length}
            shopifyConnected={marketingConnected.shopify}
            shopifyOrders={performance?.orders ?? null}
            shopifyRevenueLabel={shopifyRevenueLabel}
            onFollowUps={() => navigate("/sales?view=followups")}
            onAddLead={openAddLeadDialog}
            onAddDeal={() => {
              setSalesTab("pipeline");
              setPipelineOpen(true);
            }}
            onDraftDueLeads={startDueLeadDrafts}
            onDiscover={() => setSalesTab("discover")}
            onSuggestLeads={() => setSalesTab("leads")}
            onOpenContent={() => {
              stashContentCaption("");
              navigate("/content?tab=create");
            }}
            onSyncGoals={() => {
              setSalesTab("goals");
              syncGoalsFromShopify();
            }}
          />
        </m.div>
      ) : null}

      {showOutreachQueue ? (
        <m.div {...pageFadeUp} transition={{ delay: 0.037 }}>
          {!focusedFilterChrome ? (
            <Card className="border-info/30 bg-info/5 mb-3">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 px-4">
                <p className="text-sm">{t("filters.outreachQueueBanner")}</p>
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearViewFilter}>
                  <X className="h-3.5 w-3.5 mr-1" aria-hidden />
                  {t("filters.showFullSales")}
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <div className={cn(!focusedFilterChrome && "app-workspace-shell")}>
            <OutreachQueueWorkspace businessProfileId={businessProfileId} />
          </div>
        </m.div>
      ) : null}

      {showSalesChrome && salesTab === "outreach" ? (
        <m.div {...pageFadeUp} transition={{ delay: 0.037 }} className="space-y-4">
          <OutreachQueueSection businessProfileId={businessProfileId} />
          <OutreachContentCard
            businessProfileId={businessProfileId}
            context={{
              ...marketingContext,
              description: marketingContext.notes,
              targetAudience: activeProfile?.location ? t("discover.targetAudience", { location: activeProfile.location }) : undefined,
              idealCustomer: leadSuggestionInput.description,
            }}
            onUseIdea={handoffContentIdea}
          />
        </m.div>
      ) : null}

      {/* Leads — register + follow up, with AI outreach suggestions */}
      {showFollowUpsOnly ? (
        <m.div {...pageFadeUp} transition={{ delay: 0.038 }}>
          {!focusedFilterChrome ? (
            <Card className="border-warning/30 bg-warning/5 mb-3">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 px-4">
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden />
                  <span>{t("filters.followupsBanner")}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearViewFilter}>
                  <X className="h-3.5 w-3.5 mr-1" aria-hidden />
                  {t("filters.showFullSales")}
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <div className={cn(!focusedFilterChrome && "app-workspace-shell")}>
            <LeadFollowUpsWorkspace
              businessProfileId={businessProfileId}
              onDraftOutreach={(target, leadId) => {
                setDraftLeadId(leadId);
                setOutreachDraftTarget(target);
                setOutreachDraftOpen(true);
              }}
              onAddToPipeline={openPipelineFromLead}
            />
          </div>
        </m.div>
      ) : null}
      {showSalesChrome && salesTab === "leads" ? (
        <>
          {dueLeadsList.length > 0 ? (
            <AutomationEnableHint
              compact
              tab="reports"
              focus="lead-reminder"
              title={t("automations.leadReminderTitle")}
              description={t("automations.leadReminderDescription", { count: dueLeadsList.length })}
              ctaLabel={t("automations.leadReminderCta")}
            />
          ) : null}
          <m.div {...pageFadeUp} transition={{ delay: 0.039 }}>
            <LeadSuggestionsSection
              businessProfileId={businessProfileId}
              profile={activeProfile}
              suggestionInput={leadSuggestionInput}
              onCreateLead={createLead}
            />
          </m.div>
          <m.div {...pageFadeUp} transition={{ delay: 0.04 }} id="leads-section">
            <LeadsSection
              businessProfileId={businessProfileId}
              context={leadSuggestionInput}
              hideSuggestionPanel
              sellerContext={marketingContext}
              onRegisterAddOpener={registerAddLeadOpener}
              onAddToPipeline={openPipelineFromLead}
              onDraftOutreach={(target) => {
                setOutreachDraftTarget(target);
                setDraftLeadId(null);
                setOutreachDraftOpen(true);
              }}
              onDraftDueLeads={startDueLeadDrafts}
            />
          </m.div>
        </>
      ) : null}

      {showSalesChrome && salesTab === "discover" ? (
        <>
      <m.div {...pageFadeUp} transition={{ delay: 0.042 }} id="brand-discovery">
        <BrandDiscoverySection
          businessProfileId={businessProfileId}
          {...marketingContext}
          onAddAsLead={async (item) => {
            try {
              await createLead({
                company: item.label,
                email: item.kind === "email" ? item.value : null,
                website: item.kind === "website" ? item.value : null,
                notes: item.reason || null,
                source: "outreach-discovery",
                status: "new",
              });
              toast.success(t("toasts.addedAsLead"));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t("toasts.addLeadError"));
            }
          }}
          onDraftOutreach={(item) => {
            setOutreachDraftTarget({
              prospectCompany: item.label,
              prospectEmail: item.kind === "email" ? item.value : undefined,
              prospectWebsite: item.kind === "website" ? item.value : undefined,
              prospectReason: item.reason,
            });
            setOutreachDraftOpen(true);
          }}
        />
      </m.div>

      <m.div {...pageFadeUp} transition={{ delay: 0.043 }}>
        <SalesPlaybookSection
          businessProfileId={businessProfileId}
          {...marketingContext}
          onUseForOutreach={(item) => {
            setDraftLeadId(null);
            setOutreachDraftTarget({
              prospectNotes: [item.title, item.body, item.detail].filter(Boolean).join("\n\n"),
            });
            setOutreachDraftOpen(true);
          }}
          onUseForCampaign={(item) => {
            stashContentCaption([item.title, item.body].filter(Boolean).join(" — "));
            navigate("/marketing?new=campaign");
            toast.success(t("toasts.campaignIdeaSaved"));
          }}
          onUseForContent={(item) => {
            handoffContentIdea([item.title, item.body].filter(Boolean).join("\n\n"));
          }}
          onOpenEcommerce={() => navigate("/ecommerce")}
        />
      </m.div>
        </>
      ) : null}

      <OutreachDraftDialog
        open={outreachDraftOpen}
        onOpenChange={(open) => {
          setOutreachDraftOpen(open);
          if (!open) {
            setDraftLeadId(null);
            setOutreachDraftTarget(null);
          }
        }}
        businessProfileId={businessProfileId}
        sellerContext={marketingContext}
        target={outreachDraftTarget}
        onMarkContacted={draftLeadId ? () => void markLeadContactedAndContinue() : undefined}
      />

      {showSalesChrome && salesTab === "discover" ? (
      <m.div {...pageFadeUp} transition={{ delay: 0.045 }}>
        <McpFeatureSection
          businessProfileId={businessProfileId}
          featureIds={MCP_PAGE_FEATURE_IDS.sales}
          title={t("discover.mcpTitle")}
          description={t("discover.mcpDescription")}
        />
      </m.div>
      ) : null}

      {showSalesChrome && salesTab === "pipeline" ? (
      <m.section {...pageFadeUp} transition={{ delay: 0.05 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">{t("pipeline.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("pipeline.description")}</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setPipelineOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("pipeline.newDeal")}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1 h-40 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pipelineStages.map((stage) => {
              const stageTasks = pipelineTasks.filter((task) => task.status === stage.status);
              return (
                <div key={stage.status} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <stage.icon className={cn("h-3.5 w-3.5", stage.color)} />
                    <span className="text-xs font-medium text-muted-foreground">{stage.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{stageTasks.length}</span>
                  </div>
                  <div className="min-h-[120px] rounded-xl border border-border/60 bg-muted/20 p-2 space-y-2">
                    {stageTasks.map((task) => (
                      <PipelineCard
                        key={task.id}
                        task={task}
                        onMove={moveTask}
                        onDelete={(id) => void deleteTask(id)}
                        onEdit={(t) => {
                          setEditTask(t);
                          setEditOpen(true);
                        }}
                        isDeleting={isDeleting}
                      />
                    ))}
                    {stageTasks.length === 0 && (
                      <div className="text-center pt-4 space-y-2 px-1">
                        <p className="text-[11px] text-muted-foreground/60">{t("pipeline.empty")}</p>
                        <div className="flex flex-col gap-1">
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setPipelineOpen(true)}>
                            {t("pipeline.addDeal")}
                          </Button>
                          {stage.status === "open" && activeLeads > 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px]"
                              onClick={() => setSalesTab("leads")}
                            >
                              {t("pipeline.fromLeads")}
                            </Button>
                          ) : stage.status === "open" ? (
                            <Button asChild type="button" size="sm" variant="ghost" className="h-7 text-[11px]">
                              <Link to="/company">{t("pipeline.fillCompanyProfile")}</Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </m.section>
      ) : null}

      {showSalesChrome && salesTab === "goals" ? (
      <m.section {...pageFadeUp} transition={{ delay: 0.15 }}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t("goals.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("goals.description")}</p>
          </div>
          {marketingConnected.shopify ? (
            <Button type="button" size="sm" variant="outline" onClick={syncGoalsFromShopify}>
              {t("goals.syncFromShopify")}
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} />
          ))}
        </div>
      </m.section>
      ) : null}

      </div>

      {/* Add lead dialog */}
      <Dialog open={pipelineOpen} onOpenChange={setPipelineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pipeline.dialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-title">{t("pipeline.dialog.companyLabel")}</Label>
              <Input id="lead-title" value={pipelineTitle} onChange={(e) => setPipelineTitle(e.target.value)} placeholder={t("pipeline.dialog.companyPlaceholder")} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-desc">{t("pipeline.dialog.notesLabel")}</Label>
              <Textarea id="lead-desc" value={pipelineDesc} onChange={(e) => setPipelineDesc(e.target.value)} placeholder={t("pipeline.dialog.notesPlaceholder")} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("pipeline.dialog.priority")}</Label>
                <Select value={pipelinePriority} onValueChange={(v) => setPipelinePriority(v as typeof pipelinePriority)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("pipeline.priority.low")}</SelectItem>
                    <SelectItem value="medium">{t("pipeline.priority.medium")}</SelectItem>
                    <SelectItem value="high">{t("pipeline.priority.high")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-due">{t("pipeline.dialog.deadline")}</Label>
                <Input id="lead-due" type="date" value={pipelineDue} onChange={(e) => setPipelineDue(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineOpen(false)}>{tc("common.cancel")}</Button>
            <Button onClick={() => void addLead()} disabled={pipelineAdding || !pipelineTitle.trim()}>
              {pipelineAdding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("pipeline.dialog.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskEditDialog
        task={editTask}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={async (id, patch) => {
          await updateTask({ id, patch });
        }}
        onQuickPatch={async (id, patch) => {
          await updateTask({ id, patch });
        }}
      />
    </div>
  );
}
