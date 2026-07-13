import { formatRelativeTime } from "@/lib/relativeTime";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITY_LABELS,
  type TaskPriority,
  type TaskRow,
} from "./tasksService";

interface Props {
  tasks: TaskRow[];
  isLoading?: boolean;
  onToggleComplete: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  isToggling?: boolean;
  isDeleting?: boolean;
  emptyMessage?: string;
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "border-border text-muted-foreground",
  medium: "border-info/40 text-info",
  high: "border-warning/50 text-warning",
  urgent: "border-destructive/50 text-destructive",
};

function safeRelative(iso: string | null): string | null {
  if (!iso) return null;
  return formatRelativeTime(iso) ?? iso.slice(0, 19);
}

/**
 * Plain task list. Presentational: caller owns the mutation wiring and
 * decides which tasks to pass in (e.g. filtered to open-only).
 */
export function TaskList({
  tasks,
  isLoading,
  onToggleComplete,
  onDelete,
  isToggling,
  isDeleting,
  emptyMessage = "Inga uppgifter ännu.",
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Laddar uppgifter…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const completed = t.status === "done";
        const createdAgo = safeRelative(t.created_at);
        return (
          <li
            key={t.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <Checkbox
              checked={completed}
              onCheckedChange={(v) => onToggleComplete(t.id, Boolean(v))}
              disabled={isToggling}
              aria-label={completed ? "Mark as open" : "Mark as done"}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cn(
                    "text-sm font-medium break-words",
                    completed && "text-muted-foreground line-through"
                  )}
                >
                  {t.title}
                </p>
                <Badge
                  variant="outline"
                  className={cn("text-[11px] uppercase", PRIORITY_STYLES[t.priority])}
                >
                  {TASK_PRIORITY_LABELS[t.priority]}
                </Badge>
              </div>
              {t.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {t.description}
                </p>
              ) : null}
              {createdAgo ? (
                <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  Created {createdAgo}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(t.id)}
              disabled={isDeleting}
              aria-label="Delete task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
