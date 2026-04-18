/**
 * Thin wrapper around the OpenAI Chat Completions API. Isolated in one
 * module so LLM provider changes (different vendor, Vercel AI Gateway,
 * local model) only touch this file.
 *
 * Uses native `fetch` rather than the `openai` SDK to stay aligned with
 * the rest of the server (see `aiRoutes.ts`) and to avoid adding a
 * runtime dependency.
 */

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 25_000;

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigError";
  }
}

export class LlmRequestError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmRequestError";
    this.status = status;
  }
}

function getOpenAiKey(): string {
  return (process.env.OPENAI_API_KEY || "").trim();
}

export function hasOpenAiKey(): boolean {
  return getOpenAiKey().length > 0;
}

export interface ChatJsonRequest {
  system: string;
  user: string;
  /** 0..2, lower = more deterministic. Defaults to 0.6 for suggestion-style prompts. */
  temperature?: number;
  model?: string;
  /** Hard cap on output tokens. Defaults to 900 — enough for a handful of short recs. */
  maxTokens?: number;
  /** Abort the request after this long. Defaults to 25 s. */
  timeoutMs?: number;
}

/**
 * Run a chat completion that must return a JSON object. Uses OpenAI's
 * `response_format: { type: "json_object" }` so we can parse the reply
 * directly instead of post-processing markdown-wrapped output.
 *
 * Throws `LlmConfigError` when no API key is present (callers should
 * check `hasOpenAiKey()` first if they want to fall back gracefully).
 * Throws `LlmRequestError` for transport or API-level failures.
 */
export async function chatJson(
  req: ChatJsonRequest
): Promise<Record<string, unknown>> {
  const key = getOpenAiKey();
  if (!key) {
    throw new LlmConfigError("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    req.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: req.model ?? DEFAULT_MODEL,
        temperature: req.temperature ?? 0.6,
        max_tokens: req.maxTokens ?? 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LlmRequestError(
        `OpenAI returned ${res.status}: ${text.slice(0, 200)}`,
        res.status
      );
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new LlmRequestError("OpenAI returned an empty completion");
    }

    try {
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object") {
        throw new LlmRequestError("OpenAI JSON reply was not an object");
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      throw new LlmRequestError(
        `Could not parse OpenAI JSON reply: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } catch (err) {
    if (err instanceof LlmRequestError || err instanceof LlmConfigError) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmRequestError("OpenAI request timed out");
    }
    throw new LlmRequestError(
      `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }
}
