/**
 * AI content ideas for the social/content side: given a business's context,
 * propose concrete post ideas (topic + hook + format + CTA). Pure prompt
 * building, response parsing and a heuristic fallback live here and are tested;
 * the route wires them to OpenAI with the usual key resolution + rate limit.
 */

export interface ContentIdeaContext {
  businessName?: string;
  description?: string;
  audience?: string;
  platform?: string;
  /** Voice/style guidance, e.g. "Kort, käckt, lite crypto-slang. Undvik finansiella råd." */
  toneOfVoice?: string;
  /** Comma-separated subject hints, e.g. "Bitcoin, blockchain, ekonomisk frihet". */
  topics?: string;
  /** Hard budget for the "title" field — used when the idea is headed into a fixed-size design (e.g. a Canva template text box). */
  maxHeadlineChars?: number;
}

export interface ContentIdea {
  title: string;
  hook: string;
  format: string;
  cta: string;
}

const MAX_IDEAS = 6;

export function buildContentIdeaPrompt(ctx: ContentIdeaContext, count = MAX_IDEAS): string {
  const lines = [
    `Business: ${ctx.businessName || "(unnamed)"}`,
    ctx.description ? `What they do: ${ctx.description}` : "",
    ctx.audience ? `Audience: ${ctx.audience}` : "",
    ctx.platform ? `Platform focus: ${ctx.platform}` : "",
    ctx.topics ? `Topics to draw from: ${ctx.topics}` : "",
    ctx.toneOfVoice ? `Voice/tone: ${ctx.toneOfVoice}` : "",
  ].filter(Boolean);

  const titleConstraint = ctx.maxHeadlineChars
    ? ` "title" must be a punchy on-image headline of at most ${ctx.maxHeadlineChars} characters — it will be placed directly into a fixed-size design, so it must NOT be truncated or wrap awkwardly.`
    : "";

  return (
    `You are a social media strategist. Propose ${count} concrete, ready-to-shoot post ideas for this business.\n\n` +
    `${lines.join("\n")}\n\n` +
    `For each idea return: "title" (the post concept),${titleConstraint} "hook" (an attention-grabbing first line), ` +
    `"format" (e.g. Reel, carousel, story, photo), and "cta" (a clear call to action).\n` +
    `Return ONLY JSON: {"ideas":[{"title":"...","hook":"...","format":"...","cta":"..."}]}`
  );
}

export function parseContentIdeas(content: string): ContentIdea[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const arr = (parsed as { ideas?: unknown })?.ideas;
  if (!Array.isArray(arr)) return [];
  const out: ContentIdea[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title = String(r.title || "").trim();
    if (!title) continue;
    out.push({
      title: title.slice(0, 160),
      hook: String(r.hook || "").trim().slice(0, 240),
      format: String(r.format || "").trim().slice(0, 40),
      cta: String(r.cta || "").trim().slice(0, 120),
    });
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}

/** Useful generic ideas when no OpenAI key is configured. */
export function heuristicContentIdeas(ctx: ContentIdeaContext): ContentIdea[] {
  const who = ctx.businessName || "your business";
  const topic = ctx.topics?.split(",")[0]?.trim();
  const ideas: ContentIdea[] = [
    {
      title: topic ? `Today's take on ${topic}` : "Behind the scenes of a typical day",
      hook: `Ever wondered how ${who} actually gets things done?`,
      format: "Reel",
      cta: "Follow for more behind-the-scenes.",
    },
    {
      title: "Answer your 3 most common questions",
      hook: "You asked — here are the answers.",
      format: "Carousel",
      cta: "Save this for later.",
    },
    {
      title: topic ? `Why ${topic} matters right now` : "A customer win / before-and-after",
      hook: "Look at the difference.",
      format: "Photo",
      cta: "Want results like this? DM us.",
    },
    {
      title: "A quick tip your audience can use today",
      hook: "Steal this 30-second tip.",
      format: "Story",
      cta: "Try it and tell us how it went.",
    },
  ];
  const maxChars = ctx.maxHeadlineChars;
  return maxChars ? ideas.map((idea) => ({ ...idea, title: idea.title.slice(0, maxChars) })) : ideas;
}
