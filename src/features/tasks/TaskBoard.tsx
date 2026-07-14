import { useMemo, useState, type DragEvent } from "react";
import { Archive, CalendarDays, CheckCircle2, Clock3, Loader2, MessageSquare, PlayCircle, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsDesktopWorkspace } from "@/hooks/use-mobile";
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
    title: "Att göra",
    description: "Nya uppgifter hamnar här.",
    icon: Clock3,
    accent: "from-sky-500/15 to-sky-500/5 border-sky-500/25",
    empty: "Skapa en uppgift ovan så visas den här.",
  },
  {
    status: "in_progress",
    title: "Pågår",
    description: "Uppgifter du jobbar med just nu.",
    icon: PlayCircle,
    accent: "from-amber-500/15 to-amber-500/5 border-amber-500/25",
    empty: "Tryck Starta på ett kort när du börjar.",
  },
  {
    status: "done",
    title: "Klart",
    description: "Klara uppgifter redo att granskas.",
    icon: CheckCircle2,
    accent: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/25",
    empty: "Tryck Klar på kortet, eller flytta klara uppgifter hit.",
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
  compact = false,
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
  compact?: boolean;
}) {
  const overdue = isTaskOverdue(task);
  const dueDate = formatDueDate(task.due_at);
  const completed = task.status === "done";
  const checklist = getTaskChecklist(task);
  const doneCount = checklist.filter((item) => item.done).length;
  const commentCount = getTaskComments(task).length;
  const visibleChecklist = checklist.slice(0, compact ? 2 : CARD_CHECKLIST_LIMIT);
  const aiState = getTaskAi(task);
  const checklistPct = checklist.length > 0 ? Math.round((doneCount / checklist.length) * 100) : 0;

  // One contextual advance action instead of every possible move — drag or
  // the dialog's status picker covers the rest.
  const advance: { label: string; status: TaskStatus } = completed
    ? { label: "Öppna igen", status: "open" }
    : task.status === "in_progress"
      ? { label: "Klar", status: "done" }
      : { label: "Starta", status: "in_progress" };

  return (
    <article
      data-task-id={task.id}
      draggable={!isMutating && !compact}
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
        "group space-y-2 rounded-xl border border-border bg-card/95 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "pressable space-y-1.5 p-2.5" : "p-3 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
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
              "font-semibold leading-snug break-words",
              compact ? "text-sm" : "text-[15px] sm:text-sm",
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
          <p
            className={cn(
              "whitespace-pre-wrap break-words leading-relaxed text-muted-foreground",
              compact ? "line-clamp-1 text-xs" : "line-clamp-2 text-sm sm:text-xs"
            )}
          >
            {task.description}
          </p>
        ) : null}
      </div>

      {checklist.length > 0 && !compact ? (
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
                  aria-label={item.done ? "Markera som ej klar" : "Markera som klar"}
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
                +{checklist.length - CARD_CHECKLIST_LIMIT} till
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
      ) : checklist.length > 0 && compact ? (
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
      ) : null}

      <div className={cn("flex gap-2", compact ? "flex-col" : "items-center justify-between")}>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", PRIORITY_STYLES[task.priority])}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </Badge>
          {aiState ? (
            <Badge
              variant="outline"
              className="gap-1 border-violet-500/40 text-[10px] uppercase tracking-wide text-violet-500"
              title={`AI förberedde ${new Date(aiState.enrichedAt).toLocaleDateString("sv-SE")}`}
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
              {overdue ? "Försenad " : ""}
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

        <div
          className={cn(
            "flex shrink-0 items-center gap-1",
            compact
              ? "justify-stretch"
              : "opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          )}
        >
          {onAiAssist && !completed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "p-0 text-violet-500 hover:text-violet-400",
                compact ? "h-9 w-9" : "h-9 w-9 sm:h-7 sm:w-7"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onAiAssist(task);
              }}
              disabled={isMutating || aiBusy}
              aria-label="Förbered uppgift med AI"
              title="Förbered uppgift med AI"
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
            className={cn(
              "text-xs font-medium",
              compact ? "h-9 min-w-0 flex-1 px-3" : "h-9 px-3 sm:h-7 sm:px-2 sm:text-[11px]"
            )}
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
            className={cn(
              "p-0 text-muted-foreground hover:text-destructive",
              compact ? "h-9 w-9" : "h-9 w-9 sm:h-7 sm:w-7"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            disabled={isDeleting}
            aria-label="Ta bort uppgift"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function TaskBoard({ tasks, isLoading, onSetStatus, onDelete, onEdit, onToggleChecklistItem, onAiAssist, aiBusyTaskId, focusedTaskId, onArchiveDone, isMutating, isDeleting }: Props) {
  const isDesktopBoard = useIsDesktopWorkspace();
  const [dragOverStatus, setDragOverStatus] = useState<BoardStatus | null>(null);
  const [activeLane, setActiveLane] = useState<BoardStatus>("open");
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
        Laddar uppgifter…
      </div>
    );
  }

  const visibleColumns = isDesktopBoard
    ? COLUMNS
    : COLUMNS.filter((column) => column.status === activeLane);

  return (
    <div className="min-w-0 space-y-2">
      {!isDesktopBoard ? (
        <div
          className="grid grid-cols-3 gap-0.5 rounded-xl border border-border/70 bg-background/50 p-0.5"
          role="tablist"
          aria-label="Uppgiftskolumner"
        >
          {COLUMNS.map((column) => {
            const Icon = column.icon;
            const active = activeLane === column.status;
            const count = grouped[column.status].length;
            return (
              <button
                key={column.status}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveLane(column.status)}
                className={cn(
                  "pressable flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-center transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="truncate text-xs font-semibold">{column.title}</span>
                </span>
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    active ? "text-foreground/70" : "text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className={cn(
          "min-w-0",
          isDesktopBoard ? "grid grid-cols-3 gap-4" : "block"
        )}
      >
        {visibleColumns.map((column) => {
          const Icon = column.icon;
          const columnTasks = grouped[column.status];
          const activeDrop = dragOverStatus === column.status;
          const showMobileArchive =
            !isDesktopBoard &&
            column.status === "done" &&
            onArchiveDone &&
            columnTasks.length > 0;
          return (
            <section
              key={column.status}
              data-task-lane={column.status}
              onDragOver={(event) => {
                if (!isDesktopBoard) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverStatus(column.status);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragOverStatus(null);
                }
              }}
              onDrop={(event) => {
                if (!isDesktopBoard) return;
                handleDrop(event, column.status);
              }}
              className={cn(
                "flex w-full min-w-0 flex-col transition-all",
                isDesktopBoard
                  ? "min-h-[420px] rounded-2xl border bg-gradient-to-b p-3"
                  : "max-h-[min(68vh,640px)] rounded-xl border border-border/50 bg-background/30 p-2",
                isDesktopBoard && column.accent,
                activeDrop && "border-primary/60 ring-2 ring-primary/20"
              )}
            >
              {isDesktopBoard ? (
                <div className="mb-3 flex shrink-0 items-start justify-between gap-3 px-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="rounded-xl border border-border/70 bg-background/70 p-2">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold sm:text-sm">{column.title}</h2>
                      <p className="text-xs text-muted-foreground">{column.description}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {column.status === "done" && onArchiveDone && columnTasks.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                        onClick={onArchiveDone}
                        disabled={isMutating}
                        title="Arkivera alla klara uppgifter"
                      >
                        <Archive className="h-3 w-3" />
                        <span className="hidden sm:inline">Arkivera alla</span>
                      </Button>
                    ) : null}
                    <Badge variant="secondary" className="tabular-nums">
                      {columnTasks.length}
                    </Badge>
                  </div>
                </div>
              ) : showMobileArchive ? (
                <div className="mb-1.5 flex shrink-0 justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
                    onClick={onArchiveDone}
                    disabled={isMutating}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Arkivera alla
                  </Button>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto app-scroll pr-0.5">
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
                      compact={!isDesktopBoard}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
