import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { logActivity, ACTIVITY_FEED_KEY } from "@/features/activity";
import {
  createTask,
  deleteTask,
  listTasks,
  setTaskCompleted,
  setTaskStatus,
  updateTask,
  type TaskInput,
  type TaskRow,
  type TaskStatus,
} from "./tasksService";

export const TASKS_KEY = ["tasks"] as const;

/**
 * Tenant-scoped tasks. Mirrors the connections/business-profiles hook shape:
 * one query, a small set of mutations that invalidate the query + activity
 * feed on success. Mutations are fire-and-forget for activity logging —
 * failures warn, they never block the primary write.
 */
export function useTasks(businessProfileId: string | null | undefined) {
  const { enabled, user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<TaskRow[]>({
    queryKey: [...TASKS_KEY, user?.id ?? null, businessProfileId ?? null],
    queryFn: async () => {
      if (!supabase || !enabled || !businessProfileId) return [];
      return listTasks(supabase, businessProfileId);
    },
    enabled: Boolean(supabase && enabled && businessProfileId),
    staleTime: 20_000,
  });

  const createMut = useMutation({
    mutationFn: async (input: TaskInput) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      if (!businessProfileId) throw new Error("No active business profile.");
      const task = await createTask(
        supabase,
        businessProfileId,
        input,
        user?.id ?? null
      );
      void logActivity(supabase, {
        businessProfileId,
        module: "tasks",
        eventType: "task.created",
        subjectType: "task",
        subjectId: task.id,
        severity: "info",
        summary: `Created task "${task.title}"`,
        payload: { priority: task.priority },
      });
      return task;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TASKS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<TaskInput>;
    }) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      return updateTask(supabase, id, patch);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TASKS_KEY });
    },
  });

  const toggleCompleteMut = useMutation({
    mutationFn: async ({
      id,
      completed,
    }: {
      id: string;
      completed: boolean;
    }) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      const task = await setTaskCompleted(supabase, id, completed);
      if (completed && businessProfileId) {
        void logActivity(supabase, {
          businessProfileId,
          module: "tasks",
          eventType: "task.completed",
          subjectType: "task",
          subjectId: id,
          severity: "success",
          summary: `Completed task "${task.title}"`,
        });
      }
      return task;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TASKS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const setStatusMut = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: TaskStatus;
    }) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      const task = await setTaskStatus(supabase, id, status);
      if (status === "done" && businessProfileId) {
        void logActivity(supabase, {
          businessProfileId,
          module: "tasks",
          eventType: "task.completed",
          subjectType: "task",
          subjectId: id,
          severity: "success",
          summary: `Completed task "${task.title}"`,
        });
      }
      return task;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TASKS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      if (!supabase || !enabled) throw new Error("Not signed in.");
      await deleteTask(supabase, id);
      if (businessProfileId) {
        void logActivity(supabase, {
          businessProfileId,
          module: "tasks",
          eventType: "task.deleted",
          subjectType: "task",
          subjectId: id,
          severity: "info",
          summary: "Deleted a task",
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TASKS_KEY });
      void qc.invalidateQueries({ queryKey: ACTIVITY_FEED_KEY });
    },
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    createTask: createMut.mutateAsync,
    isCreating: createMut.isPending,
    updateTask: updateMut.mutateAsync,
    isUpdating: updateMut.isPending,
    setCompleted: toggleCompleteMut.mutateAsync,
    isToggling: toggleCompleteMut.isPending,
    setStatus: setStatusMut.mutateAsync,
    isSettingStatus: setStatusMut.isPending,
    deleteTask: deleteMut.mutateAsync,
    isDeleting: deleteMut.isPending,
  };
}
