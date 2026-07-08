/**
 * AI task assist for the Tasks board. Given a task (title, description,
 * checklist, comments) and the tenant's business context, produce everything
 * a human needs to finish the task as fast as possible: a crisp summary,
 * concrete step-by-step plan, relevant facts/pointers, a ready-to-use draft
 * when the task involves writing something, and the questions that are still
 * blocking.
 *
 * Pure: prompt building, response parsing and a heuristic fallback (used when
 * no OpenAI key is configured) all live here and are unit-tested.
 */

export interface TaskAssistContext {
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
  /** What actually needs to be done, 1–2 sentences. */
  summary: string;
  /** Concrete, ordered action steps (merged into the task checklist). */
  steps: string[];
  /** Useful facts, best practices, links-to-look-up — the "research". */
  info: string[];
  /** Ready-to-use draft when the task is a writing task, else null. */
  draft: string | null;
  /** Missing information that would unblock the task (0–3). */
  questions: string[];
}

const MAX_STEPS = 7;
const MAX_INFO = 6;
const MAX_QUESTIONS = 3;

export function buildTaskAssistPrompt(ctx: TaskAssistContext): string {
  const businessLines = [
    ctx.businessName ? `Business: ${ctx.businessName}` : "",
    ctx.businessDescription ? `About the business: ${ctx.businessDescription}` : "",
    ctx.location ? `Location/market: ${ctx.location}` : "",
  ].filter(Boolean);

  const taskLines = [
    `Title: ${ctx.title}`,
    ctx.description ? `Description: ${ctx.description}` : "",
    ctx.priority ? `Priority: ${ctx.priority}` : "",
    ctx.dueAt ? `Due: ${ctx.dueAt}` : "",
    ctx.checklist && ctx.checklist.length
      ? `Existing checklist:\n${ctx.checklist.map((c) => `- ${c}`).join("\n")}`
      : "",
    ctx.comments && ctx.comments.length
      ? `Comments so far:\n${ctx.comments.map((c) => `- ${c}`).join("\n")}`
      : "",
  ].filter(Boolean);

  return (
    `You are a sharp operations assistant for a small business. Prepare the task below so a human ` +
    `can complete it as fast as possible. Be concrete and specific to THIS task — no generic filler.\n\n` +
    (businessLines.length ? `${businessLines.join("\n")}\n\n` : "") +
    `TASK:\n${taskLines.join("\n")}\n\n` +
    `Return ONLY JSON with these keys:\n` +
    `"summary": what needs to be done and what "done" looks like (1-2 sentences).\n` +
    `"steps": ${MAX_STEPS} or fewer short, ordered, concrete action steps. Do not repeat existing checklist items.\n` +
    `"info": up to ${MAX_INFO} bullet points of useful, specific information — relevant facts, best practices, ` +
    `things or places to look up, pitfalls. Everything the person would otherwise have to research themselves.\n` +
    `"draft": if the task involves writing something (email, message, post, reply, offer), a complete ready-to-use ` +
    `draft; otherwise null. Never invent specific facts, prices or contact details — use [PLACEHOLDERS] for unknowns.\n` +
    `"questions": up to ${MAX_QUESTIONS} missing pieces of information that block or slow down the task (empty array if none).\n` +
    `Respond in the same language as the task title/description.\n` +
    `{"summary":"...","steps":["..."],"info":["..."],"draft":null,"questions":["..."]}`
  );
}

function cleanStringArray(raw: unknown, max: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const text = String(entry ?? "").trim();
    if (!text) continue;
    out.push(text.slice(0, maxLen));
    if (out.length >= max) break;
  }
  return out;
}

export function parseTaskAssist(content: string): TaskAssistResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;
  const summary = String(r.summary || "").trim().slice(0, 600);
  const steps = cleanStringArray(r.steps, MAX_STEPS, 200);
  const info = cleanStringArray(r.info, MAX_INFO, 400);
  const questions = cleanStringArray(r.questions, MAX_QUESTIONS, 240);
  const draft =
    typeof r.draft === "string" && r.draft.trim() ? r.draft.trim().slice(0, 4000) : null;
  if (!summary && steps.length === 0 && info.length === 0) return null;
  return { summary, steps, info, draft, questions };
}

/** Sensible generic breakdown when no OpenAI key is configured. */
export function heuristicTaskAssist(ctx: TaskAssistContext): TaskAssistResult {
  const hasChecklist = Boolean(ctx.checklist && ctx.checklist.length);
  return {
    summary: `Complete "${ctx.title}"${ctx.dueAt ? ` before ${ctx.dueAt.slice(0, 10)}` : ""}. Define what "done" looks like before starting.`,
    steps: hasChecklist
      ? [
          "Review the existing requirements and order them by dependency.",
          "Gather everything needed before starting (access, info, materials).",
          "Work through the requirements one at a time and tick them off.",
          "Verify the result against the task description before closing.",
        ]
      : [
          "Write down what a finished result looks like (1-2 sentences).",
          "Break the task into 3-5 small requirements and add them as checklist items.",
          "Gather everything needed before starting (access, info, materials).",
          "Do the work one requirement at a time and tick them off.",
          "Verify the result against the task description before closing.",
        ],
    info: [
      "Connect an OpenAI key in Settings to get task-specific analysis, research and drafts here.",
    ],
    draft: null,
    questions: [],
  };
}
