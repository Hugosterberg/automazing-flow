import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, ListChecks, Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { formatRelativeTime } from "@/lib/relativeTime";
import { dateInputToEndOfDayIso, isoToLocalDateInputValue } from "@/lib/localDate";
import { ChecklistEditor, DueDatePicker, PriorityPicker } from "./TaskMetaControls";
import { cn } from "@/lib/utils";
import {
  getTaskAi,
  getTaskChecklist,
  getTaskComments,
  TASK_STATUS_LABELS,
  type TaskChecklistItem,
  type TaskComment,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from "./tasksService";

export interface TaskEditPatch {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueAt: string | null;
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
  /** Only present when the user changed the status in the dialog. */
  status?: TaskStatus;
}

const STATUS_OPTIONS: { status: TaskStatus; activeClass: string }[] = [
  { status: "open", activeClass: "bg-sky-500/15 text-sky-500 shadow-sm" },
  { status: "in_progress", activeClass: "bg-amber-500/15 text-amber-500 shadow-sm" },
  { status: "blocked", activeClass: "bg-destructive/15 text-destructive shadow-sm" },
  { status: "done", activeClass: "bg-emerald-500/15 text-emerald-500 shadow-sm" },
];

interface Props {
  task: TaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: TaskEditPatch) => Promise<unknown>;
  /**
   * Persists checklist/comment changes immediately (no Save needed), so
   * ticking off a requirement or posting a comment sticks even if the
   * dialog is closed without saving. Falls back to save-on-Save if omitted.
   */
  onQuickPatch?: (
    id: string,
    patch: { checklist: TaskChecklistItem[]; comments: TaskComment[] }
  ) => Promise<unknown>;
  /** Shown as the author on new comments (e.g. the signed-in email). */
  currentUser?: string | null;
  /**
   * Show the status picker. Off by default because the pipeline reuses this
   * dialog with its own stage names on the cards.
   */
  showStatus?: boolean;
  /**
   * Hand the task to AI (adds steps + an analysis comment) and return the
   * updated row so the dialog can refresh its checklist/comments in place —
   * without clobbering unsaved title/description edits.
   */
  onAiAssist?: (task: TaskRow) => Promise<TaskRow | null>;
  aiBusy?: boolean;
  /** Create a copy of this task (checklist reset, no comments). */
  onDuplicate?: (task: TaskRow) => Promise<unknown>;
  /**
   * Page path for shareable deep links (e.g. "/tasks"); when set, a
   * copy-link button puts `<origin><base>?task=<id>` on the clipboard.
   */
  shareUrlBase?: string;
}

