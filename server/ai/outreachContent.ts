/**
 * Outreach content ideas — posts and assets that attract and warm potential
 * customers (thought leadership, pain-point content, social proof angles).
 */

export interface OutreachContentContext {
  businessName?: string;
  company?: string;
  description?: string;
  offering?: string;
  location?: string;
  industry?: string;
  targetAudience?: string;
  idealCustomer?: string;
  notes?: string;
}

export interface OutreachContentIdea {
  title: string;
  hook: string;
  format: string;
  cta: string;
  audience: string;
  channel: string;
}

const MAX_IDEAS = 8;

export function buildOutreachContentPrompt(ctx: OutreachContentContext, count = MAX_IDEAS): string {
  const lines = [
    ctx.businessName ? `Business: ${ctx.businessName}` : "",
    ctx.company ? `Company: ${ctx.company}` : "",
    ctx.description ? `What they do: ${ctx.description}` : "",
    ctx.offering ? `Offering: ${ctx.offering}` : "",
    ctx.industry ? `Industry: ${ctx.industry}` : "",
    ctx.location ? `Market: ${ctx.location}` : "",
    ctx.targetAudience ? `Target audience: ${ctx.targetAudience}` : "",
    ctx.idealCustomer ? `Ideal customer profile: ${ctx.idealCustomer}` : "",
  ].filter(Boolean);

  return (
    `You are a B2B content strategist. Propose ${count} content pieces that ATTRACT and WARM potential customers — not posts for existing followers only.\n\n` +
    `${lines.join("\n") || "Generic B2B business"}\n\n` +
    `Focus on: pain points, credibility, case-study angles, educational hooks, and soft CTAs that invite DMs or demo requests.\n` +
    `Return ONLY JSON: {"ideas":[{"title":"...","hook":"...","format":"...","cta":"...","audience":"who this attracts","channel":"LinkedIn|email|blog|video"}]}`
  );
}

export function parseOutreachContentIdeas(content: string): OutreachContentIdea[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const arr = (parsed as { ideas?: unknown })?.ideas;
  if (!Array.isArray(arr)) return [];
  const out: OutreachContentIdea[] = [];
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
      audience: String(r.audience || "").trim().slice(0, 120),
      channel: String(r.channel || "").trim().slice(0, 40),
    });
    if (out.length >= MAX_IDEAS) break;
  }
  return out;
}

export function heuristicOutreachContentIdeas(ctx: OutreachContentContext): OutreachContentIdea[] {
  const brand = ctx.businessName || ctx.company || "your business";
  const icp = ctx.idealCustomer || ctx.targetAudience || "decision-makers in your market";
  return [
    {
      title: "3 mistakes your ideal buyer makes (and how to fix one today)",
      hook: `Most ${icp} overlook this — here's the fix.`,
      format: "Carousel",
      cta: "Comment which mistake you've seen — we'll share our checklist.",
      audience: icp,
      channel: "LinkedIn",
    },
    {
      title: "Before / after: what changed when a client switched to us",
      hook: "Same team, half the manual work.",
      format: "Photo + caption",
      cta: "DM us 'case' for the full story.",
      audience: "Prospects comparing vendors",
      channel: "LinkedIn",
    },
    {
      title: "The question we ask on every discovery call",
      hook: "It tells us in 30 seconds if we can help.",
      format: "Short video",
      cta: "Book a 15-min fit call — link in bio.",
      audience: icp,
      channel: "LinkedIn",
    },
    {
      title: "Newsletter: one tactical tip per week for your ICP",
      hook: `${brand}'s weekly note for ${icp}.`,
      format: "Email",
      cta: "Subscribe — first issue explains our approach.",
      audience: "Cold email list warm-up",
      channel: "Email",
    },
    {
      title: "Myth vs fact in your industry",
      hook: "Myth: you need a huge team to scale outreach.",
      format: "Reel",
      cta: "Save this for your next planning session.",
      audience: icp,
      channel: "LinkedIn",
    },
  ];
}
