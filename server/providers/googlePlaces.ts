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

function matchFromParts(parts: {
  name?: unknown;
  address?: unknown;
  phone?: unknown;
  website?: unknown;
  rating?: unknown;
  types?: unknown;
  placeId?: unknown;
}): GooglePlaceMatch {
  const address = String(parts.address || "").trim() || undefined;
  const city = address?.split(",").slice(-2, -1)[0]?.trim();
  return {
    name: String(parts.name || "").trim() || undefined,
    address,
    location: city,
    phone: String(parts.phone || "").trim() || undefined,
    website: String(parts.website || "").trim() || undefined,
    rating: Number(parts.rating) || undefined,
    categories: Array.isArray(parts.types)
      ? parts.types.map((t) => String(t)).filter(Boolean).slice(0, 5)
      : undefined,
    placeId: String(parts.placeId || "").trim() || undefined,
    source: "google_places",
  };
}

/**
 * Places API (New) Text Search. The legacy Places API can't be enabled by new
 * Google Cloud customers since 2025-03 — this is the documented replacement.
 */
async function lookupViaNewPlacesApi(input: string, key: string): Promise<GooglePlaceMatch | null | "unavailable"> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.types",
    },
    body: JSON.stringify({ textQuery: input, maxResultCount: 1 }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => null);
  // 403 = key doesn't have Places API (New) enabled — signal legacy fallback.
  if (!res) return "unavailable";
  if (!res.ok) return res.status === 403 || res.status === 404 ? "unavailable" : null;

  const data = (await res.json().catch(() => ({}))) as {
    places?: Array<Record<string, unknown>>;
  };
  const place = data.places?.[0];
  if (!place) return null;
  return matchFromParts({
    name: (place.displayName as { text?: string } | undefined)?.text,
    address: place.formattedAddress,
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    rating: place.rating,
    types: place.types,
    placeId: place.id,
  });
}

/** Legacy Find Place — still works for keys created before 2025-03. */
async function lookupViaLegacyPlacesApi(input: string, key: string): Promise<GooglePlaceMatch | null> {
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
  return matchFromParts({
    name: candidate.name,
    address: candidate.formatted_address,
    phone: candidate.formatted_phone_number,
    website: candidate.website,
    rating: candidate.rating,
    types: candidate.types,
    placeId: candidate.place_id,
  });
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

  const viaNew = await lookupViaNewPlacesApi(input, key);
  if (viaNew !== "unavailable") return viaNew;
  return lookupViaLegacyPlacesApi(input, key);
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