function newCommentId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TaskEditDialog({
  task,
  open,
  onOpenChange,
  onSave,
  onQuickPatch,
  currentUser,
  showStatus,
  onAiAssist,
  aiBusy,
  onDuplicate,
  shareUrlBase,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("open");
  const [dueAt, setDueAt] = useState("");
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task || !open) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setStatus(task.status);
    setDueAt(task.due_at ? isoToLocalDateInputValue(task.due_at) : "");
    setChecklist(getTaskChecklist(task));
    setComments(getTaskComments(task));
    setCommentDraft("");
    setError(null);
  }, [task, open]);

  /**
   * Checklist and comments persist immediately: local state updates first
   * for a snappy UI, then the quick patch fires. On failure we surface the
   * error but keep the local state — Save can still persist it.
   */
  function persistLists(nextChecklist: TaskChecklistItem[], nextComments: TaskComment[]) {
    if (!task || !onQuickPatch) return;
    onQuickPatch(task.id, { checklist: nextChecklist, comments: nextComments }).catch(
      (err) => {
        setError(err instanceof Error ? err.message : "Could not save changes.");
      }
    );
  }

  function handleChecklistChange(next: TaskChecklistItem[]) {
    setChecklist(next);
    persistLists(next, comments);
  }

  function handleChecklistToggle(item: TaskChecklistItem, done: boolean) {
    const next = checklist.map((i) => (i.id === item.id ? { ...i, done } : i));
    setChecklist(next);
    persistLists(next, comments);
  }

  function addComment() {
    const text = commentDraft.trim();
    if (!text || !task) return;
    const next = [
      ...comments,
      {
        id: newCommentId(),
        text,
        createdAt: new Date().toISOString(),
        author: currentUser ?? null,
      },
    ];
    setComments(next);
    setCommentDraft("");
    persistLists(checklist, next);
  }

  function handleCommentKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      addComment();
    }
  }

  async function handleAiClick() {
    if (!task || !onAiAssist) return;
    const updated = await onAiAssist(task);
    // Refresh only the lists AI touched; keep in-progress field edits.
    if (updated) {
      setChecklist(getTaskChecklist(updated));
      setComments(getTaskComments(updated));
    }
  }

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
        checklist,
        comments,
        ...(status !== task.status ? { status } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  }

  const doneCount = checklist.filter((i) => i.done).length;
  const aiState = task ? getTaskAi(task) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span className="flex items-center gap-1.5">
              Task details
              {shareUrlBase && task ? (
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}${shareUrlBase}?task=${task.id}`;
                    void navigator.clipboard
                      .writeText(url)
                      .then(() => toast.success("Link copied."))
                      .catch(() => toast.error("Could not copy the link."));
                  }}
                  aria-label="Copy link to this task"
                  title="Copy link to this task"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
            {onAiAssist ? (
              <div className="flex items-center gap-1.5">
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
                <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-violet-500 hover:text-violet-400"
                onClick={() => void handleAiClick()}
                disabled={saving || aiBusy}
              >
                {aiBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiBusy ? "Analyzing…" : "Prepare with AI"}
              </Button>
              </div>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {showStatus ? (
            <div
              role="radiogroup"
              aria-label="Status"
              className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1"
            >
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.status}
                  type="button"
                  role="radio"
                  aria-checked={status === option.status}
                  disabled={saving}
                  onClick={() => setStatus(option.status)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    status === option.status
                      ? option.activeClass
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.status === "open" ? "To-do" : TASK_STATUS_LABELS[option.status]}
                </button>
              ))}
            </div>
          ) : null}
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
              placeholder="Add context, links, or notes…"
              rows={3}
              disabled={saving}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PriorityPicker value={priority} onChange={setPriority} disabled={saving} />
            <DueDatePicker value={dueAt} onChange={setDueAt} disabled={saving} />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <ListChecks className="h-3.5 w-3.5" />
              Checklist
              {checklist.length > 0 ? (
                <span className="tabular-nums text-muted-foreground">
                  {doneCount}/{checklist.length}
                </span>
              ) : null}
            </Label>
            <ChecklistEditor
              items={checklist}
              onChange={handleChecklistChange}
              onToggle={handleChecklistToggle}
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              Comments
              {comments.length > 0 ? (
                <span className="tabular-nums text-muted-foreground">
                  {comments.length}
                </span>
              ) : null}
            </Label>
            {comments.length > 0 ? (
              <ul className="space-y-1.5">
                {comments.map((c) => {
                  const isAi = c.author === "AI";
                  return (
                    <li
                      key={c.id}
                      className={cn(
                        "rounded-md border px-2.5 py-2",
                        isAi
                          ? "border-violet-500/30 bg-violet-500/5"
                          : "border-border/60 bg-muted/30"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-xs">{c.text}</p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        {isAi ? (
                          <Sparkles className="h-3 w-3 text-violet-500" aria-hidden />
                        ) : null}
                        {c.author ? `${c.author} · ` : ""}
                        {formatRelativeTime(c.createdAt) ?? c.createdAt.slice(0, 16)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="flex items-end gap-1.5">
              <Textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={handleCommentKeyDown}
                placeholder="Add a comment…"
                rows={1}
                disabled={saving}
                className="min-h-[2rem] text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                onClick={addComment}
                disabled={saving || !commentDraft.trim()}
                aria-label="Add comment"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {task?.created_at ? (
            <p className="text-[11px] text-muted-foreground">
              Created {formatRelativeTime(task.created_at) ?? task.created_at.slice(0, 10)}
            </p>
          ) : null}
          <DialogFooter>
            {onDuplicate && task ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mr-auto gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => void onDuplicate(task)}
                disabled={saving}
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
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
