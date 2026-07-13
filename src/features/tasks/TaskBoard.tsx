import { useMemo, useState, type DragEvent } from "react";
import { Archive, CalendarDays, CheckCircle2, Clock3, Loader2, MessageSquare, PlayCircle, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { isTaskOverdue, compareTasksByUrgency } from "./taskFilters";
import {
  getTaskAi,
  getTaskChecklist,
  getTaskComments,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from "./tasksService";

type BoardStatus = "open" | "in_progress" | "done";

type ColumnConfig = {
  status: BoardStatus;
  title: string;
  description: string;
  icon: typeof Clock3;
  accent: string;
  empty: string;
};

interface Props {
  tasks: TaskRow[];
  isLoading?: boolean;
  onSetStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: TaskRow) => void;
  /** Tick/untick a checklist item straight from the card. */
  onToggleChecklistItem?: (task: TaskRow, itemId: string, done: boolean) => void;
  /** Hand the task to AI: it adds steps, research and a draft to the task. */
  onAiAssist?: (task: TaskRow) => void;
  /** Task id currently being AI-analyzed (shows a spinner on that card). */
  aiBusyTaskId?: string | null;
  /** Keyboard-focused card for J/K navigation. */
  focusedTaskId?: string | null;
  /** "Clear done": archive every task currently in the Done lane. */
  onArchiveDone?: () => void;
  isMutating?: boolean;
  isDeleting?: boolean;
}

const COLUMNS: ColumnConfig[] = [
  {
    status: "open",
    title: "To-do",
    description: "New tasks start here.",
    icon: Clock3,
    accent: "from-sky-500/15 to-sky-500/5 border-sky-500/25",
    empty: "Create a task above and it will appear here.",
  },
  {
    status: "in_progress",
    title: "In progress",
    description: "Work that is being handled now.",
    icon: PlayCircle,
    accent: "from-amber-500/15 to-amber-500/5 border-amber-500/25",
    empty: "Drag a task here when work starts.",
  },
  {
    status: "done",
    title: "Done",
    description: "Completed and ready to review.",
    icon: CheckCircle2,
    accent: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/25",
    empty: "Drop finished tasks here.",
  },
];

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "border-border text-muted-foreground",
  medium: "border-info/40 text-info",
  high: "border-warning/50 text-warning",
  urgent: "border-destructive/50 text-destructive",
};

function columnForTask(task: TaskRow): BoardStatus | null {
  if (task.status === "archived") return null;
  if (task.status === "done") return "done";
  if (task.status === "in_progress") return "in_progress";
  return "open";
}

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
}

const CARD_CHECKLIST_LIMIT = 3;

