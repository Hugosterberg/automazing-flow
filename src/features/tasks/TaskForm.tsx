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
}

/**
 * Quick-add first: one row (title + Add, Enter submits) plus a compact meta
 * row. Description and requirements live behind the Details toggle so the
 * board stays above the fold; a counter on the toggle shows hidden content.
 */
export function TaskForm({ onSubmit, disabled, initialTitle, titleInputRef }: Props) {
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

  const detailCount = (description.trim() ? 1 : 0) + checklist.length;

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
      className="space-y-2.5 rounded-lg border border-border bg-card p-3"
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
          placeholder="Ny uppgift — tryck Enter för att skapa…"
          disabled={busy}
          autoComplete="off"
          aria-label="Uppgiftstitel"
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 shrink-0 gap-1.5"
          disabled={busy || !title.trim()}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Lägg till
        </Button>
      </div>

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

      {showDetails ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
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
