/**
 * Google Places Find Place — enrich a company by name or domain when no GBP connection exists.
 * Uses GOOGLE_PLACES_API_KEY or tenant override via secretResolver.
 */

export type GooglePlaceMatch = {
  name?: string;
  address?: string;
  location?: string;
  phone?: string;
  website?: string;
  rating?: number;
  categories?: string[];
  placeId?: string;
  source: "google_places";
};

function hostnameFromUrl(raw: string): string | undefined {
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export async function lookupGooglePlace(
  query: string,
  apiKey: string
): Promise<GooglePlaceMatch | null> {
  const q = String(query || "").trim();
  const key = String(apiKey || "").trim();
  if (!q || !key) return null;

  const host = hostnameFromUrl(q);
  const input = host || q;

  const params = new URLSearchParams({
    input,
    inputtype: "textquery",
    fields: "place_id,name,formatted_address,formatted_phone_number,website,rating,types",
    key,
  });

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params}`,
    { signal: AbortSignal.timeout(12_000) }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    status?: string;
    candidates?: Array<Record<string, unknown>>;
  };
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return null;

  const candidate = data.candidates?.[0];
  if (!candidate) return null;

  const address = String(candidate.formatted_address || "").trim() || undefined;
  const city = address?.split(",").slice(-2, -1)[0]?.trim();

  return {
    name: String(candidate.name || "").trim() || undefined,
    address,
    location: city,
    phone: String(candidate.formatted_phone_number || "").trim() || undefined,
    website: String(candidate.website || "").trim() || undefined,
    rating: Number(candidate.rating) || undefined,
    categories: Array.isArray(candidate.types)
      ? candidate.types.map((t) => String(t)).filter(Boolean).slice(0, 5)
      : undefined,
    placeId: String(candidate.place_id || "").trim() || undefined,
    source: "google_places",
  };
}

export async function resolveGooglePlacesApiKey(
  businessProfileId: string | null | undefined,
  secretResolver?: {
    resolve: (businessProfileId: string | null | undefined, key: string) => Promise<string | null>;
  }
): Promise<string | null> {
  const fromTenant = secretResolver
    ? await secretResolver.resolve(businessProfileId, "GOOGLE_PLACES_API_KEY")
    : null;
  const key = String(
    fromTenant ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PAGESPEED_API_KEY ||
      process.env.PAGESPEED_API_KEY ||
      ""
  ).trim();
  return key || null;
}
