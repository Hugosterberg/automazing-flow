import { useEffect, useMemo, useState } from "react";
import { m } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Circle, ListChecks, Loader2, PlayCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { pageFadeUp } from "@/lib/motion";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional, useBusinessProfiles } from "@/features/business-profiles";
import {
  useTasks,
  TaskForm,
  TaskBoard,
  TaskEditDialog,
  isTaskOverdue,
  isTaskDueToday,
} from "@/features/tasks";
import { taskMatchesQuery } from "@/features/tasks/taskFilters";
import type { TaskEditPatch } from "@/features/tasks/TaskEditDialog";
import {
  getTaskAi,
  getTaskChecklist,
  getTaskComments,
  newChecklistItem,
  type TaskChecklistItem,
  type TaskComment,
  type TaskRow,
} from "@/features/tasks/tasksService";
import { fetchTaskAssist, type TaskAssistResult } from "@/features/tasks/taskAssistClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ModuleFilter = "all" | "general" | "campaign" | "pipeline";
type QuickFilter = "all" | "overdue" | "today";

/** One readable comment out of the AI result (summary, research, draft, questions). */
function composeAiComment(result: TaskAssistResult): string {
  const parts: string[] = [];
  if (result.summary) parts.push(result.summary);
  if (result.info.length) {
    parts.push(`Good to know:\n${result.info.map((i) => `• ${i}`).join("\n")}`);
  }
  if (result.questions.length) {
    parts.push(`Open questions:\n${result.questions.map((q) => `• ${q}`).join("\n")}`);
  }
  if (result.draft) parts.push(`Draft:\n${result.draft}`);
  return parts.join("\n\n").trim();
}

function matchesModuleFilter(module: string | null | undefined, filter: ModuleFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pipeline") return module === "pipeline";
  if (filter === "campaign") return module === "campaign";
  return !module || module === "tasks";
}

/**
 * /tasks — tenant-scoped kanban board. Tasks are intentionally kept in three
 * operational lanes (To-do, In progress, Done) so the workflow stays obvious.
 */
