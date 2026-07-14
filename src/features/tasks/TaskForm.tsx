import { useRef, useState, useEffect, type FormEvent, type RefObject } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { dateInputToEndOfDayIso } from "@/lib/localDate";
import { ChecklistEditor, DueDatePicker, PriorityPicker } from "./TaskMetaControls";
import type { TaskChecklistItem, TaskInput, TaskPriority } from "./tasksService";

interface Props {
  onSubmit: (input: TaskInput) => Promise<unknown>;
  disabled?: boolean;
  /** Pre-fill title (e.g. from Customers deep link). */
  initialTitle?: string;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  /** Phone: denser chrome, meta controls live under Detaljer. */
  compact?: boolean;
}

/**
 * Quick-add first: one row (title + Add, Enter submits) plus a compact meta
 * row. Description and requirements live behind the Details toggle so the
 * board stays above the fold; a counter on the toggle shows hidden content.
 */
export function TaskForm({ onSubmit, disabled, initialTitle, titleInputRef, compact = false }: Props) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTitle) setTitle(initialTitle);
  }, [initialTitle]);

  const detailCount =
    (description.trim() ? 1 : 0) +
    checklist.length +
    (compact && priority !== "medium" ? 1 : 0) +
    (compact && dueAt ? 1 : 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        title: trimmed,
        description: description.trim() || null,
        priority,
        // A deadline picked as "July 2" means "by the end of July 2" in the
        // user's timezone — not UTC midnight (which reads as overdue for
        // most of the due day east of UTC).
        dueAt: dueAt ? dateInputToEndOfDayIso(dueAt) : null,
        checklist,
      });
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueAt("");
      setChecklist([]);
      setShowDetails(false);
      // Keep focus in the title so several tasks can be added in a row.
      titleRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa uppgiften.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = disabled || submitting;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "rounded-lg border border-border bg-card",
        compact ? "space-y-2 p-2.5" : "space-y-2.5 p-3"
      )}
    >
      <div className="flex items-center gap-2">
        <Input
          ref={(node) => {
            titleRef.current = node;
            if (titleInputRef) titleInputRef.current = node;
          }}
          id="task-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={compact ? "Ny uppgift…" : "Ny uppgift — tryck Enter för att skapa…"}
          disabled={busy}
          autoComplete="off"
          aria-label="Uppgiftstitel"
          className={cn("min-w-0 flex-1", compact && "h-10")}
        />
        <Button
          type="submit"
          size="sm"
          className={cn("shrink-0 gap-1.5", compact ? "h-10 w-10 px-0" : "h-9")}
          disabled={busy || !title.trim()}
          aria-label="Lägg till uppgift"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {compact ? null : "Lägg till"}
        </Button>
      </div>

      {compact ? (
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-muted-foreground">
            Enter skapar · tryck Detaljer för prio och datum
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")}
            />
            Detaljer
            {!showDetails && detailCount > 0 ? (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] tabular-nums text-primary">
                {detailCount}
              </span>
            ) : null}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <PriorityPicker value={priority} onChange={setPriority} disabled={busy} />
          <DueDatePicker value={dueAt} onChange={setDueAt} disabled={busy} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-9 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")}
            />
            Detaljer
            {!showDetails && detailCount > 0 ? (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] tabular-nums text-primary">
                {detailCount}
              </span>
            ) : null}
          </Button>
        </div>
      )}

      {showDetails ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          {compact ? (
            <div className="flex flex-wrap items-center gap-2">
              <PriorityPicker value={priority} onChange={setPriority} disabled={busy} />
              <DueDatePicker value={dueAt} onChange={setDueAt} disabled={busy} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="task-description" className="text-xs">
              Beskrivning{" "}
              <span className="text-muted-foreground">(valfritt)</span>
            </Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Lägg till kontext eller acceptanskriterier…"
              rows={2}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Checklista{" "}
              <span className="text-muted-foreground">(valfritt)</span>
            </Label>
            <ChecklistEditor items={checklist} onChange={setChecklist} disabled={busy} />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
