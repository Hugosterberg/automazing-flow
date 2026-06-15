/**
 * Display names for connection platforms. Shared so feature code doesn't each
 * carry its own copy of the map. Unknown platforms fall back to a tidied form
 * of the raw slug (e.g. "google_ads" → "Google ads").
 */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  facebook: "Facebook",
  google_business: "Google Business",
  google_ads: "Google Ads",
  meta_business: "Meta Business",
  google_reviews: "Google Reviews",
  tripadvisor: "Tripadvisor",
  whatsapp: "WhatsApp",
  shopify: "Shopify",
  notion: "Notion",
  gmail: "Gmail",
  outlook: "Outlook",
  google_calendar: "Google Calendar",
  outlook_calendar: "Outlook Calendar",
  google_drive: "Google Drive",
};

export function platformLabel(platform: string | null | undefined): string {
  const key = String(platform || "").toLowerCase();
  if (PLATFORM_LABELS[key]) return PLATFORM_LABELS[key];
  if (!key) return "Connection";
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
