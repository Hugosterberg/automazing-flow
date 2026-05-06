import type { AccountPlatform } from "@/types/accounts";

/** Logical product areas (matches main nav groupings). */
export type AppArea = "social" | "ecommerce" | "messages" | "calendar" | "reviews" | "content";

export const AREA_ORDER: AppArea[] = ["social", "ecommerce", "messages", "calendar", "reviews", "content"];

export const AREA_LABELS: Record<AppArea, string> = {
  social: "Social media",
  ecommerce: "Organization & commerce",
  messages: "Mail",
  calendar: "Calendar",
  reviews: "Reviews",
  content: "Content library",
};

export type ConnectionCatalogEntry = {
  platform: AccountPlatform;
  label: string;
  area: AppArea;
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
    area: "social",
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps:
      "Use Connect on this page or in the sidebar. Usually via Zernio; optional direct Instagram OAuth if configured.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY. Optional: INSTAGRAM_CLIENT_ID + INSTAGRAM_CLIENT_SECRET.",
  },
  {
    platform: "facebook",
    label: "Facebook",
    area: "social",
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Connect via Zernio from Social Media, Connect accounts, or the sidebar.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "google_business",
    label: "Google Business Profile",
    area: "social",
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Connect via the official Google Business Profile OAuth flow.",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET with Business Profile APIs enabled in Google Cloud.",
  },
  {
    platform: "whatsapp",
    label: "WhatsApp Business",
    area: "social",
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Connect via Zernio from Social Media or Connect accounts.",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    area: "social",
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Use Connect on Social Media (Zernio and/or official TikTok OAuth, depending on provider choice).",
    serverNeeds: "ZERNIO_API_KEY or LATE_API_KEY; for official path also TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET.",
  },
  {
    platform: "youtube",
    label: "YouTube",
    area: "social",
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Use Connect on Social Media (Google OAuth for YouTube).",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET.",
  },
  {
    platform: "x",
    label: "X (Twitter)",
    area: "social",
    pageHref: "/social-media",
    pageName: "Social Media",
    connectSteps: "Use Connect on Social Media (X OAuth).",
    serverNeeds: "X_CLIENT_ID + X_CLIENT_SECRET.",
  },
  {
    platform: "shopify",
    label: "Shopify",
    area: "ecommerce",
    pageHref: "/ecommerce",
    pageName: "Organization & Management",
    connectSteps: "Open Organization & Management → Connect Shopify (you will be asked for the .myshopify.com shop domain).",
    serverNeeds: "SHOPIFY_API_KEY + SHOPIFY_API_SECRET + public HTTPS SHOPIFY_APP_URL for callbacks.",
  },
  {
    platform: "notion",
    label: "Notion",
    area: "ecommerce",
    pageHref: "/ecommerce",
    pageName: "Organization & Management",
    connectSteps: "Open Organization & Management → Connect Notion.",
    serverNeeds: "NOTION_CLIENT_ID + NOTION_CLIENT_SECRET + public HTTPS NOTION_APP_URL for callbacks.",
  },
  {
    platform: "gmail",
    label: "Gmail",
    area: "messages",
    pageHref: "/messages",
    pageName: "Messages",
    connectSteps: "Open Messages → Connect Gmail (Google OAuth).",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Gmail API enabled in Google Cloud).",
  },
  {
    platform: "outlook",
    label: "Outlook mail",
    area: "messages",
    pageHref: "/messages",
    pageName: "Messages",
    connectSteps: "Open Messages → Connect Outlook (Microsoft OAuth).",
    serverNeeds: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET.",
  },
  {
    platform: "google_calendar",
    label: "Google Calendar",
    area: "calendar",
    pageHref: "/calendar",
    pageName: "Calendar",
    connectSteps: "Open Calendar → Connect Google Calendar (may use Zernio or official Google, depending on setup).",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET; Zernio path also needs ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "outlook_calendar",
    label: "Outlook Calendar",
    area: "calendar",
    pageHref: "/calendar",
    pageName: "Calendar",
    connectSteps: "Open Calendar → connect Outlook calendar from the Add flow / provider options.",
    serverNeeds: "MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET; Zernio path also needs ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "google_reviews",
    label: "Google Reviews (Business Profile)",
    area: "reviews",
    pageHref: "/reviews",
    pageName: "Reviews",
    connectSteps: "Open Reviews → Connect Google Reviews (official Google Business Profile APIs) or Zernio if available.",
    serverNeeds:
      "Official: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + Business Profile APIs in Google Cloud. Zernio: ZERNIO_API_KEY or LATE_API_KEY.",
  },
  {
    platform: "tripadvisor",
    label: "Tripadvisor",
    area: "reviews",
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
    area: "content",
    pageHref: "/content",
    pageName: "Content",
    connectSteps: "Open Content → Connect Google Drive.",
    serverNeeds: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Drive scope enabled for your OAuth client).",
  },
];

const byAreaCache: Record<AppArea, ConnectionCatalogEntry[]> = {
  social: [],
  ecommerce: [],
  messages: [],
  calendar: [],
  reviews: [],
  content: [],
};

for (const row of CONNECTION_CATALOG) {
  byAreaCache[row.area].push(row);
}

export function getConnectionEntriesForArea(area: AppArea): ConnectionCatalogEntry[] {
  return byAreaCache[area];
}

export function getCatalogByArea(): Record<AppArea, ConnectionCatalogEntry[]> {
  return byAreaCache;
}
