import type { AccountPlatform } from "@/types/accounts";
import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";

/** Logical product areas (matches main nav groupings). */
export type AppArea =
  | "social"
  | "marketing"
  | "ecommerce"
  | "messages"
  | "calendar"
  | "reviews"
  | "content"
  | "intelligence";

export const AREA_ORDER: AppArea[] = [
  "social",
  "marketing",
  "ecommerce",
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

export const AREA_LABELS: Record<AppArea, string> = {
  social: "Social media",
  marketing: "Marketing",
  ecommerce: "E-commerce",
  messages: "Messages & mail",
  calendar: "Calendar",
  reviews: "Reviews",
  content: "Content library",
  intelligence: "Intelligence & MCP",
};

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
  pageName: string;
  /** What the user does in the product */
  connectSteps: string;
  /** What must be set on the server (.env / Preferences) before OAuth succeeds */
  serverNeeds: string;
};

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
      "Use Connect on this page or in the sidebar. Usually via Zernio; optional direct Instagram OAuth if configured.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY. Optional: INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET.",
  },
  {
    platform: "facebook",
    label: "Facebook",
    areas: ["social", "messages"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Connect via Zernio from Social Media, Connect accounts, or the sidebar.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "google_business",
    label: "Google Business Profile",
    areas: ["social", "reviews"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Choose Official API or Zernio when connecting.",
    serverNeeds:
      "Official: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET with Business Profile APIs enabled. Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "whatsapp",
    label: "WhatsApp Business",
    areas: ["social", "messages"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Connect via Zernio from Social Media or Connect accounts.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    areas: ["social"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Use Connect on Social Media (Zernio and/or official TikTok OAuth, depending on provider choice).",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY; for official path also TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET.",
  },
  {
    platform: "youtube",
    label: "YouTube",
    areas: ["social"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Use Connect on Social Media (Google OAuth for YouTube).",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
  },
  {
    platform: "x",
    label: "X (Twitter)",
    areas: ["social"],
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Use Connect on Social Media (X OAuth).",
    serverNeeds: "X_CLIENT_ID + X_CLIENT_SECRET.",
  },
  {
    platform: "google_ads",
    label: "Google Ads",
    areas: ["marketing"],
    pageHref: "/marketing",
    pageName: "Marketing",
    connectSteps: "Open Marketing → choose Google official or Zernio.",
    serverNeeds:
      "Official: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET with Google Ads API enabled. Live campaign API operations also need GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, and optionally GOOGLE_ADS_LOGIN_CUSTOMER_ID. Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "meta_business",
    label: "Meta Business",
    areas: ["marketing"],
    pageHref: "/marketing",
    pageName: "Marketing",
    connectSteps: "Open Marketing → connect with Meta official.",
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
      "Open E-commerce → Connect Shopify. Find the shop domain in Shopify Admin → Settings → Domains and use the value ending in .myshopify.com.",
    serverNeeds: "SHOPIFY_API_KEY + SHOPIFY_API_SECRET + public HTTPS SHOPIFY_APP_URL for callbacks.",
  },
  {
    platform: "notion",
    label: "Notion",
    areas: ["ecommerce"],
    pageHref: "/ecommerce",
    pageName: "E-commerce",
    connectSteps: "Open E-commerce → Connect Notion.",
    serverNeeds: "NOTION_CLIENT_ID + NOTION_CLIENT_SECRET + public HTTPS NOTION_APP_URL for callbacks.",
  },
  {
    platform: "gmail",
    label: "Gmail",
    areas: ["messages"],
    pageHref: "/messages",
    pageName: "Messages",
    connectSteps: "Open Messages → Connect Gmail (Google OAuth).",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Gmail API enabled in Google Cloud).",
  },
  {
    platform: "outlook",
    label: "Outlook mail",
    areas: ["messages"],
    pageHref: "/messages",
    pageName: "Messages",
    connectSteps: "Open Messages → Connect Outlook (Microsoft OAuth).",
    serverNeeds: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET.",
  },
  {
    platform: "google_calendar",
    label: "Google Calendar",
    areas: ["calendar"],
    pageHref: "/calendar",
    pageName: "Calendar",
    connectSteps: "Open Calendar → Connect Google Calendar (may use Zernio or official Google, depending on setup).",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET; Zernio path also needs ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "outlook_calendar",
    label: "Outlook Calendar",
    areas: ["calendar"],
    pageHref: "/calendar",
    pageName: "Calendar",
    connectSteps: "Open Calendar → connect Outlook calendar from the Add flow / provider options.",
    serverNeeds: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET; Zernio path also needs ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "google_reviews",
    label: "Google Reviews (Business Profile)",
    areas: ["reviews"],
    pageHref: "/reviews",
    pageName: "Reviews",
    connectSteps: "Open Reviews → Connect Google Reviews (official Google Business Profile APIs) or Zernio if available.",
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
      "Open Reviews or sidebar: Zernio Tripadvisor connect, or manual Content API connect (location id + optional API key).",
    serverNeeds:
      "Official Content API: TRIPADVISOR_API_KEY + TRIPADVISOR_LOCATION_ID (or per-account values). Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "google_drive",
    label: "Google Drive",
    areas: ["content"],
    pageHref: "/content",
    pageName: "Content",
    connectSteps: "Open Content → Connect Google Drive.",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Drive scope enabled for your OAuth client).",
  },
  {
    platform: "canva",
    label: "Canva",
    areas: ["content", "social"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "Connect with Canva OAuth, then use Social Media -> Create post image -> Export Canva.",
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
    connectSteps: "OAuth MCP — CRM and assistant tools for your workspace.",
    serverNeeds: "Optional env override: DAYAI_CLIENT_ID + DAYAI_CLIENT_SECRET. Otherwise dynamic client registration.",
  },
  {
    platform: "windsor",
    label: "Windsor.ai",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "OAuth MCP — marketing data connectors via Windsor.",
    serverNeeds: "Optional: WINDSOR_CLIENT_ID + WINDSOR_CLIENT_SECRET.",
  },
  {
    platform: "era",
    label: "Era",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "OAuth MCP — Era context and forge tools.",
    serverNeeds: "Optional: ERA_CLIENT_ID + ERA_CLIENT_SECRET.",
  },
  {
    platform: "ahrefs",
    label: "Ahrefs",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "OAuth MCP — SEO data and site tools (apiv3-mcp scope).",
    serverNeeds: "Optional: AHREFS_CLIENT_ID + AHREFS_CLIENT_SECRET.",
  },
  {
    platform: "canva_mcp",
    label: "Canva MCP",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "OAuth MCP — broader Canva automation tools (separate from Canva Connect export).",
    serverNeeds: "Optional: CANVA_MCP_CLIENT_ID + CANVA_MCP_CLIENT_SECRET.",
  },
  {
    platform: "superhuman_mcp",
    label: "Superhuman Mail",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "OAuth MCP — search and act on Superhuman Mail via Ask AI. Requires Business/Enterprise with Ask AI enabled.",
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
      "OAuth MCP — marketing data connectors and query tools via Supermetrics. See supermetrics.com/docs/product-api-oauth.",
    serverNeeds:
      "Optional: SUPERMETRICS_MCP_CLIENT_ID + SUPERMETRICS_MCP_CLIENT_SECRET. Otherwise dynamic client registration.",
  },
  {
    platform: "exa",
    label: "Exa",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Paste your Exa API key — web search MCP.",
    serverNeeds: "Exa API key from dashboard.exa.ai.",
  },
  {
    platform: "klarity",
    label: "Klarity Architect",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Paste your Klarity API token.",
    serverNeeds: "Klarity Architect API access token.",
  },
  {
    platform: "lunarcrush",
    label: "LunarCrush",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Paste your LunarCrush API key — social/crypto sentiment MCP.",
    serverNeeds: "LunarCrush API key.",
  },
  {
    platform: "peec",
    label: "Peec AI",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Paste your Peec AI API key.",
    serverNeeds: "Peec AI API key from app.peec.ai settings.",
  },
  {
    platform: "sprouts",
    label: "Sprouts Data Intelligence",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Optional API key — server accepts keyless connects.",
    serverNeeds: "Optional Sprouts API key.",
  },
  {
    platform: "gamma",
    label: "Gamma",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Paste your Gamma API key — deck/content MCP.",
    serverNeeds: "Gamma API key from Account settings.",
  },
  {
    platform: "godaddy",
    label: "GoDaddy Domains",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps: "Paste GoDaddy API credentials as KEY:SECRET (optional for read-only).",
    serverNeeds: "GoDaddy developer API key (sso-key format).",
  },
  {
    platform: "shopify_mcp",
    label: "Shopify Storefront MCP",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "Enter your shop's .myshopify.com domain. Each store exposes public catalog/cart MCP at /api/mcp — see setup.shopify.com/mcp.",
    serverNeeds: "No server credentials — storefront tools are public per shop domain.",
  },
  {
    platform: "twilio_mcp",
    label: "Twilio Docs MCP",
    areas: ["intelligence"],
    pageHref: "/connections",
    pageName: "Connections",
    connectSteps:
      "One-click connect — semantic search over Twilio API docs and specs. No Twilio account or API key required.",
    serverNeeds: "No credentials — hosted at mcp.twilio.com/docs.",
  },
];

const byAreaCache: Record<AppArea, ConnectionCatalogEntry[]> = {
  social: [],
  marketing: [],
  ecommerce: [],
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
