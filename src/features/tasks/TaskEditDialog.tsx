import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateInputToEndOfDayIso, isoToLocalDateInputValue } from "@/lib/localDate";
import {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_ORDER,
  type TaskPriority,
  type TaskRow,
} from "./tasksService";

interface Props {
  task: TaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: {
    title: string;
    description: string | null;
    priority: TaskPriority;
    dueAt: string | null;
  }) => Promise<unknown>;
}

export function TaskEditDialog({ task, open, onOpenChange, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task || !open) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setDueAt(task.due_at ? isoToLocalDateInputValue(task.due_at) : "");
    setError(null);
  }, [task, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!task) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(task.id, {
        title: trimmed,
        description: description.trim() || null,
        priority,
        dueAt: dueAt ? dateInputToEndOfDayIso(dueAt) : null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-task-title" className="text-xs">
              Title
            </Label>
            <Input
              id="edit-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-task-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="edit-task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)} disabled={saving}>
                <SelectTrigger className="h-9 w-[130px] text-xs">
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
              <Label htmlFor="edit-task-due" className="text-xs flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                Due date
              </Label>
              <Input
                id="edit-task-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                disabled={saving}
                className="h-9 text-xs w-[150px]"
              />
            </div>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
