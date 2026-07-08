import type { TypedSupabaseClient } from "@/lib/supabase";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/types/supabase";

export type TaskRow = Tables<"tasks">;
export type TaskStatus = TaskRow["status"];
export type TaskPriority = TaskRow["priority"];

/** A short requirement/sub-item on a task, stored in `metadata.checklist`. */
export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** A free-form comment on a task, stored in `metadata.comments`. */
export interface TaskComment {
  id: string;
  text: string;
  createdAt: string;
  author?: string | null;
}

/**
 * Marker that AI has analyzed/prepared this task, stored in `metadata.ai`.
 * The actual output lives where humans work with it (checklist items and an
 * AI comment) — this only powers the badge and "already enriched" checks.
 */
export interface TaskAiState {
  enrichedAt: string;
  source: "ai" | "heuristic";
}

/**
 * Input shape for creating a new task from the UI. We keep it narrower than
 * the raw Insert type on purpose — tenants, actor, and timestamps are
 * derived inside the service, never accepted from untrusted callers.
 */
export interface TaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: string | null;
  /** Source module tag. Useful for filtering ("connections", "reviews"…). */
  module?: string | null;
  checklist?: TaskChecklistItem[];
  comments?: TaskComment[];
  ai?: TaskAiState | null;
}

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "archived",
];

/**
 * Priorities offered in the UI. The DB enum still contains "urgent" so
 * legacy rows keep rendering, but new/edited tasks only pick from these
 * three — urgent collapsed into "high" to keep the choice simple.
 */
export const TASK_PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  archived: "Archived",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/**
 * Task metadata is wholly owned by the UI today (the server only reads
 * tasks), so the checklist and comments live as plain arrays under
 * `metadata.checklist` / `metadata.comments`. Parsing is defensive: rows
 * created elsewhere (or hand-edited) simply yield empty lists.
 */
function metadataRecord(metadata: Json): Record<string, Json | undefined> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};
}

export function newChecklistItem(text: string): TaskChecklistItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { id, text: text.trim(), done: false };
}

export function getTaskChecklist(task: Pick<TaskRow, "metadata">): TaskChecklistItem[] {
  const raw = metadataRecord(task.metadata).checklist;
  if (!Array.isArray(raw)) return [];
  const items: TaskChecklistItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { id, text, done } = entry as Record<string, Json | undefined>;
    if (typeof id !== "string" || typeof text !== "string") continue;
    items.push({ id, text, done: done === true });
  }
  return items;
}

export function getTaskComments(task: Pick<TaskRow, "metadata">): TaskComment[] {
  const raw = metadataRecord(task.metadata).comments;
  if (!Array.isArray(raw)) return [];
  const comments: TaskComment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { id, text, createdAt, author } = entry as Record<string, Json | undefined>;
    if (typeof id !== "string" || typeof text !== "string" || typeof createdAt !== "string") continue;
    comments.push({ id, text, createdAt, author: typeof author === "string" ? author : null });
  }
  return comments;
}

export function getTaskAi(task: Pick<TaskRow, "metadata">): TaskAiState | null {
  const raw = metadataRecord(task.metadata).ai;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { enrichedAt, source } = raw as Record<string, Json | undefined>;
  if (typeof enrichedAt !== "string") return null;
  return { enrichedAt, source: source === "heuristic" ? "heuristic" : "ai" };
}

function serializeChecklist(items: TaskChecklistItem[]): Json {
  return items.map((i) => ({ id: i.id, text: i.text.trim(), done: i.done }));
}

function serializeComments(comments: TaskComment[]): Json {
  return comments.map((c) => ({
    id: c.id,
    text: c.text.trim(),
    createdAt: c.createdAt,
    author: c.author ?? null,
  }));
}

function serializeAi(ai: TaskAiState | null): Json {
  return ai ? { enrichedAt: ai.enrichedAt, source: ai.source } : null;
}

export async function listTasks(
  supabase: TypedSupabaseClient,
  businessProfileId: string
): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("business_profile_id", businessProfileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTask(
  supabase: TypedSupabaseClient,
  businessProfileId: string,
  input: TaskInput,
  createdBy: string | null
): Promise<TaskRow> {
  const row: TablesInsert<"tasks"> = {
    business_profile_id: businessProfileId,
    created_by: createdBy,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    priority: input.priority ?? "medium",
    status: input.status ?? "open",
    due_at: input.dueAt ?? null,
    module: input.module ?? null,
  };
  if (input.checklist?.length || input.comments?.length || input.ai) {
    row.metadata = {
      checklist: serializeChecklist(input.checklist ?? []),
      comments: serializeComments(input.comments ?? []),
      ai: serializeAi(input.ai ?? null),
    };
  }
  const { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(
  supabase: TypedSupabaseClient,
  id: string,
  patch: Partial<TaskInput> & { completedAt?: string | null }
): Promise<TaskRow> {
  const row: TablesUpdate<"tasks"> = {};
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.description !== undefined)
    row.description = patch.description?.trim() || null;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt;
  if (patch.module !== undefined) row.module = patch.module;
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;
  // Metadata keys merge read-modify-write style: patching just the checklist
  // leaves comments and the AI marker untouched. Costs one extra read, but
  // removes the "partial patch wipes the other lists" foot-gun.
  if (patch.checklist !== undefined || patch.comments !== undefined || patch.ai !== undefined) {
    const { data: current, error: readError } = await supabase
      .from("tasks")
      .select("metadata")
      .eq("id", id)
      .single();
    if (readError) throw readError;
    const base = metadataRecord(current?.metadata ?? null);
    row.metadata = {
      ...base,
      ...(patch.checklist !== undefined ? { checklist: serializeChecklist(patch.checklist) } : {}),
      ...(patch.comments !== undefined ? { comments: serializeComments(patch.comments) } : {}),
      ...(patch.ai !== undefined ? { ai: serializeAi(patch.ai) } : {}),
    };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Convenience wrapper: flipping a task between done/open also syncs
 * completed_at so the DB and the UI badge stay consistent.
 */
export async function setTaskCompleted(
  supabase: TypedSupabaseClient,
  id: string,
  completed: boolean
): Promise<TaskRow> {
  return setTaskStatus(supabase, id, completed ? "done" : "open");
}

export async function setTaskStatus(
  supabase: TypedSupabaseClient,
  id: string,
  status: TaskStatus
): Promise<TaskRow> {
  return updateTask(supabase, id, {
    status,
    completedAt: status === "done" ? new Date().toISOString() : null,
  });
}

export async function deleteTask(
  supabase: TypedSupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
