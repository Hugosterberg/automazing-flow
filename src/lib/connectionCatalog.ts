import type { AccountPlatform } from "@/types/accounts";
import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";
import { t } from "@/lib/i18n";

/** Logical product areas (matches main nav groupings). */
export type AppArea =
  | "social"
  | "marketing"
  | "ecommerce"
  | "economy"
  | "messages"
  | "calendar"
  | "reviews"
  | "content"
  | "intelligence";

export const AREA_ORDER: AppArea[] = [
  "social",
  "marketing",
  "ecommerce",
  "economy",
  "messages",
  "calendar",
  "reviews",
  "content",
  "intelligence",
];

/**
 * Areas that make sense in the private workspace. Mirrors the nav's mode
 * split: company-oriented areas (marketing, e-commerce, reviews) only show
 * in Business.
 */
const PRIVATE_AREAS: ReadonlySet<AppArea> = new Set(["social", "messages", "calendar", "content"]);

export function areaOrderForMode(mode: WorkspaceMode): AppArea[] {
  if (mode === "business") return AREA_ORDER;
  return AREA_ORDER.filter((area) => PRIVATE_AREAS.has(area));
}

/** Translated area label (follows active UI language). */
export function areaLabel(area: AppArea): string {
  return t(`catalog:areas.${area}`);
}

/**
 * Compatibility map that always reads live translations.
 * Prefer `areaLabel()` in new code.
 */
export const AREA_LABELS: Record<AppArea, string> = new Proxy({} as Record<AppArea, string>, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== "string") return undefined;
    if ((AREA_ORDER as string[]).includes(prop)) return areaLabel(prop as AppArea);
    return undefined;
  },
  ownKeys() {
    return [...AREA_ORDER];
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop === "string" && (AREA_ORDER as string[]).includes(prop)) {
      return { configurable: true, enumerable: true, value: areaLabel(prop as AppArea) };
    }
    return undefined;
  },
});

export type ConnectionCatalogEntry = {
  platform: AccountPlatform;
  label: string;
  /**
   * Every product area the connection powers — one connection can serve
   * several (Instagram feeds both Social media and the Messages inbox).
   * The first entry is the primary area (where the Connect flow lives);
   * the entry is listed under every area on the Connections page.
   */
  areas: [AppArea, ...AppArea[]];
  /** In-app page where Connect actions live */
  pageHref: string;
  /**
   * Fallback English page label — prefer `catalogPageName(entry)` for UI.
   * Kept for tests and non-i18n contexts.
   */
  pageName: string;
  /**
   * Fallback Swedish connect steps — prefer `catalogConnectSteps(entry)` for UI.
   */
  connectSteps: string;
  /** What must be set on the server (.env / Preferences) before OAuth succeeds */
  serverNeeds: string;
};

