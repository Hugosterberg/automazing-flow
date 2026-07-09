import { apiJson } from "@/lib/apiJson";

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
  const body = await apiJson<{ result?: unknown; source?: unknown }>(
    "/api/tasks/ai-assist",
    "AI could not analyze the task.",
    { body: input, timeoutMs: 45_000 }
  );
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
