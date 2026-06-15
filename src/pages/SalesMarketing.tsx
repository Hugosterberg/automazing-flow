import { useState, useMemo } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import { LeadsSection, useLeads, isLeadOpen } from "@/features/leads";
import { useTasks } from "@/features/tasks";
import type { TaskRow, TaskStatus } from "@/features/tasks/tasksService";
import { useProfileDocument } from "@/features/profile-documents";
import { pageFadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Pipeline stages - mapped to task statuses
const PIPELINE_STAGES: { status: TaskStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { status: "open", label: "Prospect", icon: CircleDot, color: "text-muted-foreground" },
  { status: "in_progress", label: "In discussion", icon: ChevronRight, color: "text-blue-500" },
  { status: "blocked", label: "Waiting", icon: Clock, color: "text-yellow-500" },
  { status: "done", label: "Closed / Won", icon: Trophy, color: "text-green-500" },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};

type GoalItem = { id: string; title: string; current: number; target: number; unit: string };

const DEFAULT_GOALS: GoalItem[] = [
  { id: "g1", title: "New customers this month", current: 0, target: 10, unit: "customers" },
  { id: "g2", title: "Revenue target (SEK)", current: 0, target: 100000, unit: "SEK" },
  { id: "g3", title: "Customer satisfaction (NPS)", current: 0, target: 80, unit: "points" },
];

function normalizeGoal(goal: GoalItem): GoalItem {
  const defaultGoal = DEFAULT_GOALS.find((item) => item.id === goal.id);
  if (!defaultGoal) return goal;
  return { ...goal, title: defaultGoal.title, unit: defaultGoal.unit };
}

function PipelineCard({ task, onMove, onDelete, isDeleting }: {
  task: TaskRow;
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
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
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
          aria-label="Delete"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5", PRIORITY_COLORS[task.priority])}>
          {PRIORITY_LABELS[task.priority]}
        </Badge>
        {next && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground"
            onClick={() => onMove(task.id, next)}
          >
            Move forward
          </Button>
        )}
      </div>
      {task.due_at && (
        <p className="text-[11px] text-muted-foreground">
          Deadline: {new Date(task.due_at).toLocaleDateString("en-US")}
        </p>
      )}
    </div>
  );
}

