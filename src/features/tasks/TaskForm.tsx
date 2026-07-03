import { useState, type FormEvent } from "react";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateInputToEndOfDayIso } from "@/lib/localDate";
import {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
  type TaskInput,
  type TaskPriority,
} from "./tasksService";

interface Props {
  onSubmit: (input: TaskInput) => Promise<unknown>;
  disabled?: boolean;
}

export function TaskForm({ onSubmit, disabled }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState("");
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
      });
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueAt("");
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="task-priority" className="text-xs">
            Priority
          </Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as TaskPriority)}
            disabled={busy}
          >
            <SelectTrigger id="task-priority" className="h-9 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-due" className="text-xs flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Due date{" "}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="task-due"
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            disabled={busy}
            className="h-9 text-xs w-[150px]"
          />
        </div>

        <Button type="submit" size="sm" className="gap-1.5 h-9" disabled={busy}>
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add task
        </Button>

        {error ? (
          <p className="text-xs text-destructive w-full">{error}</p>
        ) : null}
      </div>
    </form>
  );
}
