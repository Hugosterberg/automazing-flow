import { useState, type KeyboardEvent } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isoToLocalDateInputValue } from "@/lib/localDate";
import {
  newChecklistItem,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
  type TaskChecklistItem,
  type TaskPriority,
} from "./tasksService";

/**
 * Shared field controls for the task form and the task detail dialog:
 * a segmented low/medium/high priority picker, a popover calendar for the
 * optional due date, and a checklist editor for short requirements.
 */

const PRIORITY_SEGMENT_STYLES: Record<string, { active: string; dot: string }> = {
  low: {
    active: "bg-background text-foreground shadow-sm",
    dot: "bg-muted-foreground",
  },
  medium: {
    active: "bg-info/15 text-info shadow-sm",
    dot: "bg-info",
  },
  high: {
    active: "bg-warning/15 text-warning shadow-sm",
    dot: "bg-warning",
  },
};

export function PriorityPicker({
  value,
  onChange,
  disabled,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  disabled?: boolean;
}) {
  // Legacy "urgent" rows render as High; saving writes "high" back.
  const effective: TaskPriority = value === "urgent" ? "high" : value;
  return (
    <div
      role="radiogroup"
      aria-label="Priority"
      className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1"
    >
      {TASK_PRIORITY_ORDER.map((p) => {
        const selected = effective === p;
        const styles = PRIORITY_SEGMENT_STYLES[p] ?? PRIORITY_SEGMENT_STYLES.low;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(p)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? styles.active
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
            {TASK_PRIORITY_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}

function parseDateInputValue(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateInputValueFromToday(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDueLabel(date: Date): string {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Popover calendar for the optional due date. Value is a `YYYY-MM-DD`
 * date-input string (or "") so callers keep using the localDate helpers
 * for the end-of-day ISO conversion.
 */
export function DueDatePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDateInputValue(value) : undefined;
  // "Overdue" here means the picked day already ended in local time.
  const isPast =
    selected !== undefined &&
    new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 23, 59, 59, 999) <
      new Date();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 justify-start gap-1.5 px-3 text-xs font-normal",
            !selected && "text-muted-foreground",
            isPast && "border-destructive/40 text-destructive"
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {selected ? `Due ${formatDueLabel(selected)}` : "Due date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? isoToLocalDateInputValue(date.toISOString()) : "");
            setOpen(false);
          }}
        />
        <div className="flex items-center gap-1 border-t border-border px-2 py-2">
          {(
            [
              ["Today", 0],
              ["Tomorrow", 1],
              ["Next week", 7],
            ] as const
          ).map(([label, days]) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                onChange(dateInputValueFromToday(days));
                setOpen(false);
              }}
            >
              {label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs text-muted-foreground"
            disabled={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Checklist editor: existing items with optional done-toggling, remove
 * buttons, and an input + plus button for adding short requirements.
 */
export function ChecklistEditor({
  items,
  onChange,
  onToggle,
  disabled,
  placeholder = "Add a requirement…",
}: {
  items: TaskChecklistItem[];
  onChange: (items: TaskChecklistItem[]) => void;
  /** When provided, items render with checkboxes and this handles toggling. */
  onToggle?: (item: TaskChecklistItem, done: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function addDraft() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, newChecklistItem(text)]);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    // Enter adds the requirement instead of submitting the surrounding form.
    e.preventDefault();
    addDraft();
  }

  return (
    <div className="space-y-1.5">
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="group/check flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5"
            >
              {onToggle ? (
                <Checkbox
                  checked={item.done}
                  onCheckedChange={(v) => onToggle(item, Boolean(v))}
                  disabled={disabled}
                  aria-label={item.done ? "Mark as not done" : "Mark as done"}
                  className="h-3.5 w-3.5"
                />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 break-words text-xs",
                  item.done && "text-muted-foreground line-through"
                )}
              >
                {item.text}
              </span>
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                disabled={disabled}
                aria-label={`Remove "${item.text}"`}
                className="text-muted-foreground/50 transition-opacity hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover/check:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="h-8 text-xs"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          onClick={addDraft}
          disabled={disabled || !draft.trim()}
          aria-label="Add requirement"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
