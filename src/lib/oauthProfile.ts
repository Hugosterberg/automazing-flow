export function getOAuthProfileId(profileId?: string | null) {
  const normalized = String(profileId || "").trim();
  if (!normalized || normalized === "default") {
    return null;
  }
  return normalized;
}

export function appendOAuthProfileParams(params: URLSearchParams, profileId?: string | null) {
  const oauthProfileId = getOAuthProfileId(profileId);
  if (!oauthProfileId) return;
  params.set("profile_id", oauthProfileId);
  params.set("business_profile_id", oauthProfileId);
}