export default function TasksPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const { user } = useAuth();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;

  // `?view=overdue|today` deep links come from the sidebar badge, the home
  // dashboard tile and the daily brief. The quick-filter chips read and
  // write the same param so deep links and in-page filtering stay one thing.
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const quickFilter: QuickFilter =
    viewParam === "overdue" ? "overdue" : viewParam === "today" ? "today" : "all";
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("general");
  const [search, setSearch] = useState("");

  function setQuickFilter(filter: QuickFilter) {
    const next = new URLSearchParams(searchParams);
    if (filter === "all") next.delete("view");
    else next.set("view", filter);
    setSearchParams(next, { replace: true });
  }

  const {
    tasks,
    isLoading,
    isFetching,
    refetch,
    createTask,
    isCreating,
    setStatus,
    isSettingStatus,
    deleteTask,
    isDeleting,
    updateTask,
    isUpdating,
  } = useTasks(businessProfileId);

  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [aiTaskId, setAiTaskId] = useState<string | null>(null);

  const { profiles } = useBusinessProfiles();
  const activeProfile = profiles.find((p) => p.id === businessProfileId);

  const moduleFilteredTasks = useMemo(
    () => tasks.filter((t) => matchesModuleFilter(t.module, moduleFilter)),
    [tasks, moduleFilter]
  );
  const overdueCount = useMemo(
    () => moduleFilteredTasks.filter((t) => isTaskOverdue(t)).length,
    [moduleFilteredTasks]
  );
  const dueTodayCount = useMemo(
    () => moduleFilteredTasks.filter((t) => isTaskDueToday(t)).length,
    [moduleFilteredTasks]
  );
  const visibleTasks = useMemo(
    () =>
      moduleFilteredTasks.filter((t) => {
        if (quickFilter === "overdue" && !isTaskOverdue(t)) return false;
        if (quickFilter === "today" && !isTaskDueToday(t)) return false;
        return taskMatchesQuery(t, search);
      }),
    [moduleFilteredTasks, quickFilter, search]
  );

  // `?task=<id>` deep links open the detail dialog directly (used by shared
  // links from the dialog's copy-link button). Consumed so refresh/close
  // doesn't re-open it.
  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId || tasks.length === 0) return;
    const linked = tasks.find((t) => t.id === taskId);
    if (linked) {
      setEditTask(linked);
      setEditOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("task");
    setSearchParams(next, { replace: true });
  }, [tasks, searchParams, setSearchParams]);

  async function handleSetStatus(id: string, status: Parameters<typeof setStatus>[0]["status"]) {
    try {
      await setStatus({ id, status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update task.");
    }
  }

  async function handleDeleteTask(id: string) {
    const row = tasks.find((t) => t.id === id);
    try {
      await deleteTask(id);
      if (!row) return;
      // Deletes are permanent in the DB, so give a grace period via the
      // toast: Undo recreates the task (new id) with all its content.
      toast.success("Task deleted.", {
        action: {
          label: "Undo",
          onClick: () => {
            void createTask({
              title: row.title,
              description: row.description,
              priority: row.priority,
              status: row.status === "archived" ? "open" : row.status,
              dueAt: row.due_at,
              module: row.module,
              checklist: getTaskChecklist(row),
              comments: getTaskComments(row),
              ai: getTaskAi(row),
            }).catch(() => toast.error("Could not restore the task."));
          },
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete task.");
    }
  }

  /** "Clear done": move every finished task in the current module scope to
   * the archive so the Done lane stays readable. Archived rows keep their
   * completed_at and stay in the DB. */
  async function handleArchiveDone() {
    const done = moduleFilteredTasks.filter((t) => t.status === "done");
    if (done.length === 0) return;
    try {
      await Promise.all(
        done.map((t) => updateTask({ id: t.id, patch: { status: "archived" } }))
      );
      toast.success(
        `Archived ${done.length} done task${done.length === 1 ? "" : "s"}.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive tasks.");
    }
  }

  async function handleDuplicate(task: TaskRow) {
    try {
      await createTask({
        title: `${task.title} (copy)`,
        description: task.description,
        priority: task.priority,
        dueAt: task.due_at,
        module: task.module,
        // Fresh ids and unticked boxes — the copy is a new piece of work.
        checklist: getTaskChecklist(task).map((item) => newChecklistItem(item.text)),
      });
      toast.success("Task duplicated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate task.");
    }
  }

  function openEdit(task: TaskRow) {
    setEditTask(task);
    setEditOpen(true);
  }

  async function handleSaveEdit(id: string, patch: TaskEditPatch) {
    try {
      const { status, ...rest } = patch;
      await updateTask({
        id,
        patch: {
          ...rest,
          // Status changes keep completed_at in sync, same as the board's
          // drag/button flow does via setTaskStatus.
          ...(status !== undefined
            ? { status, completedAt: status === "done" ? new Date().toISOString() : null }
            : {}),
        },
      });
      toast.success("Task updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save task.");
      throw err;
    }
  }

  // Silent variant used by the detail dialog for checklist ticks and
  // comments — these persist immediately, a success toast per tick would
  // be noise.
  async function handleQuickPatch(
    id: string,
    patch: { checklist: TaskChecklistItem[]; comments: TaskComment[] }
  ) {
    await updateTask({ id, patch });
  }

  async function handleToggleChecklistItem(task: TaskRow, itemId: string, done: boolean) {
    const checklist = getTaskChecklist(task).map((item) =>
      item.id === itemId ? { ...item, done } : item
    );
    try {
      await updateTask({ id: task.id, patch: { checklist } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update checklist.");
    }
  }

  /**
   * "Give the task to AI": the server analyzes the task and the result lands
   * where the work happens — new checklist steps, plus an AI comment holding
   * the summary, research notes, draft and open questions.
   */
  async function handleAiAssist(taskRef: TaskRow): Promise<TaskRow | null> {
    if (aiTaskId) return null;
    setAiTaskId(taskRef.id);
    try {
      // The dialog's row can be stale (quick patches persist without
      // re-seeding it) — prefer the latest row from the query cache.
      const task = tasks.find((t) => t.id === taskRef.id) ?? taskRef;
      const existingChecklist = getTaskChecklist(task);
      const existingComments = getTaskComments(task);
      const { result, source } = await fetchTaskAssist({
        business_profile_id: task.business_profile_id,
        title: task.title,
        description: task.description ?? undefined,
        priority: task.priority,
        dueAt: task.due_at ?? undefined,
        checklist: existingChecklist.map((i) => i.text),
        comments: existingComments.map((c) => c.text),
        businessName: activeProfile?.name,
        businessDescription: activeProfile?.notes ?? undefined,
        location: activeProfile?.location ?? undefined,
      });

      const known = new Set(existingChecklist.map((i) => i.text.trim().toLowerCase()));
      const newSteps = result.steps.filter((s) => !known.has(s.trim().toLowerCase()));
      const commentText = composeAiComment(result);

      const updated = await updateTask({
        id: task.id,
        patch: {
          checklist: [...existingChecklist, ...newSteps.map(newChecklistItem)],
          ...(commentText
            ? {
                comments: [
                  ...existingComments,
                  {
                    id: crypto.randomUUID(),
                    text: commentText,
                    createdAt: new Date().toISOString(),
                    author: "AI",
                  },
                ],
              }
            : {}),
          ai: { enrichedAt: new Date().toISOString(), source },
        },
      });
      toast.success(
        source === "ai"
          ? `AI prepared the task: ${newSteps.length} step${newSteps.length === 1 ? "" : "s"} + analysis added.`
          : "Added a basic plan. Connect an OpenAI key in Settings for full AI analysis."
      );
      return updated;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI could not analyze the task.");
      return null;
    } finally {
      setAiTaskId(null);
    }
  }

  const stats = useMemo(() => {
    const scoped = moduleFilteredTasks;
    const todo = scoped.filter((task) => task.status !== "done" && task.status !== "in_progress" && task.status !== "archived").length;
    const inProgress = scoped.filter((task) => task.status === "in_progress").length;
    const done = scoped.filter((task) => task.status === "done").length;
    return { todo, inProgress, done };
  }, [moduleFilteredTasks]);

  if (!businessProfileId) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Select a business profile to see its tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl w-full">
      <PageHeader
        icon={ListChecks}
        title="Tasks"
        description="Create tasks in To-do, drag them into In progress, and finish them in Done."
        actions={
          <>
            <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v as ModuleFilter)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="campaign">Campaign</SelectItem>
                <SelectItem value="pipeline">Pipeline</SelectItem>
                <SelectItem value="all">All modules</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="text-muted-foreground"
            >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
          </>
        }
      />

      <m.div {...pageFadeUp} transition={{ duration: 0.35 }}>
        <TaskForm
          onSubmit={(input) => createTask(input)}
          disabled={isCreating}
        />
      </m.div>

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="h-8 pl-8 text-xs"
              aria-label="Search tasks"
            />
          </div>
          <div className="flex items-center gap-1">
            {(
              [
                { id: "all", label: "All", count: null, activeClass: "border-primary/50 bg-primary/10 text-primary" },
                { id: "overdue", label: "Overdue", count: overdueCount, activeClass: "border-destructive/50 bg-destructive/10 text-destructive" },
                { id: "today", label: "Due today", count: dueTodayCount, activeClass: "border-warning/50 bg-warning/10 text-warning" },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setQuickFilter(chip.id)}
                aria-pressed={quickFilter === chip.id}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  quickFilter === chip.id
                    ? chip.activeClass
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {chip.label}
                {chip.count !== null && chip.count > 0 ? (
                  <span className="tabular-nums">{chip.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Card className="border-sky-500/20 bg-sky-500/5">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">To-do</p>
                <p className="text-2xl font-semibold tabular-nums">{stats.todo}</p>
              </div>
              <Circle className="h-5 w-5 text-sky-500" />
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">In progress</p>
                <p className="text-2xl font-semibold tabular-nums">{stats.inProgress}</p>
              </div>
              <PlayCircle className="h-5 w-5 text-amber-500" />
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">Done</p>
                <p className="text-2xl font-semibold tabular-nums">{stats.done}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </CardContent>
          </Card>
        </div>
        <TaskBoard
          tasks={visibleTasks}
          isLoading={isLoading}
          onSetStatus={(id, status) => void handleSetStatus(id, status)}
          onDelete={(id) => void handleDeleteTask(id)}
          onEdit={openEdit}
          onToggleChecklistItem={(task, itemId, done) =>
            void handleToggleChecklistItem(task, itemId, done)
          }
          onAiAssist={(task) => void handleAiAssist(task)}
          aiBusyTaskId={aiTaskId}
          onArchiveDone={() => void handleArchiveDone()}
          isMutating={isSettingStatus || isUpdating}
          isDeleting={isDeleting}
        />
      </m.div>

      <TaskEditDialog
        task={editTask}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={handleSaveEdit}
        onQuickPatch={handleQuickPatch}
        currentUser={user?.email ?? null}
        showStatus
        onAiAssist={handleAiAssist}
        aiBusy={aiTaskId !== null && aiTaskId === editTask?.id}
        onDuplicate={handleDuplicate}
        shareUrlBase="/tasks"
      />
    </div>
  );
}
