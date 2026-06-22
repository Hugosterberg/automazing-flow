import { apiUrl } from "@/lib/apiBase";

export function accountDataUrl(
  accountId: string,
  businessProfileId?: string | null,
  params?: URLSearchParams
): string {
  const query = new URLSearchParams(params);
  const normalizedProfileId = String(businessProfileId || "").trim();
  if (normalizedProfileId) {
    query.set("business_profile_id", normalizedProfileId);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiUrl(`/api/accounts/${encodeURIComponent(accountId)}/data${suffix}`);
}
