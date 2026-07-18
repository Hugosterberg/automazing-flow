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
  fortnox: "Fortnox",
  gmail: "Gmail",
  outlook: "Outlook",
  google_calendar: "Google Calendar",
  outlook_calendar: "Outlook Calendar",
  google_drive: "Google Drive",
  canva: "Canva",
  dayai: "Day.ai",
  windsor: "Windsor.ai",
  era: "Era",
  ahrefs: "Ahrefs",
  canva_mcp: "Canva MCP",
  superhuman_mcp: "Superhuman Mail MCP",
  supermetrics_mcp: "Supermetrics MCP",
  exa: "Exa",
  klarity: "Klarity Architect",
  lunarcrush: "LunarCrush",
  peec: "Peec AI",
  sprouts: "Sprouts",
  gamma: "Gamma",
  godaddy: "GoDaddy Domains",
  shopify_mcp: "Shopify Storefront MCP",
  twilio_mcp: "Twilio Docs MCP",
};

export function platformLabel(platform: string | null | undefined): string {
  const key = String(platform || "").toLowerCase();
  if (PLATFORM_LABELS[key]) return PLATFORM_LABELS[key];
  if (!key) return "Connection";
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
