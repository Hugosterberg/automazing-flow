import { useMemo } from "react";
import { m } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Circle, ListChecks, Loader2, PlayCircle, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp } from "@/lib/motion";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import {
  useTasks,
  TaskForm,
  TaskBoard,
  isTaskOverdue,
} from "@/features/tasks";

/**
 * /tasks — tenant-scoped kanban board. Tasks are intentionally kept in three
 * operational lanes (To-do, In progress, Done) so the workflow stays obvious.
 */
export default function TasksPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;

  // `?view=overdue` deep links come from the sidebar badge, the home
  // dashboard tile and the daily brief — honour them by filtering the board.
  const [searchParams, setSearchParams] = useSearchParams();
  const showOverdueOnly = searchParams.get("view") === "overdue";

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
  } = useTasks(businessProfileId);

  const overdueTasks = useMemo(() => tasks.filter((task) => isTaskOverdue(task)), [tasks]);
  const visibleTasks = showOverdueOnly ? overdueTasks : tasks;

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

  const stats = useMemo(() => {
    const todo = tasks.filter((task) => task.status !== "done" && task.status !== "in_progress" && task.status !== "archived").length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const done = tasks.filter((task) => task.status === "done").length;
    return { todo, inProgress, done };
  }, [tasks]);

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
          isMutating={isSettingStatus}
          isDeleting={isDeleting}
        />
      </m.div>
    </div>
  );
}
