import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

export interface ContentIdea {
  title: string;
  hook: string;
  format: string;
  cta: string;
}

export interface ContentIdeaInput {
  business_profile_id?: string | null;
  businessName?: string;
  description?: string;
  audience?: string;
  platform?: string;
}

export async function fetchContentIdeas(
  input: ContentIdeaInput,
): Promise<{ ideas: ContentIdea[]; source: string }> {
  const res = await fetchWithTimeout(
    apiUrl("/api/content/ideas"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    30_000,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Couldn't load content ideas."));
  return {
    ideas: Array.isArray(body.ideas) ? (body.ideas as ContentIdea[]) : [],
    source: String(body.source || ""),
  };
}
