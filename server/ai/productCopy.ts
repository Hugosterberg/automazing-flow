/**
 * AI-assisted product description/tag suggestions for the product-content
 * automation (ecommerce). Mirrors `replyDraft.ts`: never throws, degrades to
 * a deterministic heuristic when no OpenAI key is configured or the call
 * fails, so the automation always has something to show for approval.
 */

export interface ProductCopyInput {
  title: string;
  description: string;
  vendor?: string | null;
  productType?: string | null;
  tags: string[];
}

export interface ProductCopyResult {
  description: string;
  tags: string[];
  source: "openai" | "fallback";
}

const MAX_TAGS = 8;

function heuristicTags(input: ProductCopyInput): string[] {
  const existing = input.tags.filter(Boolean);
  if (existing.length >= 3) return existing.slice(0, MAX_TAGS);
  const extra = [input.productType, input.vendor].filter((v): v is string => Boolean(v?.trim()));
  return [...new Set([...existing, ...extra])].slice(0, MAX_TAGS);
}

export function buildFallbackProductCopy(input: ProductCopyInput): ProductCopyResult {
  const title = input.title.trim() || "This product";
  const kind = input.productType?.trim();
  const vendor = input.vendor?.trim();
  const description =
    `${title} ${kind ? `is a ${kind.toLowerCase()} ` : "is "}` +
    `${vendor ? `from ${vendor} ` : ""}` +
    `designed with quality and everyday use in mind. A great choice whether you're buying for yourself or as a gift.`;
  return { description: description.replace(/\s+/g, " ").trim(), tags: heuristicTags(input), source: "fallback" };
}

/**
 * Generate an improved product description + SEO tags via OpenAI, falling
 * back to a deterministic template on any failure or missing key. The
 * result is always a *suggestion* — callers store it as a draft and only
 * write it back to Shopify/the catalogue after explicit user approval.
 */
export async function generateProductCopy(
  input: ProductCopyInput,
  openaiKey: string | null | undefined
): Promise<ProductCopyResult> {
  const fallback = buildFallbackProductCopy(input);
  const key = String(openaiKey || "").trim();
  if (!key) return fallback;

  try {
    const promptLines = [
      "Write an improved e-commerce product description and SEO tags for this product listing.",
      `Title: ${input.title}`,
      input.vendor ? `Brand: ${input.vendor}` : "",
      input.productType ? `Category: ${input.productType}` : "",
      input.description ? `Existing description: ${input.description}` : "Existing description: (none)",
      input.tags.length > 0 ? `Existing tags: ${input.tags.join(", ")}` : "",
      "Write 2-3 short paragraphs (under 120 words total), benefit-focused, no markdown, no emoji, no exaggerated claims.",
      `Also suggest up to ${MAX_TAGS} short, relevant SEO tags (single words or short phrases).`,
      'Return ONLY JSON: {"description":"...","tags":["...", "..."]}',
    ].filter(Boolean);

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptLines.join("\n") }],
        temperature: 0.6,
        max_tokens: 400,
      }),
      // A hung OpenAI call must not stall the automation sweep.
      signal: AbortSignal.timeout(20_000),
    });
    if (!aiRes.ok) return fallback;

    const aiData = await aiRes.json();
    const content = String(aiData?.choices?.[0]?.message?.content || "").trim();
    if (!content) return fallback;

    let parsed: unknown;
    try {
      // Models sometimes wrap JSON in a fenced code block despite instructions.
      const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      parsed = JSON.parse(stripped);
    } catch {
      return fallback;
    }
    if (!parsed || typeof parsed !== "object") return fallback;
    const r = parsed as Record<string, unknown>;
    const description = String(r.description || "").trim();
    if (!description) return fallback;
    const tags = Array.isArray(r.tags)
      ? r.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, MAX_TAGS)
      : heuristicTags(input);

    return { description: description.slice(0, 2000), tags, source: "openai" };
  } catch {
    return fallback;
  }
}
