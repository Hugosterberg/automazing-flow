import { useCallback, useMemo } from "react";
import { m } from "framer-motion";
import { ListChecks, RefreshCw, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { pageFadeUp } from "@/lib/motion";
import { useAccounts } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import {
  useTasks,
  TaskForm,
  TaskList,
  isTaskOpen,
  isTaskOverdue,
} from "@/features/tasks";

/**
 * Views the Tasks page exposes. Kept as a tiny const array so the allowed
 * set is the single source of truth for both validation and rendering.
 */
const TASK_VIEWS = ["active", "overdue", "done"] as const;
type TaskView = (typeof TASK_VIEWS)[number];
const DEFAULT_VIEW: TaskView = "active";

function parseView(raw: string | null): TaskView {
  return TASK_VIEWS.includes(raw as TaskView) ? (raw as TaskView) : DEFAULT_VIEW;
}

/**
 * /tasks — simple tenant-scoped task board. Intentionally minimal for the
 * first pass: add, complete, delete. Assignment, due dates, and related-
 * entity linking exist in the schema but are not yet exposed in the UI.
 */
export default function TasksPage() {
  const activeBp = useActiveBusinessProfileIdOptional();
  const legacy = useAccounts();
  const businessProfileId = activeBp ?? legacy.activeProfileId ?? null;

  const {
    tasks,
    isLoading,
    isFetching,
    refetch,
    createTask,
    isCreating,
    setCompleted,
    isToggling,
    deleteTask,
    isDeleting,
  } = useTasks(businessProfileId);

  // Tab state lives in the URL (`?view=active|overdue|done`). This makes
  // filters shareable via copy-paste, lets browser back/forward navigate
  // between views, and enables deep-linking from the sidebar badge straight
  // into the overdue bucket. An unknown value falls back to the default.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseView(searchParams.get("view"));

  const handleTabChange = useCallback(
    (next: string) => {
      const view = parseView(next);
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (view === DEFAULT_VIEW) updated.delete("view");
          else updated.set("view", view);
          return updated;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const { active, overdue, done } = useMemo(() => {
    const nowMs = Date.now();
    const activeRows = tasks.filter(isTaskOpen);
    const overdueRows = activeRows.filter((t) => isTaskOverdue(t, nowMs));
    const doneRows = tasks.filter((t) => t.status === "done");
    return { active: activeRows, overdue: overdueRows, done: doneRows };
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
    <div className="space-y-6 max-w-3xl w-full">
      <PageHeader
        icon={ListChecks}
        title="Tasks"
        description="Track what needs attention for this business profile."
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

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }}>
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="active">
              Active
              <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">
                {active.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="overdue">
              Overdue
              <span
                className={`ml-1.5 text-[11px] tabular-nums ${
                  overdue.length > 0 ? "text-warning" : "text-muted-foreground"
                }`}
              >
                {overdue.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="done">
              Completed
              <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">
                {done.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <TaskList
              tasks={active}
              isLoading={isLoading}
              onToggleComplete={(id, completed) =>
                void setCompleted({ id, completed })
              }
              onDelete={(id) => void deleteTask(id)}
              isToggling={isToggling}
              isDeleting={isDeleting}
              emptyMessage="No active tasks. Add one above to get started."
            />
          </TabsContent>

          <TabsContent value="overdue" className="mt-4">
            <TaskList
              tasks={overdue}
              isLoading={isLoading}
              onToggleComplete={(id, completed) =>
                void setCompleted({ id, completed })
              }
              onDelete={(id) => void deleteTask(id)}
              isToggling={isToggling}
              isDeleting={isDeleting}
              emptyMessage="Nothing overdue. You're caught up."
            />
          </TabsContent>

          <TabsContent value="done" className="mt-4">
            <TaskList
              tasks={done}
              isLoading={isLoading}
              onToggleComplete={(id, completed) =>
                void setCompleted({ id, completed })
              }
              onDelete={(id) => void deleteTask(id)}
              isToggling={isToggling}
              isDeleting={isDeleting}
              emptyMessage="Nothing completed yet."
            />
          </TabsContent>
        </Tabs>
      </m.div>
    </div>
  );
}
