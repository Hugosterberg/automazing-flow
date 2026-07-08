import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

export interface TaskAssistInput {
  business_profile_id: string;
  title: string;
  description?: string;
  priority?: string;
  dueAt?: string;
  checklist?: string[];
  comments?: string[];
  businessName?: string;
  businessDescription?: string;
  location?: string;
}

export interface TaskAssistResult {
  summary: string;
  steps: string[];
  info: string[];
  draft: string | null;
  questions: string[];
}

const cleanStrings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.map((s) => String(s ?? "").trim()).filter(Boolean) : [];

/** Ask the server to AI-prepare a task: plan, research, draft, questions. */
export async function fetchTaskAssist(
  input: TaskAssistInput
): Promise<{ result: TaskAssistResult; source: "ai" | "heuristic" }> {
  const res = await fetchWithTimeout(
    apiUrl("/api/tasks/ai-assist"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    45_000
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "AI could not analyze the task."));
  const raw = (body.result ?? {}) as Record<string, unknown>;
  return {
    result: {
      summary: String(raw.summary || "").trim(),
      steps: cleanStrings(raw.steps),
      info: cleanStrings(raw.info),
      draft: typeof raw.draft === "string" && raw.draft.trim() ? raw.draft.trim() : null,
      questions: cleanStrings(raw.questions),
    },
    source: body.source === "heuristic" ? "heuristic" : "ai",
  };
}
