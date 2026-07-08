import { apiUrl } from "@/lib/apiBase";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { apiErrorMessage } from "@/lib/apiError";

export type AiFeatureState = "active" | "limited" | "inactive";

export interface AiFeatureStatus {
  id: string;
  area: string;
  name: string;
  description: string;
  state: AiFeatureState;
  detail: string;
  activation: string | null;
}

const VALID_STATES = new Set<AiFeatureState>(["active", "limited", "inactive"]);

export async function fetchAiFeatures(businessProfileId: string): Promise<AiFeatureStatus[]> {
  const res = await fetchWithTimeout(
    apiUrl(`/api/settings/ai-features?business_profile_id=${encodeURIComponent(businessProfileId)}`),
    { credentials: "include" },
    15_000
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Could not load AI feature status."));
  const raw = Array.isArray(body.features) ? body.features : [];
  return raw
    .filter(
      (f: Record<string, unknown>) =>
        f && typeof f.id === "string" && VALID_STATES.has(f.state as AiFeatureState)
    )
    .map((f: Record<string, unknown>) => ({
      id: String(f.id),
      area: String(f.area || ""),
      name: String(f.name || ""),
      description: String(f.description || ""),
      state: f.state as AiFeatureState,
      detail: String(f.detail || ""),
      activation: typeof f.activation === "string" ? f.activation : null,
    }));
}
