import { useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
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

/**
 * Minimal inline task creator. Title is required; description and priority
 * are optional. On successful submit we reset the form so the user can keep
 * adding without extra clicks.
 */
export function TaskForm({ onSubmit, disabled }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
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
      });
      setTitle("");
      setDescription("");
      setPriority("medium");
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
            <SelectTrigger id="task-priority" className="h-9 w-[140px] text-xs">
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

        <Button type="submit" size="sm" className="gap-1.5" disabled={busy}>
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add task
        </Button>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    </form>
  );
}
