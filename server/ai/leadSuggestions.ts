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
  company?: string;
  website?: string;
  industry?: string;
  description?: string;
  location?: string;
  offering?: string;
  sampleCustomers?: string[];
  /** Segments or companies already in the pipeline — avoid repeating these. */
  existingLeadSegments?: string[];
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
  const seller = ctx.company || ctx.businessName || "(unnamed business)";
  const lines = [
    `Seller / business: ${seller}`,
    ctx.website ? `Website: ${ctx.website}` : "",
    ctx.industry ? `Industry: ${ctx.industry}` : "",
    ctx.offering || ctx.description ? `What they offer: ${ctx.offering || ctx.description}` : "",
    ctx.location ? `Location/market: ${ctx.location}` : "",
    ctx.sampleCustomers && ctx.sampleCustomers.length
      ? `Won customers (look-alike signal): ${ctx.sampleCustomers.slice(0, 10).join(", ")}`
      : "",
    ctx.existingLeadSegments && ctx.existingLeadSegments.length
      ? `Already in pipeline (do NOT repeat or overlap): ${ctx.existingLeadSegments.slice(0, 12).join(", ")}`
      : "",
  ].filter(Boolean);

  return (
    `You are a B2B sales strategist. Based on the seller's real business profile below, propose ${count} ` +
    `concrete OUTREACH TARGETS — types of companies or customer segments worth contacting next. ` +
    `Tailor each suggestion to what they sell and where they operate. ` +
    `Do NOT invent specific company names, people or contact details; describe segments/types only. ` +
    `Do not repeat segments already listed in the pipeline.\n\n` +
    `${lines.join("\n")}\n\n` +
    `For each target return: "target" (a clear segment/type, max ~12 words), "why" (why they fit this seller, one sentence), ` +
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

function overlapsExisting(target: string, existing?: string[]): boolean {
  if (!existing?.length) return false;
  const t = target.toLowerCase();
  return existing.some((e) => {
    const x = e.toLowerCase();
    return t.includes(x) || x.includes(t);
  });
}

/** Generic-but-useful suggestions when no OpenAI key is configured. */
export function heuristicLeadSuggestions(ctx: LeadSuggestionContext): LeadSuggestion[] {
  const where = ctx.location ? ` in ${ctx.location}` : "";
  const seller = ctx.company || ctx.businessName || "your business";
  const offeringHint = (ctx.offering || ctx.description || "").slice(0, 120);
  const suggestions: LeadSuggestion[] = [];

  if (ctx.sampleCustomers?.length) {
    const example = ctx.sampleCustomers[0];
    suggestions.push({
      target: `Companies similar to ${example}${where}`,
      why: `${seller} already won ${example} — the same type of buyer is likely to convert again.`,
      how: "Search for businesses with a similar size, industry and location, then compare their needs to your offering.",
    });
  }

  if (ctx.industry) {
    suggestions.push({
      target: `${ctx.industry} businesses growing faster than their marketing${where}`,
      why: offeringHint
        ? `They often need help with ${offeringHint.split(/[.!?]/)[0]?.toLowerCase() || "your core offer"}.`
        : "Growing firms in this space usually have budget but lack capacity.",
      how: "Filter by hiring posts, new locations or recent press, then reach out with a specific pain point.",
    });
  }

  suggestions.push(
    {
      target: `Complementary service providers to ${seller}${where}`,
      why: "They sell to the same buyers without competing, which makes referrals and bundles natural.",
      how: "List who your best customers already hire and propose a simple referral exchange.",
    },
    {
      target: `Mid-size local businesses without a dedicated in-house team${where}`,
      why: "They have budget for external help but are too small for enterprise vendors.",
      how: "Use maps, industry directories and LinkedIn to build a list of 20–50 names.",
    },
    {
      target: `Businesses that recently opened or expanded${where}`,
      why: "New locations and launches create urgent setup, marketing and operations needs.",
      how: "Track local business registrations, 'now open' posts and commercial property news.",
    }
  );

  if (ctx.website) {
    suggestions.unshift({
      target: `Prospects visiting competitor or peer websites in your niche${where}`,
      why: "Buyers already researching alternatives are closer to a decision.",
      how: `Compare positioning against ${ctx.website.replace(/^https?:\/\//, "")} and target gaps you solve better.`,
    });
  }

  return suggestions.filter((s) => !overlapsExisting(s.target, ctx.existingLeadSegments)).slice(0, MAX_SUGGESTIONS);
}