function pageKeyFromHref(href: string): string {
  const path = href.replace(/^\//, "").split("?")[0] || "connections";
  return path;
}

/** Localized “open Connections → …” steps for a catalog entry. */
export function catalogConnectSteps(entry: Pick<ConnectionCatalogEntry, "platform">): string {
  return t(`catalog:connect.${entry.platform}`);
}

/** Localized destination page name for a catalog entry. */
export function catalogPageName(entry: Pick<ConnectionCatalogEntry, "pageHref">): string {
  return t(`catalog:pages.${pageKeyFromHref(entry.pageHref)}`);
}

/**
 * Single source of truth: which integrations exist, where to connect them, and what the server needs.
 * Keep in sync when adding new AccountPlatform values.
 */
export const CONNECTION_CATALOG: ConnectionCatalogEntry[] = [
  {
    platform: "instagram",
    label: "Instagram",
    areas: ["social", "messages"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps:
      "Öppna Kopplingar → Instagram → Koppla.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY. Optional: INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET.",
  },
  {
    platform: "facebook",
    label: "Facebook",
    areas: ["social", "messages"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Öppna Kopplingar → Facebook → Koppla.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "google_business",
    label: "Google Business Profile",
    areas: ["social", "reviews"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Öppna Kopplingar → Google Business Profile → Koppla (rekommenderat: Official API).",
    serverNeeds:
      "Official: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET with Business Profile APIs enabled. Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "whatsapp",
    label: "WhatsApp Business",
    areas: ["social", "messages"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Öppna Kopplingar → WhatsApp Business → Koppla.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    areas: ["social"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Öppna Kopplingar → TikTok → Koppla.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY; for official path also TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET.",
  },
  {
    platform: "youtube",
    label: "YouTube",
    areas: ["social"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Öppna Kopplingar → YouTube → Koppla.",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
  },
  {
    platform: "x",
    label: "X (Twitter)",
    areas: ["social"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Öppna Kopplingar → X (Twitter) → Koppla.",
    serverNeeds: "X_CLIENT_ID + X_CLIENT_SECRET.",
  },
  {
    platform: "google_ads",
    label: "Google Ads",
    areas: ["marketing"],
    pageHref: "/marketing",
    pageName: "Marketing",
    connectSteps: "Öppna Kopplingar → Google Ads → Koppla (rekommenderat: Official API).",
    serverNeeds:
      "Official: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET with Google Ads API enabled. Live campaign API operations also need GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, and optionally GOOGLE_ADS_LOGIN_CUSTOMER_ID. Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "meta_business",
    label: "Meta Business",
    areas: ["marketing"],
    pageHref: "/marketing",
    pageName: "Marketing",
    connectSteps: "Öppna Kopplingar → Meta Business → Koppla.",
    serverNeeds:
      "META_APP_ID + META_APP_SECRET (or FACEBOOK_CLIENT_ID + FACEBOOK_CLIENT_SECRET) with the Meta callback URL allowed. Zernio currently returns Platform not supported for Meta Business in this workspace.",
  },
  {
    platform: "shopify",
    label: "Shopify",
    areas: ["ecommerce", "marketing"],
    pageHref: "/ecommerce",
    pageName: "E-commerce",
    connectSteps:
      "Öppna Kopplingar → Shopify → Koppla. Använd domänen som slutar på .myshopify.com.",
    serverNeeds: "SHOPIFY_API_KEY + SHOPIFY_API_SECRET + public HTTPS SHOPIFY_APP_URL for callbacks.",
  },
  {
    platform: "notion",
    label: "Notion",
    areas: ["ecommerce"],
    pageHref: "/ecommerce",
    pageName: "E-commerce",
    connectSteps: "Öppna Kopplingar → Notion → Koppla.",
    serverNeeds: "NOTION_CLIENT_ID + NOTION_CLIENT_SECRET + public HTTPS NOTION_APP_URL for callbacks.",
  },
  {
    platform: "fortnox",
    label: "Fortnox",
    areas: ["economy"],
    pageHref: "/company?tab=economy",
    pageName: "Company",
    connectSteps: "Öppna Kopplingar → Fortnox → Koppla. Logga in med ditt Fortnox-konto och godkänn åtkomsten.",
    serverNeeds:
      "FORTNOX_CLIENT_ID + FORTNOX_CLIENT_SECRET from developer.fortnox.se; FORTNOX_APP_URL if the callback base differs from API_BASE_URL.",
  },
  {
    platform: "gmail",
    label: "Gmail",
    areas: ["messages"],
    pageHref: "/messages",
    pageName: "Messages",
    connectSteps: "Öppna Kopplingar → Gmail → Koppla.",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Gmail API enabled in Google Cloud).",
  },
  {
    platform: "outlook",
    label: "Outlook mail",
    areas: ["messages"],
    pageHref: "/messages",
    pageName: "Messages",
    connectSteps: "Öppna Kopplingar → Outlook mail → Koppla.",
    serverNeeds: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET.",
  },
  {
    platform: "google_calendar",
    label: "Google Calendar",
    areas: ["calendar"],
    pageHref: "/calendar",
    pageName: "Calendar",
    connectSteps: "Öppna Kopplingar → Google Calendar → Koppla.",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET; Zernio path also needs ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "outlook_calendar",
    label: "Outlook Calendar",
    areas: ["calendar"],
    pageHref: "/calendar",
    pageName: "Calendar",
    connectSteps: "Öppna Kopplingar → Outlook Calendar → Koppla.",
    serverNeeds: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET; Zernio path also needs ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "google_reviews",
    label: "Google Reviews (Business Profile)",
    areas: ["reviews"],
    pageHref: "/reviews",
    pageName: "Reviews",
    connectSteps: "Öppna Kopplingar → Google Reviews → Koppla.",
    serverNeeds:
      "Official: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + Business Profile APIs in Google Cloud. Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "tripadvisor",
    label: "Tripadvisor",
    areas: ["reviews"],
    pageHref: "/reviews",
    pageName: "Reviews",
    connectSteps:
      "Öppna Kopplingar → Tripadvisor → Koppla.",
    serverNeeds:
      "Official Content API: TRIPADVISOR_API_KEY + TRIPADVISOR_LOCATION_ID (or per-account values). Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "judgeme",
    label: "Judge.me",
    areas: ["reviews", "ecommerce"],
    pageHref: "/reviews",
    pageName: "Reviews",
    connectSteps:
      "Öppna Kopplingar → Judge.me → Koppla. Ange butikens .myshopify.com-domän och din privata API-token från Judge.me admin → Settings → Integrations.",
    serverNeeds:
      "No server credentials required — shop domain + private API token are stored per profile. Optional fallback: JUDGEME_SHOP_DOMAIN + JUDGEME_API_TOKEN.",
  },
  {
    platform: "google_drive",
    label: "Google Drive",
    areas: ["content"],
    pageHref: "/content",
    pageName: "Content",
    connectSteps:
      "Öppna Kopplingar → Google Drive → Koppla. Omkoppla efter scope-uppgradering om Instagram Drive-kön ska flytta filer.",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Drive scope enabled for your OAuth client).",
  },
  {
    platform: "canva",
    label: "Canva",
    areas: ["content", "social"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "Öppna Kopplingar → Canva → Koppla. Exportera sedan bilder från Social Media.",
    serverNeeds:
      "CANVA_CLIENT_ID + CANVA_CLIENT_SECRET from a Canva Connect integration. CANVA_ACCESS_TOKEN is still supported as a legacy fallback.",
  },
  // --- Remote MCP data providers (OAuth or API-key / shop-domain connect) ---
  {
    platform: "dayai",
    label: "Day.ai",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Day.ai → Koppla via OAuth MCP.",
    serverNeeds: "Optional env override: DAYAI_CLIENT_ID + DAYAI_CLIENT_SECRET. Otherwise dynamic client registration.",
  },
  {
    platform: "windsor",
    label: "Windsor.ai",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Windsor.ai → Koppla via OAuth MCP.",
    serverNeeds: "Optional: WINDSOR_CLIENT_ID + WINDSOR_CLIENT_SECRET.",
  },
  {
    platform: "era",
    label: "Era",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Era → Koppla via OAuth MCP.",
    serverNeeds: "Optional: ERA_CLIENT_ID + ERA_CLIENT_SECRET.",
  },
  {
    platform: "ahrefs",
    label: "Ahrefs",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Ahrefs → Koppla via OAuth MCP.",
    serverNeeds: "Optional: AHREFS_CLIENT_ID + AHREFS_CLIENT_SECRET.",
  },
  {
    platform: "canva_mcp",
    label: "Canva MCP",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Canva MCP → Koppla via OAuth MCP.",
    serverNeeds: "Optional: CANVA_MCP_CLIENT_ID + CANVA_MCP_CLIENT_SECRET.",
  },
  {
    platform: "superhuman_mcp",
    label: "Superhuman Mail",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "Öppna Kopplingar → Superhuman Mail → Koppla via OAuth MCP.",
    serverNeeds:
      "Optional: SUPERHUMAN_MCP_CLIENT_ID + SUPERHUMAN_MCP_CLIENT_SECRET. Otherwise dynamic client registration.",
  },
  {
    platform: "supermetrics_mcp",
    label: "Supermetrics",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "Öppna Kopplingar → Supermetrics → Koppla via OAuth MCP.",
    serverNeeds:
      "Optional: SUPERMETRICS_MCP_CLIENT_ID + SUPERMETRICS_MCP_CLIENT_SECRET. Otherwise dynamic client registration.",
  },
  {
    platform: "exa",
    label: "Exa",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Exa → ange API-nyckel.",
    serverNeeds: "Exa API key from dashboard.exa.ai.",
  },
  {
    platform: "klarity",
    label: "Klarity Architect",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Klarity Architect → ange API-token.",
    serverNeeds: "Klarity Architect API access token.",
  },
  {
    platform: "lunarcrush",
    label: "LunarCrush",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → LunarCrush → ange API-nyckel.",
    serverNeeds: "LunarCrush API key.",
  },
  {
    platform: "peec",
    label: "Peec AI",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Peec AI → ange API-nyckel.",
    serverNeeds: "Peec AI API key from app.peec.ai settings.",
  },
  {
    platform: "sprouts",
    label: "Sprouts Data Intelligence",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Sprouts → Koppla (API-nyckel valfri).",
    serverNeeds: "Optional Sprouts API key.",
  },
  {
    platform: "gamma",
    label: "Gamma",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → Gamma → ange API-nyckel.",
    serverNeeds: "Gamma API key from Account settings.",
  },
  {
    platform: "godaddy",
    label: "GoDaddy Domains",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Öppna Kopplingar → GoDaddy Domains → ange KEY:SECRET.",
    serverNeeds: "GoDaddy developer API key (sso-key format).",
  },
  {
    platform: "shopify_mcp",
    label: "Shopify Storefront MCP",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "Öppna Kopplingar → Shopify Storefront MCP → ange .myshopify.com-domän.",
    serverNeeds: "No server credentials — storefront tools are public per shop domain.",
  },
  {
    platform: "twilio_mcp",
    label: "Twilio Docs MCP",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "Öppna Kopplingar → Twilio Docs MCP → Koppla med ett klick.",
    serverNeeds: "No credentials — hosted at mcp.twilio.com/docs.",
  },
];

const byAreaCache: Record<AppArea, ConnectionCatalogEntry[]> = {
  social: [],
  marketing: [],
  ecommerce: [],
  economy: [],
  messages: [],
  calendar: [],
  reviews: [],
  content: [],
  intelligence: [],
};

for (const row of CONNECTION_CATALOG) {
  for (const area of row.areas) {
    byAreaCache[area].push(row);
  }
}

export function getConnectionEntriesForArea(area: AppArea): ConnectionCatalogEntry[] {
  return byAreaCache[area];
}

export function getCatalogByArea(): Record<AppArea, ConnectionCatalogEntry[]> {
  return byAreaCache;
}
