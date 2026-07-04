/**
 * Personalized outreach drafts — cold email, LinkedIn, and follow-up sequences
 * for a specific prospect, using the seller's business profile as context.
 */

export type OutreachChannel = "email" | "linkedin" | "follow-up";

export interface OutreachDraftContext {
  businessName?: string;
  company?: string;
  website?: string;
  email?: string;
  location?: string;
  notes?: string;
  offering?: string;
  industry?: string;
  prospectCompany?: string;
  prospectContact?: string;
  prospectEmail?: string;
  prospectWebsite?: string;
  prospectNotes?: string;
  prospectReason?: string;
}

export interface OutreachFollowUp {
  day: number;
  subject?: string;
  body: string;
}

export interface OutreachDraft {
  subject?: string;
  body: string;
  linkedinMessage?: string;
  followUps: OutreachFollowUp[];
  tips?: string;
}

const MAX_FOLLOW_UPS = 3;

export function buildOutreachDraftPrompt(ctx: OutreachDraftContext, channel: OutreachChannel): string {
  const seller = [
    ctx.businessName ? `Business: ${ctx.businessName}` : "",
    ctx.company ? `Company: ${ctx.company}` : "",
    ctx.offering ? `Offering: ${ctx.offering}` : "",
    ctx.industry ? `Industry: ${ctx.industry}` : "",
    ctx.website ? `Website: ${ctx.website}` : "",
    ctx.location ? `Market: ${ctx.location}` : "",
    ctx.notes ? `About us: ${ctx.notes}` : "",
  ].filter(Boolean);

  const prospect = [
    ctx.prospectCompany ? `Company: ${ctx.prospectCompany}` : "",
    ctx.prospectContact ? `Contact: ${ctx.prospectContact}` : "",
    ctx.prospectEmail ? `Email: ${ctx.prospectEmail}` : "",
    ctx.prospectWebsite ? `Website: ${ctx.prospectWebsite}` : "",
    ctx.prospectNotes ? `Notes: ${ctx.prospectNotes}` : "",
    ctx.prospectReason ? `Why we picked them: ${ctx.prospectReason}` : "",
  ].filter(Boolean);

  const channelGuide =
    channel === "linkedin"
      ? "Write a short LinkedIn connection or DM (under 300 chars) plus a longer email alternative."
      : channel === "follow-up"
        ? "Write a polite follow-up for someone who did not reply to the first message."
        : "Write a concise cold email with a clear subject line.";

  return (
    `You are a B2B sales copywriter. ${channelGuide}\n\n` +
    `SELLER:\n${seller.join("\n") || "(generic business)"}\n\n` +
    `PROSPECT:\n${prospect.join("\n") || "(unknown prospect — keep it generic but professional)"}\n\n` +
    `Return ONLY JSON:\n` +
    `{"subject":"email subject or empty","body":"main message","linkedinMessage":"short DM if relevant","` +
    `followUps":[{"day":3,"subject":"optional","body":"..."},{"day":7,"subject":"optional","body":"..."}],` +
    `"tips":"one sentence on personalization or timing"}`
  );
}

export function parseOutreachDraft(content: string): OutreachDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;
  const body = String(r.body || "").trim();
  if (!body) return null;

  const followUps: OutreachFollowUp[] = [];
  if (Array.isArray(r.followUps)) {
    for (const raw of r.followUps) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const fuBody = String(item.body || "").trim();
      if (!fuBody) continue;
      followUps.push({
        day: typeof item.day === "number" ? item.day : Number(item.day) || followUps.length + 3,
        subject: String(item.subject || "").trim() || undefined,
        body: fuBody.slice(0, 1200),
      });
      if (followUps.length >= MAX_FOLLOW_UPS) break;
    }
  }

  return {
    subject: String(r.subject || "").trim().slice(0, 200) || undefined,
    body: body.slice(0, 2000),
    linkedinMessage: String(r.linkedinMessage || "").trim().slice(0, 400) || undefined,
    followUps,
    tips: String(r.tips || "").trim().slice(0, 300) || undefined,
  };
}

export function heuristicOutreachDraft(ctx: OutreachDraftContext, channel: OutreachChannel): OutreachDraft {
  const brand = ctx.businessName || ctx.company || "our team";
  const prospect = ctx.prospectCompany || "your company";
  const contact = ctx.prospectContact ? `Hi ${ctx.prospectContact.split(" ")[0]},` : "Hi there,";
  const reason = ctx.prospectReason ? ` ${ctx.prospectReason}` : "";
  const offering = ctx.offering || ctx.notes || "help teams grow revenue with less manual work";

  const body =
    channel === "follow-up"
      ? `${contact}\n\nQuick follow-up on my note last week — we help companies like ${prospect} with ${offering}. Still open to a 15-minute call?\n\nBest,\n${brand}`
      : `${contact}\n\nI came across ${prospect}${reason} and thought ${brand} could help with ${offering}.\n\nWould you be open to a short intro call next week?\n\nBest,\n${brand}`;

  return {
    subject: channel === "follow-up" ? `Re: quick intro — ${brand}` : `Idea for ${prospect}`,
    body,
    linkedinMessage:
      channel === "linkedin"
        ? `Hi — I work with ${brand} and noticed ${prospect}. Worth a quick chat about ${offering}?`
        : undefined,
    followUps: [
      {
        day: 4,
        subject: `Re: ${prospect}`,
        body: `${contact}\n\nBumping this in case it got buried — happy to share a one-pager on how ${brand} helps similar teams.\n\nBest,\n${brand}`,
      },
      {
        day: 10,
        body: `${contact}\n\nLast note from me — if timing isn't right, no worries. Reply anytime if ${offering} becomes a priority.\n\n${brand}`,
      },
    ],
    tips: "Personalize the first line with something specific from their website or LinkedIn.",
  };
}

export function normalizeOutreachChannel(value: unknown): OutreachChannel {
  const v = String(value || "").toLowerCase();
  if (v === "linkedin" || v === "follow-up" || v === "followup") return v === "linkedin" ? "linkedin" : "follow-up";
  return "email";
}
