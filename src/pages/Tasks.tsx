import { useMemo, useState } from "react";
import { m } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Circle, ListChecks, Loader2, PlayCircle, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp } from "@/lib/motion";
import { useAccounts } from "@/context/AccountsContext";
import { useAuth } from "@/context/AuthContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import {
  useTasks,
  TaskForm,
  TaskBoard,
  TaskEditDialog,
  isTaskOverdue,
} from "@/features/tasks";
import type { TaskEditPatch } from "@/features/tasks/TaskEditDialog";
import {
  getTaskChecklist,
  getTaskComments,
  type TaskChecklistItem,
  type TaskComment,
  type TaskRow,
} from "@/features/tasks/tasksService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ModuleFilter = "all" | "general" | "campaign" | "pipeline";

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

  // `?view=overdue` deep links come from the sidebar badge, the home
  // dashboard tile and the daily brief — honour them by filtering the board.
  const [searchParams, setSearchParams] = useSearchParams();
  const showOverdueOnly = searchParams.get("view") === "overdue";
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("general");

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

  const overdueTasks = useMemo(() => tasks.filter((task) => isTaskOverdue(task)), [tasks]);
  const moduleFilteredTasks = useMemo(
    () => tasks.filter((t) => matchesModuleFilter(t.module, moduleFilter)),
    [tasks, moduleFilter]
  );
  const visibleTasks = useMemo(() => {
    const base = showOverdueOnly ? overdueTasks : moduleFilteredTasks;
    if (!showOverdueOnly) return base;
    return base.filter((t) => matchesModuleFilter(t.module, moduleFilter));
  }, [showOverdueOnly, overdueTasks, moduleFilteredTasks, moduleFilter]);

  function clearOverdueFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    setSearchParams(next, { replace: true });
  }

  async function handleSetStatus(id: string, status: Parameters<typeof setStatus>[0]["status"]) {
    try {
      await setStatus({ id, status });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update task.");
    }
  }

  async function handleDeleteTask(id: string) {
    try {
      await deleteTask(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete task.");
    }
  }

  function openEdit(task: TaskRow) {
    setEditTask(task);
    setEditOpen(true);
  }

  async function handleSaveEdit(id: string, patch: TaskEditPatch) {
    try {
      await updateTask({ id, patch });
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
      // Metadata is replaced wholesale, so comments ride along untouched.
      await updateTask({ id: task.id, patch: { checklist, comments: getTaskComments(task) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update checklist.");
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

      {showOverdueOnly ? (
        <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            <p className="text-sm text-foreground">
              Showing {overdueTasks.length === 1 ? "1 overdue task" : `${overdueTasks.length} overdue tasks`}.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-xs"
              onClick={clearOverdueFilter}
            >
              <X className="h-3.5 w-3.5 mr-1" aria-hidden />
              Show all tasks
            </Button>
          </div>
        </m.div>
      ) : null}

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
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
      />
    </div>
  );
}
