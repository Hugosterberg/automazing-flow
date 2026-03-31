export function getOAuthProfileId(profileId?: string | null) {
  const normalized = String(profileId || "").trim();
  if (!normalized || normalized === "default") {
    return null;
  }
  return normalized;
}
