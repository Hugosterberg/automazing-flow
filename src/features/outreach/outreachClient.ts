import { apiUrl } from "@/lib/apiBase";
import { apiErrorMessage } from "@/lib/apiError";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

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
  const res = await fetchWithTimeout(
    apiUrl("/api/sales/outreach-draft"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    35_000
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Couldn't generate outreach draft."));
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
  const res = await fetchWithTimeout(
    apiUrl("/api/sales/outreach-content-ideas"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    30_000
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Couldn't load outreach content ideas."));
  return {
    ideas: Array.isArray(body.ideas) ? body.ideas : [],
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
