/**
 * AI outreach-target suggestions for the Sales page. Given a tenant's business
 * context, propose concrete *segments/types* of companies worth contacting —
 * deliberately NOT invented specific company names or fabricated contact
 * details (those would be hallucinated and harmful). The user turns a
 * suggestion into a real lead and fills in the actual company.
 *
 * Pure: prompt building, response parsing and a heuristic fallback (used when
 * no OpenAI key is configured) all live here and are unit-tested.
 */

export interface LeadSuggestionContext {
  businessName?: string;
  industry?: string;
  description?: string;
  location?: string;
  offering?: string;
  sampleCustomers?: string[];
}

export interface LeadSuggestion {
  /** A segment/type of company to contact, e.g. "Independent gyms in Sweden". */
  target: string;
  /** Why they're a good fit (1 sentence). */
  why: string;
  /** A concrete way to find or approach them (1 sentence). */
  how: string;
}

const MAX_SUGGESTIONS = 6;

export function buildLeadSuggestionPrompt(ctx: LeadSuggestionContext, count = MAX_SUGGESTIONS): string {
  const lines = [
    `Business: ${ctx.businessName || "(unnamed)"}`,
    ctx.industry ? `Industry: ${ctx.industry}` : "",
    ctx.offering || ctx.description ? `What they offer: ${ctx.offering || ctx.description}` : "",
    ctx.location ? `Location/market: ${ctx.location}` : "",
    ctx.sampleCustomers && ctx.sampleCustomers.length
      ? `Examples of existing customers: ${ctx.sampleCustomers.slice(0, 10).join(", ")}`
      : "",
  ].filter(Boolean);

  return (
    `You are a B2B sales strategist. Propose ${count} concrete OUTREACH TARGETS — types of companies or ` +
    `customer segments worth contacting for this business. Do NOT invent specific company names, people or ` +
    `contact details; describe segments/types only.\n\n` +
    `${lines.join("\n")}\n\n` +
    `For each target return: "target" (a clear segment/type), "why" (why they fit, one sentence), ` +
    `"how" (a concrete way to find or approach them, one sentence).\n` +
    `Return ONLY JSON: {"suggestions":[{"target":"...","why":"...","how":"..."}]}`
  );
}

export function parseLeadSuggestions(content: string): LeadSuggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const arr = (parsed as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(arr)) return [];
  const out: LeadSuggestion[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const target = String(r.target || "").trim();
    if (!target) continue;
    out.push({
      target: target.slice(0, 160),
      why: String(r.why || "").trim().slice(0, 280),
      how: String(r.how || "").trim().slice(0, 280),
    });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/** Generic-but-useful suggestions when no OpenAI key is configured. */
export function heuristicLeadSuggestions(ctx: LeadSuggestionContext): LeadSuggestion[] {
  const where = ctx.location ? ` in ${ctx.location}` : "";
  const suggestions: LeadSuggestion[] = [
    {
      target: `Businesses similar to your existing customers${where}`,
      why: "Look-alikes convert well because the value proposition is already proven for them.",
      how: "List your best current customers and search for companies of the same type, size and area.",
    },
    {
      target: `Complementary (non-competing) service providers${where}`,
      why: "They serve the same customers without overlapping, which makes referral partnerships easy.",
      how: "Map who else your customers buy from and reach out about cross-referrals.",
    },
    {
      target: `Local companies that recently expanded or got funding${where}`,
      why: "Growth usually means new budget and new needs you can help with.",
      how: "Follow local business news and LinkedIn 'we're hiring/expanding' posts.",
    },
  ];
  if (ctx.industry) {
    suggestions.unshift({
      target: `${ctx.industry} companies without a strong online presence`,
      why: "They have the clearest gap your offering can close.",
      how: "Search the segment and shortlist those with outdated sites or thin social profiles.",
    });
  }
  return suggestions.slice(0, MAX_SUGGESTIONS);
}
