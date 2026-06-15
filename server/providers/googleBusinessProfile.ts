/**
 * Google Business Profile: normalize Zernio enrichment payloads and fetch official Business Information + reviews.
 */

export type GoogleBusinessReview = {
  id: string;
  author: string;
  rating?: number;
  text: string;
  createdAt: string;
  url?: string;
};

export type GoogleBusinessPanel = {
  source: "zernio" | "official";
  title?: string;
  phone?: string;
  website?: string;
  addressLines: string[];
  primaryCategory?: string;
  averageRating?: number;
  reviewCount?: number;
  reviews: GoogleBusinessReview[];
};

type Loose = Record<string, unknown>;

function asRecord(v: unknown): Loose | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : null;
}

function pickString(obj: Loose | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function extractReviewList(raw: unknown): unknown[] {
  const o = asRecord(raw);
  if (!o) return Array.isArray(raw) ? (raw as unknown[]) : [];
  const nested = asRecord(o.data);
  const fromData = nested?.reviews ?? (Array.isArray(nested?.items) ? nested.items : undefined);
  const list = o.reviews ?? fromData ?? o.items ?? (Array.isArray(o.data) ? o.data : null);
  return Array.isArray(list) ? list : [];
}

function mapZernioReview(r: unknown, i: number): GoogleBusinessReview {
  const o = asRecord(r) ?? {};
  return {
    id: String(o.id ?? o.reviewId ?? o.name ?? i),
    author: String(o.authorName ?? o.author ?? o.reviewer ?? "Anonymous"),
    rating: Number(o.rating ?? o.starRating ?? 0) || undefined,
    text: String(o.comment ?? o.text ?? o.content ?? ""),
    createdAt: String(o.createTime ?? o.createdAt ?? o.date ?? ""),
    url: String(o.url ?? o.reviewUrl ?? "") || undefined,
  };
}

function mapOfficialReview(r: unknown, i: number): GoogleBusinessReview {
  const o = asRecord(r) ?? {};
  const reviewer = asRecord(o.reviewer);
  return {
    id: String(o.reviewId ?? o.name ?? i),
    author: String(reviewer?.displayName ?? "Anonymous"),
    rating: Number(o.starRating ?? 0) || undefined,
    text: String(o.comment ?? ""),
    createdAt: String(o.createTime ?? ""),
    url: "",
  };
}

function pickPhoneFromLocation(loc: Loose | null): string | undefined {
  if (!loc) return undefined;
  const direct = pickString(loc, ["phone", "primaryPhone", "formattedPhone"]);
  if (direct) return direct;
  const pn = asRecord(loc.phoneNumbers);
  if (pn) {
    const p = pickString(pn, ["primaryPhone", "phoneNumber"]);
    if (p) return p;
  }
  return undefined;
}

function pickAddressLines(loc: Loose | null): string[] {
  if (!loc) return [];
  const sa = asRecord(loc.storefrontAddress) ?? asRecord(loc.address);
  if (!sa) {
    const single = pickString(loc, ["formattedAddress", "address"]);
    return single ? [single] : [];
  }
  const lines = sa.addressLines;
  if (Array.isArray(lines)) return lines.map((x) => String(x)).filter(Boolean);
  const formatted = pickString(sa, ["formattedAddress"]);
  return formatted ? [formatted] : [];
}

function pickCategory(loc: Loose | null): string | undefined {
  if (!loc) return undefined;
  const cats = loc.categories;
  if (Array.isArray(cats) && cats[0]) {
    const c0 = asRecord(cats[0]);
    return pickString(c0 ?? {}, ["displayName", "name"]);
  }
  const pc = asRecord(loc.primaryCategory ?? loc.mainCategory);
  return pickString(pc ?? loc, ["displayName", "name", "category"]);
}

function locationObjectFromZernio(raw: unknown): Loose | null {
  const root = asRecord(raw);
  if (!root) return null;
  const candidates = [
    root,
    asRecord(root.data),
    asRecord(root.location),
    asRecord(asRecord(root.data)?.location),
  ];
  for (const c of candidates) {
    if (c && (pickString(c, ["title", "name"]) || pickPhoneFromLocation(c) || pickAddressLines(c).length)) {
      return c;
    }
  }
  return asRecord(root.data) ?? root;
}

/**
 * Build a stable panel from Zernio `gmb-location-details` / `gmb-reviews` payloads (shapes vary by tenant).
 */
export function buildGoogleBusinessPanelFromZernioExtra(
  zernioExtra: Record<string, unknown> | null | undefined
): GoogleBusinessPanel | null {
  if (!zernioExtra || typeof zernioExtra !== "object") return null;
  const locRaw = zernioExtra.gmbLocationDetails ?? zernioExtra.gmb_location_details;
  const revRaw = zernioExtra.gmbReviews ?? zernioExtra.gmb_reviews;
  const loc = locationObjectFromZernio(locRaw);
  const title = pickString(loc, ["title", "name", "locationName", "businessName", "displayName"]);
  const phone = pickPhoneFromLocation(loc);
  const website = pickString(loc, ["websiteUri", "website", "url"]);
  const addressLines = pickAddressLines(loc);
  const primaryCategory = pickCategory(loc);

  const rawList = extractReviewList(revRaw);
  const reviews = rawList.map((r, i) => mapZernioReview(r, i)).slice(0, 50);

  const revObj = asRecord(revRaw);
  const revSummary = asRecord(revObj?.summary);
  let averageRating: number | undefined;
  let reviewCount = reviews.length;
  const aggAvg = Number(revObj?.averageRating ?? revObj?.average_rating ?? revSummary?.averageRating);
  const aggCount = Number(revObj?.totalReviewCount ?? revObj?.total_reviews ?? revObj?.reviewCount);
  if (Number.isFinite(aggAvg) && aggAvg > 0) averageRating = aggAvg;
  if (Number.isFinite(aggCount) && aggCount >= 0) reviewCount = Math.max(reviewCount, Math.floor(aggCount));

  if (reviews.length > 0) {
    const rated = reviews.filter((r) => r.rating != null && r.rating > 0);
    if (rated.length > 0) {
      const sum = rated.reduce((a, r) => a + (r.rating ?? 0), 0);
      const avg = sum / rated.length;
      if (averageRating == null || Number.isNaN(averageRating)) averageRating = avg;
    }
  }

  if (!title && !phone && !website && addressLines.length === 0 && reviews.length === 0 && reviewCount === 0) {
    return null;
  }

  return {
    source: "zernio",
    title,
    phone,
    website,
    addressLines,
    primaryCategory,
    averageRating,
    reviewCount: reviewCount || reviews.length,
    reviews,
  };
}

type TokenStore = {
  set: (id: string, value: Record<string, unknown>) => Promise<void> | void;
};

const LOCATION_READ_MASK = [
  "name",
  "title",
  "websiteUri",
  "phoneNumbers",
  "storefrontAddress",
  "regularHours",
  "categories",
  "profile",
  "metadata",
].join(",");

function panelFromOfficialLocation(locJson: unknown, reviews: GoogleBusinessReview[], totalReviewCount: number): GoogleBusinessPanel {
  const loc = asRecord(locJson);
  const title = pickString(loc, ["title"]);
  const phone = pickPhoneFromLocation(loc);
  const website = pickString(loc, ["websiteUri"]);
  const addressLines = pickAddressLines(loc);
  const primaryCategory = pickCategory(loc);
  let averageRating: number | undefined;
  if (reviews.length > 0) {
    const rated = reviews.filter((r) => r.rating != null && r.rating > 0);
    if (rated.length > 0) {
      averageRating = rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length;
    }
  }
  return {
    source: "official",
    title,
    phone,
    website,
    addressLines,
    primaryCategory,
    averageRating,
    reviewCount: totalReviewCount || reviews.length,
    reviews,
  };
}

export type FetchGoogleBusinessOfficialArgs = {
  appAccountId: string;
  stored: Record<string, unknown>;
  tokenStore: TokenStore;
  googleClientId?: string;
  googleClientSecret?: string;
};

export type FetchGoogleBusinessOfficialResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Official Google Business Profile: location (Business Information v1) + reviews (My Business v4).
 */
export async function fetchGoogleBusinessOfficialAccountData(
  args: FetchGoogleBusinessOfficialArgs
): Promise<FetchGoogleBusinessOfficialResult> {
  const { appAccountId, stored, tokenStore } = args;
  let token = String(stored.accessToken || "").trim();
  const refreshToken = String(stored.refreshToken || "").trim();
  const googleClientId = String(args.googleClientId || "").trim();
  const googleClientSecret = String(args.googleClientSecret || "").trim();
  const accountIdPath = String(stored.googleBusinessAccountId || "").trim();
  const locationIdPath = String(stored.googleBusinessLocationId || "").trim();

  if (!accountIdPath || !locationIdPath) {
    return {
      ok: false,
      status: 400,
      error:
        "Missing Google Business location. Connect with “Google Business via Official API” on Social Media, or link a Zernio Google Business account.",
    };
  }

  const locationResource = `accounts/${encodeURIComponent(accountIdPath)}/locations/${encodeURIComponent(locationIdPath)}`;
  const infoUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationResource}?readMask=${encodeURIComponent(LOCATION_READ_MASK)}`;
  const reviewsUrl = `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountIdPath)}/locations/${encodeURIComponent(locationIdPath)}/reviews`;

  async function refreshAccess(): Promise<string | null> {
    if (!refreshToken || !googleClientId || !googleClientSecret) return null;
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const refreshData = (await refreshRes.json().catch(() => ({}))) as Loose;
    const newTok = typeof refreshData.access_token === "string" ? refreshData.access_token : null;
    if (newTok) {
      token = newTok;
      await tokenStore.set(appAccountId, { ...stored, accessToken: token });
    }
    return newTok;
  }

  async function fetchJson(url: string): Promise<{ res: Response; data: unknown }> {
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 && refreshToken && googleClientId && googleClientSecret) {
      const refreshed = await refreshAccess();
      if (refreshed) {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      }
    }
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  const { res: locRes, data: locData } = await fetchJson(infoUrl);
  if (!locRes.ok) {
    if (locRes.status === 401) {
      if (!googleClientId || !googleClientSecret) {
        return {
          ok: false,
          status: 503,
          error:
            "Google OAuth client is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        };
      }
      return {
        ok: false,
        status: 401,
        error:
          "Google access expired or was revoked. Reconnect Google Business (Official API) under Social Media.",
      };
    }
    const errBody = asRecord(locData);
    const errNested = asRecord(errBody?.error);
    const msg =
      (typeof errBody?.error === "string" ? errBody.error : null) ||
      pickString(errNested ?? {}, ["message"]) ||
      "location_request_failed";
    return {
      ok: false,
      status: 502,
      error: `Could not load Google Business location: ${msg}`,
    };
  }

  let reviews: GoogleBusinessReview[] = [];
  let totalReviewCount = 0;
  const { res: revRes, data: revData } = await fetchJson(reviewsUrl);
  if (revRes.ok) {
    const body = asRecord(revData);
    const list = Array.isArray(body?.reviews) ? body.reviews : [];
    totalReviewCount = Number(body?.totalReviewCount) || list.length;
    reviews = list.slice(0, 50).map((r, i) => mapOfficialReview(r, i));
  }

  const panel = panelFromOfficialLocation(locData, reviews, totalReviewCount);
  const displayName = panel.title || String(stored.username || "").trim() || "Google Business";
  const username = String(stored.username || displayName);

  return {
    ok: true,
    body: {
      profile: {
        displayName,
        username,
        name: displayName,
      },
      stats: {
        averageRating: panel.averageRating,
        reviewCount: panel.reviewCount,
        updatedAt: new Date().toISOString(),
      },
      reviews,
      googleBusiness: panel,
      source: "official",
    },
  };
}