function TaskCard({
  task,
  onSetStatus,
  onDelete,
  onEdit,
  onToggleChecklistItem,
  onAiAssist,
  aiBusy,
  focused,
  isMutating,
  isDeleting,
}: {
  task: TaskRow;
  onSetStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onEdit?: (task: TaskRow) => void;
  onToggleChecklistItem?: (task: TaskRow, itemId: string, done: boolean) => void;
  onAiAssist?: (task: TaskRow) => void;
  aiBusy?: boolean;
  focused?: boolean;
  isMutating?: boolean;
  isDeleting?: boolean;
}) {
  const overdue = isTaskOverdue(task);
  const dueDate = formatDueDate(task.due_at);
  const completed = task.status === "done";
  const checklist = getTaskChecklist(task);
  const doneCount = checklist.filter((item) => item.done).length;
  const commentCount = getTaskComments(task).length;
  const visibleChecklist = checklist.slice(0, CARD_CHECKLIST_LIMIT);
  const aiState = getTaskAi(task);
  const checklistPct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

  // One contextual advance action instead of every possible move — drag or
  // the dialog's status picker covers the rest.
  const advance: { label: string; status: TaskStatus } = completed
    ? { label: "Reopen", status: "open" }
    : task.status === "in_progress"
      ? { label: "Done", status: "done" }
      : { label: "Start", status: "in_progress" };

  return (
    <article
      data-task-id={task.id}
      draggable={!isMutating}
      tabIndex={onEdit ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onEdit || isMutating) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(task);
        }
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.setData("text/plain", task.id);
      }}
      onClick={() => onEdit?.(task)}
      className={cn(
        "group space-y-2 rounded-xl border border-border bg-card/95 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onEdit && "cursor-pointer",
        focused && "ring-2 ring-primary/60 border-primary/40",
        overdue && "border-destructive/40",
        completed && "bg-muted/40"
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3
            className={cn(
              "text-[15px] font-semibold leading-snug break-words sm:text-sm",
              completed && "text-muted-foreground line-through"
            )}
          >
            {task.title}
          </h3>
          {task.status === "blocked" ? (
            <Badge variant="outline" className="border-destructive/50 text-[10px] uppercase text-destructive">
              {TASK_STATUS_LABELS.blocked}
            </Badge>
          ) : null}
        </div>
        {task.description ? (
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground sm:text-xs">
            {task.description}
          </p>
        ) : null}
      </div>

      {checklist.length > 0 ? (
        <div className="space-y-1.5">
          <ul className="space-y-1">
            {visibleChecklist.map((item) => (
              <li key={item.id} className="flex items-center gap-1.5">
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(v) =>
                    onToggleChecklistItem?.(task, item.id, Boolean(v))
                  }
                  onClick={(e) => e.stopPropagation()}
                  disabled={isMutating || !onToggleChecklistItem}
                  aria-label={item.done ? "Mark as not done" : "Mark as done"}
                  className="h-3.5 w-3.5"
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    item.done && "text-muted-foreground line-through"
                  )}
                >
                  {item.text}
                </span>
              </li>
            ))}
            {checklist.length > CARD_CHECKLIST_LIMIT ? (
              <li className="text-[11px] text-muted-foreground">
                +{checklist.length - CARD_CHECKLIST_LIMIT} more
              </li>
            ) : null}
          </ul>
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  checklistPct === 100 ? "bg-emerald-500" : "bg-primary/60"
                )}
                style={{ width: `${checklistPct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {doneCount}/{checklist.length}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", PRIORITY_STYLES[task.priority])}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </Badge>
          {aiState ? (
            <Badge
              variant="outline"
              className="gap-1 border-violet-500/40 text-[10px] uppercase tracking-wide text-violet-500"
              title={`AI prepared ${new Date(aiState.enrichedAt).toLocaleDateString("sv-SE")}`}
            >
              <Sparkles className="h-3 w-3" />
              AI
            </Badge>
          ) : null}
          {dueDate ? (
            <Badge
              variant="outline"
              className={cn(
                "gap-1 text-[10px] uppercase tracking-wide",
                overdue ? "border-destructive/50 text-destructive" : "border-border text-muted-foreground"
              )}
            >
              <CalendarDays className="h-3 w-3" />
              {overdue ? "Overdue " : ""}
              {dueDate}
            </Badge>
          ) : null}
          {commentCount > 0 ? (
            <span className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {commentCount}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {onAiAssist && !completed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-violet-500 hover:text-violet-400 sm:h-7 sm:w-7"
              onClick={(e) => {
                e.stopPropagation();
                onAiAssist(task);
              }}
              disabled={isMutating || aiBusy}
              aria-label="Prepare task with AI"
              title="Prepare task with AI"
            >
              {aiBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 px-3 text-xs font-medium sm:h-7 sm:px-2 sm:text-[11px]"
            onClick={(e) => {
              e.stopPropagation();
              onSetStatus(task.id, advance.status);
            }}
            disabled={isMutating}
          >
            {advance.label}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive sm:h-7 sm:w-7"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            disabled={isDeleting}
            aria-label="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function TaskBoard({ tasks, isLoading, onSetStatus, onDelete, onEdit, onToggleChecklistItem, onAiAssist, aiBusyTaskId, focusedTaskId, onArchiveDone, isMutating, isDeleting }: Props) {
  const [dragOverStatus, setDragOverStatus] = useState<BoardStatus | null>(null);
  const grouped = useMemo(() => {
    const next: Record<BoardStatus, TaskRow[]> = {
      open: [],
      in_progress: [],
      done: [],
    };
    for (const task of tasks) {
      const status = columnForTask(task);
      if (status) next[status].push(task);
    }
    // Active lanes surface the most urgent work first; Done keeps insertion
    // order (newest completions on top, matching the fetch order).
    const nowMs = Date.now();
    next.open.sort((a, b) => compareTasksByUrgency(a, b, nowMs));
    next.in_progress.sort((a, b) => compareTasksByUrgency(a, b, nowMs));
    return next;
  }, [tasks]);

  function handleDrop(event: DragEvent<HTMLElement>, status: BoardStatus) {
    event.preventDefault();
    setDragOverStatus(null);
    const taskId = event.dataTransfer.getData("text/task-id") || event.dataTransfer.getData("text/plain");
    if (!taskId) return;
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task || columnForTask(task) === status) return;
    onSetStatus(task.id, status);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tasks…
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory app-scroll pb-1 -mx-1 px-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:pb-0 lg:px-0">
      {COLUMNS.map((column) => {
        const Icon = column.icon;
        const columnTasks = grouped[column.status];
        const activeDrop = dragOverStatus === column.status;
        return (
          <section
            key={column.status}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOverStatus(column.status);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragOverStatus(null);
              }
            }}
            onDrop={(event) => handleDrop(event, column.status)}
            className={cn(
              "flex w-[min(85vw,320px)] shrink-0 snap-center flex-col rounded-2xl border bg-gradient-to-b p-3 transition-all lg:w-auto lg:min-h-[420px]",
              "max-h-[min(62vh,560px)] lg:max-h-none",
              column.accent,
              activeDrop && "scale-[1.01] border-primary/60 ring-2 ring-primary/20"
            )}
          >
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3 px-1">
              <div className="flex items-start gap-2">
                <div className="rounded-xl border border-border/70 bg-background/70 p-2">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold sm:text-sm">{column.title}</h2>
                  <p className="text-xs text-muted-foreground sm:block">{column.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {column.status === "done" && onArchiveDone && columnTasks.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                    onClick={onArchiveDone}
                    disabled={isMutating}
                    title="Move all done tasks to the archive"
                  >
                    <Archive className="h-3 w-3" />
                    <span className="hidden sm:inline">Archive all</span>
                  </Button>
                ) : null}
                <Badge variant="secondary" className="tabular-nums">
                  {columnTasks.length}
                </Badge>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto app-scroll pr-0.5">
              {columnTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background/45 p-4 text-center text-xs text-muted-foreground">
                  {column.empty}
                </div>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onSetStatus={onSetStatus}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onToggleChecklistItem={onToggleChecklistItem}
                    onAiAssist={onAiAssist}
                    aiBusy={aiBusyTaskId === task.id}
                    focused={focusedTaskId === task.id}
                    isMutating={isMutating}
                    isDeleting={isDeleting}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