function GoalCard({ goal, onUpdate }: {
  goal: GoalItem;
  onUpdate: (id: string, current: number, target: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(String(goal.current));
  const [target, setTarget] = useState(String(goal.target));
  const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));

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
        <p className="text-sm font-medium">{goal.title}</p>
        <button
          type="button"
          onClick={() => { setCurrent(String(goal.current)); setTarget(String(goal.target)); setEditing(true); }}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Edit
        </button>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{goal.current.toLocaleString("en-US")} {goal.unit}</span>
        <span className={cn("font-medium", pct >= 100 ? "text-green-600" : "text-foreground")}>
          {pct}% of {goal.target.toLocaleString("en-US")}
        </span>
      </div>

      {editing && (
        <div className="flex gap-2 pt-1">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Current</Label>
            <Input value={current} onChange={(e) => setCurrent(e.target.value)} className="h-7 text-xs" type="number" />
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Target</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} className="h-7 text-xs" type="number" />
          </div>
          <div className="flex items-end gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={save}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesMarketingPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const { activeProfileId } = useAccounts();
  const businessProfileId = activeBp ?? activeProfileId ?? null;
  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((p) => p.id === businessProfileId);
  const leadsContext = {
    businessName: activeProfile?.name,
    description: activeProfile?.notes ?? undefined,
    location: activeProfile?.location ?? undefined,
  };

  const { tasks, isLoading, createTask, updateTask, deleteTask, isDeleting } = useTasks(businessProfileId);

  // Pipeline tasks = module starts with "pipeline"
  const pipelineTasks = useMemo(
    () => tasks.filter((t) => t.module === "pipeline" && t.status !== "archived"),
    [tasks]
  );

  // Goals persist per business profile in the DB (synced across devices), with
  // a one-time migration from the legacy per-profile localStorage key.
  const legacyGoalsKey = `automazing-goals-${businessProfileId ?? "default"}`;
  const goalsDoc = useProfileDocument<GoalItem[]>("goals", DEFAULT_GOALS.map((g) => ({ ...g })), {
    legacyRead: () => {
      try {
        const stored = localStorage.getItem(legacyGoalsKey);
        return stored ? (JSON.parse(stored) as GoalItem[]).map(normalizeGoal) : undefined;
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
  const [pipelinePriority, setPipelinePriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [pipelineDue, setPipelineDue] = useState("");
  const [pipelineAdding, setPipelineAdding] = useState(false);

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
        dueAt: pipelineDue || null,
      });
      setPipelineOpen(false);
      setPipelineTitle("");
      setPipelineDesc("");
      setPipelineDue("");
    } finally {
      setPipelineAdding(false);
    }
  }

  async function moveTask(id: string, status: TaskStatus) {
    await updateTask({ id, patch: { status } });
  }

  // KPIs are driven by the real leads pipeline (not pipeline-tagged tasks).
  const { leads } = useLeads(businessProfileId);
  const activeLeads = leads.filter((l) => isLeadOpen(l.status)).length;
  const wonLeads = leads.filter((l) => l.status === "won").length;
  const lostLeads = leads.filter((l) => l.status === "lost").length;
  const closedLeads = wonLeads + lostLeads;
  const conversionRate = closedLeads > 0 ? Math.round((wonLeads / closedLeads) * 100) : 0;

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        icon={Target}
        title="Sales"
        description="Pipeline, leads, and goals for your business."
      />

      {/* KPI tiles */}
      <m.div {...pageFadeUp} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Active leads", value: activeLeads, icon: CircleDot, color: "text-blue-500" },
          { label: "Won deals", value: wonLeads, icon: Trophy, color: "text-green-500" },
          { label: "Conversion rate", value: `${conversionRate}%`, icon: Target, color: "text-primary" },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-border">
            <CardContent className="p-4">
              <kpi.icon className={cn("h-4 w-4 mb-2", kpi.color)} />
              <p className="text-2xl font-bold tabular-nums">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </m.div>

      {/* Leads — register + follow up, with AI outreach suggestions */}
      <m.div {...pageFadeUp} transition={{ delay: 0.04 }}>
        <LeadsSection businessProfileId={businessProfileId} context={leadsContext} />
      </m.div>

      {/* Pipeline kanban */}
      <m.section {...pageFadeUp} transition={{ delay: 0.05 }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Pipeline</h2>
            <p className="text-xs text-muted-foreground">Move leads through each stage toward close.</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setPipelineOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New lead
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
            {PIPELINE_STAGES.map((stage) => {
              const stageTasks = pipelineTasks.filter((t) => t.status === stage.status);
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
                        isDeleting={isDeleting}
                      />
                    ))}
                    {stageTasks.length === 0 && (
                      <p className="text-[11px] text-muted-foreground/60 text-center pt-4">Empty</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </m.section>


      {/* Goals */}
      <m.section {...pageFadeUp} transition={{ delay: 0.15 }}>
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Goals & KPIs</h2>
          <p className="text-xs text-muted-foreground">Click "Edit" on a goal to update the current value.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} />
          ))}
        </div>
      </m.section>

      {/* Add lead dialog */}
      <Dialog open={pipelineOpen} onOpenChange={setPipelineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-title">Company / contact name</Label>
              <Input id="lead-title" value={pipelineTitle} onChange={(e) => setPipelineTitle(e.target.value)} placeholder="Acme Inc." autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-desc">Note (optional)</Label>
              <Textarea id="lead-desc" value={pipelineDesc} onChange={(e) => setPipelineDesc(e.target.value)} placeholder="Contact info, source, etc." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={pipelinePriority} onValueChange={(v) => setPipelinePriority(v as typeof pipelinePriority)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-due">Deadline (optional)</Label>
                <Input id="lead-due" type="date" value={pipelineDue} onChange={(e) => setPipelineDue(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineOpen(false)}>Cancel</Button>
            <Button onClick={() => void addLead()} disabled={pipelineAdding || !pipelineTitle.trim()}>
              {pipelineAdding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
