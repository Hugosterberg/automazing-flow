import { useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { dateInputToEndOfDayIso } from "@/lib/localDate";
import { ChecklistEditor, DueDatePicker, PriorityPicker } from "./TaskMetaControls";
import type { TaskChecklistItem, TaskInput, TaskPriority } from "./tasksService";

interface Props {
  onSubmit: (input: TaskInput) => Promise<unknown>;
  disabled?: boolean;
}

export function TaskForm({ onSubmit, disabled }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create task.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = disabled || submitting;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="task-title" className="text-xs">
          Title
        </Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          disabled={busy}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-description" className="text-xs">
          Description{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add context or acceptance criteria…"
          rows={2}
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          Requirements{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <ChecklistEditor items={checklist} onChange={setChecklist} disabled={busy} />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <PriorityPicker value={priority} onChange={setPriority} disabled={busy} />
        <DueDatePicker value={dueAt} onChange={setDueAt} disabled={busy} />

        <Button
          type="submit"
          size="sm"
          className="ml-auto h-9 gap-1.5"
          disabled={busy}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add task
        </Button>

        {error ? (
          <p className="w-full text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    </form>
  );
}
