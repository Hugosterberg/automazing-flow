import { t } from "@/lib/i18n";
import { apiJson } from "@/lib/apiJson";

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
  const body = await apiJson<{ ideas?: unknown; source?: unknown }>(
    "/api/content/ideas",
    t("content:errors.ideasLoadFailed"),
    { body: input, timeoutMs: 30_000 },
  );
  return {
    ideas: Array.isArray(body.ideas) ? (body.ideas as ContentIdea[]) : [],
    source: String(body.source || ""),
  };
}
