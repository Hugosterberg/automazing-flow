import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { m } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Circle, ListChecks, Loader2, PlayCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { PageSmartBar } from "@/components/ui/page-smart-bar";
import { cn } from "@/lib/utils";
import { pageFadeUp } from "@/lib/motion";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { isShortcutBlocked, isTypingTarget, isPlainLetterShortcut, matchesKey } from "@/lib/keyboardShortcuts";
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
  const navigate = useNavigate();
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
  const debouncedSearch = useDebouncedValue(search, 180);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const taskTitleRef = useRef<HTMLInputElement>(null);
  const [prefillTitle, setPrefillTitle] = useState("");

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
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

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
        return taskMatchesQuery(t, debouncedSearch);
      }),
    [moduleFilteredTasks, quickFilter, debouncedSearch]
  );

  const navigateTaskRelative = useCallback(
    (delta: number) => {
      if (visibleTasks.length === 0) return;
      const currentIndex = focusedTaskId ? visibleTasks.findIndex((t) => t.id === focusedTaskId) : -1;
      const nextIndex =
        currentIndex === -1
          ? delta > 0
            ? 0
            : visibleTasks.length - 1
          : Math.min(visibleTasks.length - 1, Math.max(0, currentIndex + delta));
      setFocusedTaskId(visibleTasks[nextIndex]?.id ?? null);
    },
    [visibleTasks, focusedTaskId]
  );

  const focusedTask = useMemo(
    () => (focusedTaskId ? visibleTasks.find((t) => t.id === focusedTaskId) ?? null : null),
    [visibleTasks, focusedTaskId]
  );

  useEffect(() => {
    setFocusedTaskId(null);
  }, [quickFilter, debouncedSearch, moduleFilter]);

  useEffect(() => {
    if (!focusedTaskId) return;
    document.querySelector(`[data-task-id="${focusedTaskId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedTaskId, visibleTasks.length]);

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

  // Deep link from Customers: /tasks?new=1&title=...
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const title = searchParams.get("title");
    if (title) setPrefillTitle(title);
    queueMicrotask(() => taskTitleRef.current?.focus());
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    next.delete("title");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutBlocked() || isTypingTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        taskTitleRef.current?.focus();
        return;
      }
      if (matchesKey(e, "a") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        setQuickFilter("all");
        return;
      }
      if (matchesKey(e, "o") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        setQuickFilter("overdue");
        return;
      }
      if (matchesKey(e, "t") && isPlainLetterShortcut(e)) {
        e.preventDefault();
        setQuickFilter("today");
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateTaskRelative(1);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateTaskRelative(-1);
        return;
      }
      if (matchesKey(e, "e") && isPlainLetterShortcut(e) && focusedTaskId && !editOpen) {
        const task = visibleTasks.find((t) => t.id === focusedTaskId);
        if (task) {
          e.preventDefault();
          openEdit(task);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setQuickFilter, navigateTaskRelative, focusedTaskId, editOpen, visibleTasks]);

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
      if (source === "ai") {
        toast.success(
          `AI prepared the task: ${newSteps.length} step${newSteps.length === 1 ? "" : "s"} + analysis added.`
        );
      } else {
        toast.success("Added a basic plan.", {
          description: "Add an OpenAI key for full task-specific analysis.",
          action: {
            label: "AI settings",
            onClick: () => navigate("/preferences?tab=ai"),
          },
        });
      }
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
        <h1 className="text-3xl font-bold tracking-tight">Uppgifter</h1>
        <p className="text-sm text-muted-foreground">
          Välj en företagsprofil för att se uppgifter.
        </p>
      </div>
    );
  }

  const isMobile = useIsMobile();

  return (
    <div className="space-y-6 max-w-7xl w-full">
      <PageHeader
        icon={ListChecks}
        title="Uppgifter"
        description={
          isMobile
            ? "Svep mellan Att göra, Pågår och Klart. Tryck Starta/Klar för att flytta kort."
            : "Lägg till snabbt, öppna kort för detaljer och dra mellan kolumner."
        }
        actions={
          <>
            <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v as ModuleFilter)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Allmänt</SelectItem>
                <SelectItem value="campaign">Kampanj</SelectItem>
                <SelectItem value="pipeline">Pipeline</SelectItem>
                <SelectItem value="all">Alla moduler</SelectItem>
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
            <span className="ml-1.5 hidden sm:inline">Uppdatera</span>
          </Button>
          </>
        }
      />

      <PageSmartBar
        title={
          isMobile
            ? "Skapa uppgifter, svep mellan kolumner och tryck Starta/Klar för att flytta dem."
            : "Uppgifter är din dagliga kö — skapa snabbt, filtrera det viktiga och dra kort mellan stadier."
        }
        steps={
          isMobile
            ? ["Skapa en uppgift ovan", "Svep mellan Att göra · Pågår · Klart", "Tryck Starta eller Klar på kortet"]
            : [
                "Skapa en uppgift med formuläret ovan (eller öppna befintlig via kortet)",
                "Filtrera på försenade eller dagens deadlines när du triagerar",
                "Dra kort mellan Att göra → Pågår → Klart, eller öppna detaljer för AI/checklista",
              ]
        }
        tip="Svep mellan kolumnerna. Automationer kan påminna om försenade uppgifter — se Automationer."
      />

      <m.div {...pageFadeUp} transition={{ duration: 0.35 }}>
        <TaskForm
          onSubmit={(input) => createTask(input)}
          disabled={isCreating}
          initialTitle={prefillTitle}
          titleInputRef={taskTitleRef}
        />
      </m.div>

      <m.div {...pageFadeUp} transition={{ duration: 0.3 }} className="app-workspace-shell">
        <div className="app-workspace-toolbar flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <div className="relative w-full min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök uppgifter…"
              className={cn(
                "border-border/60 bg-background/60 pl-8 text-sm shadow-sm",
                isMobile ? "h-10" : "h-8 text-xs"
              )}
              aria-label="Sök uppgifter"
            />
          </div>
          <div className="flex min-w-0 items-center overflow-x-auto rounded-lg border border-border/60 bg-background/40 p-1 app-scroll">
            {(
              [
                { id: "all", label: "Alla", count: null, activeClass: "bg-primary text-primary-foreground shadow-sm" },
                { id: "overdue", label: "Försenade", count: overdueCount, activeClass: "bg-destructive/90 text-destructive-foreground shadow-sm" },
                { id: "today", label: "Idag", count: dueTodayCount, activeClass: "bg-warning/90 text-warning-foreground shadow-sm" },
              ] as const
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setQuickFilter(chip.id)}
                aria-pressed={quickFilter === chip.id}
                className={cn(
                  "shrink-0 rounded-md px-3 font-medium transition-colors",
                  isMobile ? "min-h-9 py-2 text-sm" : "px-2.5 py-1 text-[11px]",
                  quickFilter === chip.id ? chip.activeClass : "text-muted-foreground hover:text-foreground"
                )}
              >
                {chip.label}
                {chip.count !== null && chip.count > 0 ? (
                  <span className="ml-1 tabular-nums">{chip.count}</span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="ml-auto hidden text-[11px] tabular-nums text-muted-foreground md:block">
            {visibleTasks.length} visade
          </p>
        </div>

        <div className="app-workspace-stats grid grid-cols-3 gap-2 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 px-2.5 py-1.5">
            <Circle className="h-3.5 w-3.5 text-sky-500" />
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Att göra</p>
              <p className="text-xs font-semibold tabular-nums">{stats.todo}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5">
            <PlayCircle className="h-3.5 w-3.5 text-amber-500" />
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Pågår</p>
              <p className="text-xs font-semibold tabular-nums">{stats.inProgress}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Klara</p>
              <p className="text-xs font-semibold tabular-nums">{stats.done}</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
          {isMobile ? (
            <p className="mb-2 text-xs text-muted-foreground">Svep i sidled mellan kolumner · tryck Starta/Klar för att flytta</p>
          ) : null}
          <TaskBoard
            tasks={visibleTasks}
            isLoading={isLoading}
            onSetStatus={(id, status) => void handleSetStatus(id, status)}
            onDelete={(id) => void handleDeleteTask(id)}
            onEdit={openEdit}
            focusedTaskId={focusedTaskId}
            onToggleChecklistItem={(task, itemId, done) =>
              void handleToggleChecklistItem(task, itemId, done)
            }
            onAiAssist={(task) => void handleAiAssist(task)}
            aiBusyTaskId={aiTaskId}
            onArchiveDone={() => void handleArchiveDone()}
            isMutating={isSettingStatus || isUpdating}
            isDeleting={isDeleting}
          />
        </div>

        <div className="hidden shrink-0 items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm sm:flex sm:px-4">
          <span className="truncate">
            {focusedTask ? (
              <>
                Fokus: <span className="font-medium text-foreground/80">{focusedTask.title}</span>
              </>
            ) : (
              "J/K för att bläddra bland synliga kort"
            )}
          </span>
          <span className="hidden sm:inline">E Edit · / Search · N New</span>
        </div>
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
