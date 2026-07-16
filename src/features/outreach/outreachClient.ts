import { apiJson } from "@/lib/apiJson";

export type OutreachChannel = "email" | "linkedin" | "follow-up";

export type OutreachDraftInput = {
  business_profile_id?: string | null;
  channel?: OutreachChannel;
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
};

export type OutreachFollowUp = {
  day: number;
  subject?: string;
  body: string;
};

export type OutreachDraft = {
  subject?: string;
  body: string;
  linkedinMessage?: string;
  followUps: OutreachFollowUp[];
  tips?: string;
};

export async function fetchOutreachDraft(
  input: OutreachDraftInput
): Promise<{ draft: OutreachDraft; source: string; channel: OutreachChannel }> {
  const body = await apiJson<{ draft?: unknown; source?: unknown; channel?: unknown }>(
    "/api/sales/outreach-draft",
    "Kunde inte generera outreach-utkast.",
    { body: input, timeoutMs: 35_000 }
  );
  return {
    draft: body.draft as OutreachDraft,
    source: String(body.source || ""),
    channel: (body.channel as OutreachChannel) || input.channel || "email",
  };
}

export type OutreachContentIdea = {
  title: string;
  hook: string;
  format: string;
  cta: string;
  audience: string;
  channel: string;
};

export type OutreachContentInput = {
  business_profile_id?: string | null;
  businessName?: string;
  company?: string;
  description?: string;
  offering?: string;
  location?: string;
  industry?: string;
  targetAudience?: string;
  idealCustomer?: string;
};

export async function fetchOutreachContentIdeas(
  input: OutreachContentInput
): Promise<{ ideas: OutreachContentIdea[]; source: string }> {
  const body = await apiJson<{ ideas?: unknown; source?: unknown }>(
    "/api/sales/outreach-content-ideas",
    "Kunde inte ladda innehållsidéer för outreach.",
    { body: input, timeoutMs: 30_000 }
  );
  return {
    ideas: Array.isArray(body.ideas) ? (body.ideas as OutreachContentIdea[]) : [],
    source: String(body.source || ""),
  };
}

export function outreachDraftToMailto(draft: OutreachDraft, to?: string): string {
  const params = new URLSearchParams();
  if (draft.subject) params.set("subject", draft.subject);
  params.set("body", draft.body);
  const query = params.toString();
  const recipient = to?.trim() || "";
  return `mailto:${recipient}${query ? `?${query}` : ""}`;
}

export function linkedInSearchUrl(target?: {
  prospectContact?: string;
  prospectCompany?: string;
} | null): string | null {
  const query = [target?.prospectContact, target?.prospectCompany].filter(Boolean).join(" ").trim();
  if (!query) return null;
  return `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(query)}`;
}

export function outreachDraftText(draft: OutreachDraft, channel: OutreachChannel): string {
  if (channel === "linkedin" && draft.linkedinMessage) {
    return draft.linkedinMessage;
  }
  const parts = [draft.subject ? `Subject: ${draft.subject}` : "", draft.body].filter(Boolean);
  if (draft.followUps.length > 0) {
    parts.push(
      "",
      "--- Follow-ups ---",
      ...draft.followUps.map((fu) => `Day ${fu.day}${fu.subject ? ` · ${fu.subject}` : ""}\n${fu.body}`)
    );
  }
  return parts.join("\n");
}
