/**
 * Shared AI reply drafting for reviews and DMs.
 *
 * Used by both the interactive endpoint (`POST /api/ai/reply-draft` in
 * aiRoutes) and the auto-reply automation (`server/automation/autoReply.ts`),
 * so prompt wording, model choice and the no-key fallback live in one place.
 *
 * Never throws: any OpenAI failure degrades to the deterministic fallback
 * draft so callers can always show/send something sensible.
 */

export interface ReplyDraftInput {
  kind: "review" | "dm";
  text: string;
  authorName?: string;
  rating?: number;
  businessName?: string;
  tone?: string;
  language?: string;
  /** Extra free-form guidance, e.g. from automation_settings.instructions. */
  instructions?: string;
}

export interface ReplyDraftResult {
  draft: string;
  source: "openai" | "fallback";
}

export function buildFallbackReplyDraft(input: ReplyDraftInput): string {
  const who = input.authorName?.trim() || (input.kind === "review" ? "the reviewer" : "the customer");
  if (input.kind === "review") {
    return `Thank you, ${who}, for taking the time to share your feedback${
      input.rating != null && input.rating >= 4 ? " — we're glad you had a good experience!" : "."
    } We appreciate it and would love to make things even better. Please reach out to us directly so we can help.`;
  }
  return `Hi ${who}, thanks for reaching out! ${
    input.text.trim().length > 0 ? "We'd be happy to help with that. " : ""
  }Could you share a few more details so we can assist you best?`;
}

export async function generateReplyDraft(
  input: ReplyDraftInput,
  openaiKey: string | null | undefined
): Promise<ReplyDraftResult> {
  const fallbackDraft = buildFallbackReplyDraft(input);
  const key = String(openaiKey || "").trim();
  if (!key) {
    return { draft: fallbackDraft, source: "fallback" };
  }

  const tone = String(input.tone || "warm, professional and concise").trim();
  const language = String(input.language || "the same language as the message").trim();
  const authorName = String(input.authorName || "").trim();
  const businessName = String(input.businessName || "").trim();
  const instructions = String(input.instructions || "").trim();

  try {
    const promptLines = [
      input.kind === "review"
        ? "Write a short public reply to this customer review on behalf of the business."
        : "Write a short, helpful reply to this customer direct message on behalf of the business.",
      `Tone: ${tone}. Language: ${language}.`,
      businessName ? `Business: ${businessName}.` : "",
      authorName ? `From: ${authorName}.` : "",
      input.rating != null ? `Star rating: ${input.rating}/5.` : "",
      input.kind === "review"
        ? "Acknowledge specifics, stay genuine, avoid generic filler, and keep it under 60 words."
        : "Be friendly and actionable, keep it under 50 words, and end with a clear next step.",
      instructions ? `Extra instructions from the business: ${instructions}` : "",
      "Return ONLY the reply text, no preamble or quotes.",
      "",
      `Message:\n${input.text}`,
    ].filter(Boolean);

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptLines.join("\n") }],
        temperature: 0.6,
        max_tokens: 220,
      }),
      // A hung OpenAI call must not stall the auto-reply cron sweep — fall
      // back to the template draft instead.
      signal: AbortSignal.timeout(20_000),
    });

    if (!aiRes.ok) {
      return { draft: fallbackDraft, source: "fallback" };
    }
    const aiData = await aiRes.json();
    const draft = String(aiData?.choices?.[0]?.message?.content || "").trim();
    return { draft: draft || fallbackDraft, source: draft ? "openai" : "fallback" };
  } catch {
    return { draft: fallbackDraft, source: "fallback" };
  }
}
