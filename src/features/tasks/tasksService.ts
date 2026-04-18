import type { TypedSupabaseClient } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/supabase";

export type TaskRow = Tables<"tasks">;
export type TaskStatus = TaskRow["status"];
export type TaskPriority = TaskRow["priority"];

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
}

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "archived",
];

export const TASK_PRIORITY_ORDER: TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

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
  return updateTask(supabase, id, {
    status: completed ? "done" : "open",
    completedAt: completed ? new Date().toISOString() : null,
  });
}

export async function deleteTask(
  supabase: TypedSupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
