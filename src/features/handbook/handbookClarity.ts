/**
 * Plain-language clarity layer for the handbook.
 * Keeps `handbookCatalog.ts` as the structural source of truth (tabs, hrefs, status)
 * while this file explains outcomes: purpose + what you can do.
 */

export type PageClarity = {
  purpose: string;
  /** Short action list — what a user can accomplish on this page. */
  canDo: string[];
  /** Optional one-liner: connect X first, business mode only, etc. */
  tip?: string;
};

/** Feature id → clearer “You can …” copy (optional why / needs). */
export type FeatureClarity = {
  youCan: string;
  why?: string;
  needs?: string;
};

export const pageClarity: Record<string, PageClarity> = {
  home: {
    purpose: "Start your day — see what needs attention and jump to the right work.",
    canDo: [
      "Read a daily brief of tasks, messages, reviews, ads and stock issues",
      "Approve AI drafts before anything is sent",
      "See today’s wins and weekly progress at a glance",
      "Open common tools via shortcut tiles",
      "Follow the welcome tour / first-win checklist if you are new",
    ],
    tip: "Open Home from the logo or mobile Home tab — it is not a sidebar Work item.",
  },
  content: {
    purpose: "Find media, create variants, then publish or schedule safely.",
    canDo: [
      "Browse Google Drive or upload local files",
      "Build a selected set of images/videos to work on",
      "Generate ideas, reels and image transforms",
      "Write captions and publish/schedule to social accounts",
      "Reuse or clear previously generated assets from History",
    ],
    tip: "Follow the flow bar: Browse → Selected → Create → Publish.",
  },
  "social-media": {
    purpose: "Run your social channels — publish, measure and automate posting.",
    canDo: [
      "Publish or schedule posts to connected networks",
      "Check which platforms are healthy before you post",
      "View stats and optional AI profile tips",
      "Manage scheduled posts",
      "Set up Instagram posting from a Google Drive folder (daily queue)",
    ],
    tip: "Instagram Drive queue needs Drive reconnect (full access) + Instagram connected.",
  },
  ecommerce: {
    purpose: "Run the store from one cockpit — sales, catalog, ads and purchases.",
    canDo: [
      "See revenue, orders, customers, products, ad spend and purchase costs",
      "Open detail sheets for products, customers, ads, sales and purchases",
      "Act on smart alerts (unfulfilled orders, low stock, weak ROAS, overdue invoices)",
      "Filter and export Shopify orders; draft abandoned-cart recovery emails",
      "Manage your product catalog and import from Shopify or Alibaba",
    ],
    tip: "Connect Shopify for the core store view; Meta/Google Ads and Fortnox unlock ads and purchases.",
  },
  sales: {
    purpose: "Find, track and message leads without losing follow-ups.",
    canDo: [
      "Create and update leads with statuses and follow-ups",
      "Draft outreach messages with AI and send only after review",
      "Move deals on a pipeline board",
      "See a sales overview with next actions",
      "Explore discovery ideas and sales goals when you want a longer plan",
    ],
  },
  marketing: {
    purpose: "Plan campaigns and see if paid ads actually pay back.",
    canDo: [
      "Track campaign tasks and follow-ups",
      "Read Meta/Google ad performance and ROAS vs Shopify revenue",
      "Get AI ideas for channels and promotions",
      "Follow guided growth paths and research helpers",
    ],
    tip: "Connect Meta Business and/or Google Ads (and Shopify for ROAS).",
  },
  "digital-brand": {
    purpose: "Check how your website and brand presence look to customers.",
    canDo: [
      "Run a site readiness / performance-style audit",
      "Get prioritized SEO, speed, trust and channel recommendations",
      "Research competitors and brand context via MCP tools",
    ],
  },
  customers: {
    purpose: "Work with a simple customer list (CSV) for outreach and segments.",
    canDo: [
      "Upload, search and export a customer CSV for this profile",
      "Use the MCP customer assistant when providers are connected",
    ],
    tip: "This is not live Shopify CRM — store buyers also appear under E-commerce Overview/Insights.",
  },
  calendar: {
    purpose: "See meetings, tasks and scheduled posts on one calendar.",
    canDo: [
      "Create local events for the profile",
      "Sync Google or Outlook calendars via Official API",
      "See tasks, leads and scheduled social posts as overlays",
      "Switch Day / Week / Month views",
    ],
    tip: "Connect calendars with Google/Microsoft official — the Zernio path often returns no events.",
  },
  messages: {
    purpose: "Answer mail and social DMs in one inbox.",
    canDo: [
      "Read and reply in Gmail/Outlook, Instagram, Messenger and WhatsApp",
      "Use mail folders (create/move) on Gmail and Outlook",
      "Triage with Today / This week / FYI / Noise buckets",
      "Draft AI replies (review before send)",
      "Hand off auto-reply setup to Automations",
    ],
    tip: "Social DMs need the Zernio Inbox add-on enabled in the Zernio dashboard.",
  },
  reviews: {
    purpose: "Protect reputation — read reviews and answer them well.",
    canDo: [
      "Inbox reviews from Google (Official Business Profile), Tripadvisor Content API, Judge.me",
      "Draft AI replies and keep them in Drafts until you approve",
      "Inspect place ratings and photos",
      "Request Judge.me reviews when that integration is connected",
    ],
    tip: "Prefer Official Google Reviews and Tripadvisor Content API — Zernio reviews often 404. Judge.me replies are copy-paste only.",
  },
  tasks: {
    purpose: "Keep operational to-dos clear so nothing important slips.",
    canDo: [
      "Create tasks with checklists and due dates",
      "Filter Today / Overdue / All",
      "Scope by module: general, sales pipeline or marketing campaigns",
      "Use optional AI help to phrase or break down tasks",
    ],
  },
  insights: {
    purpose: "See trends across social, ads, reviews and the website.",
    canDo: [
      "Scan a cross-channel overview",
      "Chart social follower trends",
      "View marketing/ad trends when ads data exists",
      "Summarize review accounts",
      "Check website analytics when tracking is set up",
    ],
  },
  activity: {
    purpose: "Audit what the system (and agents) actually did.",
    canDo: [
      "Browse a searchable activity feed",
      "Filter by severity (error, warning, success, …)",
      "Trace failed automations and publishes",
      "See external agent runs when agents post activity",
    ],
  },
  automations: {
    purpose: "Turn recurring work on — schedules, queues and run health.",
    canDo: [
      "Enable and schedule jobs under Messages, Content, Reports or Insights",
      "See last run, failures and retry options",
      "Turn on Instagram Drive queue jobs (folders are set on Social)",
      "Check multi-step flow health on Insights",
    ],
    tip: "Nothing sensitive should send without your approval where the product uses draft-first flows.",
  },
  "ai-recommendations": {
    purpose: "Turn AI ideas into decisions you accept or dismiss.",
    canDo: [
      "Generate and refresh suggestions",
      "Filter by kind",
      "Accept suggestions you want to act on",
      "Dismiss noise so Active stays useful",
    ],
  },
  intelligence: {
    purpose: "Ask connected MCP tools for research, catalog and marketing answers.",
    canDo: [
      "Check which MCP providers are ready (Status)",
      "Compare sources, research markets/leads/competitors",
      "Query SEO/marketing, content/decks, Shopify catalog, CRM & mail",
      "Explore raw tools and developer/docs helpers",
    ],
    tip: "Every tab needs the matching MCP provider or key — start on Status.",
  },
  company: {
    purpose: "Define the brand the rest of the app writes and plans from.",
    canDo: [
      "Edit company name, website, notes and brand fields",
      "Improve completeness and auto-fill from the website",
      "Open Fortnox economy (invoices, costs, suppliers)",
      "Run company research helpers",
      "See which sources feed this profile",
    ],
  },
  connections: {
    purpose: "Plug in the accounts every other page depends on.",
    canDo: [
      "Connect Shopify, Google, Meta, mail, Drive, Fortnox and more via guided sessions",
      "Run the connect wizard and deep-link `?session=<platform>`",
      "Fix expired tokens on the Health tab",
      "Manage MCP provider status",
    ],
    tip: "Prefer Connect sessions over pasting tokens. Healthy connections unlock most beta features.",
  },
  preferences: {
    purpose: "Control language, AI, keys, team and privacy for your account.",
    canDo: [
      "Override UI language (otherwise SE→Swedish, else English)",
      "Configure AI behavior",
      "Store encrypted API keys (OpenAI, API.AI, …)",
      "Invite team members to the business profile",
      "Customize quick navigation",
      "Delete the active profile and its cascaded data",
      "Open this handbook and Zernio help",
    ],
  },
  handbook: {
    purpose: "Understand every area of the product and what is ready vs needs setup.",
    canDo: [
      "Search pages, tabs and features",
      "Filter by Ready / Needs setup / Under development",
      "Jump straight into any page or tab",
    ],
  },
};

export const featureClarity: Record<string, FeatureClarity> = {
  "daily-brief": {
    youCan: "Read one morning briefing of what needs action across the business.",
    why: "Stops you from checking five apps before you know the priority.",
  },
  "welcome-tour": {
    youCan: "Follow a guided first-win path: connect accounts and complete a real first action.",
    why: "Gets new users productive instead of stuck on an empty dashboard.",
  },
  "wins-today": {
    youCan: "See approvals and publishes you already finished today.",
    why: "Makes progress visible without opening Activity.",
  },
  "approve-drafts": {
    youCan: "Approve or reject AI drafts for replies and outreach before anything sends.",
    why: "Keeps automation safe — humans stay in control of outbound messages.",
  },
  "weekly-results": {
    youCan: "Compare this week’s activity to last week in a short snapshot.",
  },
  "today-tiles": {
    youCan: "Jump into tasks, messages, leads, reviews or connection health in one click.",
  },
  "sync-freshness": {
    youCan: "See when connections last synced so you know if numbers might be stale.",
  },
  "market-pulse": {
    youCan: "Check an external market/social pulse for the business profile.",
    needs: "Business mode + MCP/pulse provider.",
  },
  "profile-list": {
    youCan: "List and edit profiles when you manage more than one brand or space.",
    why: "Day-to-day switching also lives in the header chrome.",
  },
  "home-ai-recs": {
    youCan: "See open AI suggestions without leaving Home.",
  },
  "flow-status": {
    youCan: "Spot whether key automations are healthy or failing.",
  },
  "quick-nav": {
    youCan: "Open your favorite destinations quickly (customize under Preferences → Navigation).",
  },
  "drive-browse": {
    youCan: "Browse Google Drive folders and pick media for content work.",
    needs: "Google Drive connected.",
  },
  "local-upload": {
    youCan: "Upload images/videos from your computer into the working set.",
  },
  selection: {
    youCan: "Select, reorder and prepare the exact assets you will create or publish.",
  },
  ideas: {
    youCan: "Generate content ideas grounded in the company profile.",
  },
  "reel-builder": {
    youCan: "Build short vertical video clips (e.g. 30/60s) from selected media.",
    needs: "Video tooling / API setup.",
  },
  "apiai-tools": {
    youCan: "Remove backgrounds, resize, add shadows and run other image tools.",
    needs: "API.AI key in Preferences → API keys.",
  },
  canva: {
    youCan: "Open Canva with your brand context for design work.",
    needs: "Canva OAuth connected.",
  },
  composer: {
    youCan: "Write a caption and publish or schedule to connected social accounts.",
  },
  "publish-readiness": {
    youCan: "Get blocked or warned if media looks unsafe or incomplete before publish.",
    why: "Prevents bad posts from going out by accident.",
  },
  "generated-history": {
    youCan: "Reuse or clear AI/generated assets you created earlier.",
  },
  "social-composer": {
    youCan: "Publish or schedule to Instagram, TikTok, YouTube, X, Facebook and more.",
    needs: "Matching social accounts connected (often via Zernio).",
  },
  "connect-status": {
    youCan: "See which networks are healthy so you fix them before a failed publish.",
  },
  "account-stats": {
    youCan: "View follower and engagement snapshots for connected accounts.",
  },
  "ai-profile": {
    youCan: "Run an AI read of the social profile for positioning tips.",
    needs: "AI configured + social account data.",
  },
  gbp: {
    youCan: "View Google Business Profile oriented stats.",
    needs: "Google Business connected.",
  },
  scheduled: {
    youCan: "List and manage posts already queued for later.",
  },
  "drive-queue": {
    youCan:
      "Post one Drive image per day to Instagram with brand/AI captions, then auto-move the file to a posted folder.",
    why: "Keeps a to-post folder emptying itself without manual daily uploads.",
    needs: "Drive (full access) + Instagram + folders set; enable cron under Automations → Content.",
  },
  "social-workflows": {
    youCan: "See and manage social-related automation workflows from Schedule & more.",
  },
  "social-ideas": {
    youCan: "Get social-specific content ideas.",
  },
  "ai-image": {
    youCan: "Generate or transform images for posts.",
    needs: "API.AI and/or Canva.",
  },
  "ecom-overview-kpis": {
    youCan:
      "Scan store KPIs (revenue, sales, customers, products, ad spend, purchases) and tap them for details.",
  },
  "ecom-overview-sections": {
    youCan:
      "Drill into products, customers, ads, sales and purchases — export, add leads, recover carts, open Marketing/Economy.",
    why: "One place instead of Shopify admin + ads + Fortnox separately.",
  },
  "orders-list": {
    youCan: "Filter Shopify orders by payment/fulfillment, expand line items and export CSV.",
  },
  "action-needed": {
    youCan: "Jump to stale unfulfilled orders, pending payments or low-stock issues.",
  },
  "cart-recovery": {
    youCan: "Draft an abandoned-cart recovery email — you approve before send.",
  },
  "product-catalog": {
    youCan: "Create/edit products and versions, or import the Shopify catalog.",
  },
  "product-content-drafts": {
    youCan: "Approve AI description/tag drafts for thin listings before they write to the catalog or Shopify.",
  },
  "store-insights": {
    youCan: "See 30-day revenue, top products/customers and promotions; add buyers as leads.",
  },
  alibaba: {
    youCan: "Paste an Alibaba/1688 link to import title, specs and images into a draft product.",
  },
  notion: {
    youCan: "Browse a connected Notion workspace next to commerce tools.",
    needs: "Notion connected.",
  },
  "shop-info": {
    youCan: "See shop name, domain, plan, currency and timezone.",
  },
  "leads-crm": {
    youCan: "Capture leads, update status and plan follow-ups.",
  },
  "outreach-queue": {
    youCan: "Generate outreach drafts with AI and review them before sending.",
  },
  "pipeline-board": {
    youCan: "Move deals across pipeline stages on a kanban board.",
  },
  "sales-overview": {
    youCan: "See next sales actions and optional Shopify metrics in one hub.",
  },
  discover: {
    youCan: "Explore brand/channel discovery ideas and a sales playbook.",
    needs: "AI/MCP helpers work best when connected.",
  },
  goals: {
    youCan: "Set sales goals and track progress (optional Shopify sync).",
  },
  "campaign-tasks": {
    youCan: "Track marketing campaign tasks and follow-ups.",
  },
  "ad-performance": {
    youCan: "Read Meta/Google spend, conversions and ROAS vs Shopify revenue.",
    needs: "Ad accounts + Shopify for full ROAS.",
  },
  "ad-comments": {
    youCan: "Read comments on Meta ad posts and reply on Facebook when Page tokens are connected.",
    needs: "Meta Business Official API reconnect with pages_read_engagement + Page access.",
  },
  "marketing-ideas": {
    youCan: "Get AI ideas for channels, promos and campaign angles.",
  },
  "marketing-paths": {
    youCan: "Follow guided growth paths and MCP research helpers.",
  },
  "site-audit": {
    youCan: "Audit site readiness and performance-style signals.",
  },
  "brand-recs": {
    youCan: "Get prioritized SEO, speed, trust and channel recommendations.",
  },
  "brand-research": {
    youCan: "Research brand and competitors via MCP sources.",
  },
  "csv-customers": {
    youCan: "Upload, search and export a CSV customer list for this profile.",
    why: "Handy for offline lists — not a live Shopify customer sync.",
  },
  "customer-mcp": {
    youCan: "Ask MCP customer tools for help when providers are connected.",
  },
  "local-events": {
    youCan: "Create and edit calendar events for the profile.",
  },
  "provider-sync": {
    youCan: "Pull events from Google Calendar or Outlook Calendar.",
    needs: "Calendar connected via Official API (Google/Microsoft).",
  },
  overlays: {
    youCan: "See tasks, leads and scheduled social posts on the same calendar.",
  },
  "mail-inbox": {
    youCan: "Read Gmail/Outlook threads with sort and unread counts.",
    needs: "Gmail or Outlook connected.",
  },
  "mail-folders": {
    youCan: "Browse, create and move messages between mail folders.",
  },
  "triage-buckets": {
    youCan: "Filter the inbox into Today, This week, FYI or Noise.",
    why: "Action-oriented triage instead of endless chronological scroll.",
  },
  "social-inbox": {
    youCan: "Read and reply to Instagram, Messenger and WhatsApp conversations.",
    needs: "Those channels connected via Zernio with the Inbox add-on enabled.",
  },
  reply: {
    youCan: "Send replies through the connected provider from inside the app.",
  },
  "ai-draft": {
    youCan: "Draft or summarize replies with AI, then edit before send.",
  },
  "auto-reply": {
    youCan: "Open Automations to configure scheduled auto-reply flows.",
  },
  "reviews-inbox": {
    youCan: "Read reviews from connected sources and reply when the provider allows.",
    needs: "Google Reviews via Official OAuth, Tripadvisor Content API, and/or Judge.me.",
  },
  "review-drafts": {
    youCan: "Park AI/manual review replies in Drafts until you approve them.",
  },
  "place-info": {
    youCan: "Inspect place ratings and photos for the business location.",
  },
  "judgeme-request": {
    youCan: "Request Judge.me reviews when Judge.me is connected.",
  },
  "task-board": {
    youCan: "Create tasks with checklists, due dates and search.",
  },
  "module-filter": {
    youCan: "Focus on general, pipeline or campaign tasks only.",
  },
  "ai-task-assist": {
    youCan: "Ask AI to help phrase or break down a task.",
    needs: "AI settings/keys.",
  },
  "insights-overview": {
    youCan: "Scan a high-level strip of signals across connected analytics.",
  },
  "social-trends": {
    youCan: "Chart social follower trends from stored snapshots.",
  },
  "marketing-trends": {
    youCan: "View marketing/ad trends when ads data exists.",
  },
  "review-summaries": {
    youCan: "See account-level review summaries.",
  },
  "site-analytics": {
    youCan: "Check website analytics when tracking is configured.",
  },
  "activity-feed": {
    youCan: "Search and filter the system audit log by severity and module.",
  },
  "agent-activity": {
    youCan: "See runs from external agents when they post into the activity API.",
  },
  "auto-messages": {
    youCan: "Enable message-related cron jobs (e.g. auto-reply) and watch run status.",
  },
  "auto-content": {
    youCan: "Enable content crons including Instagram Drive queue enqueue.",
    why: "Folder setup lives on Social → Schedule & more.",
  },
  "auto-reports": {
    youCan: "Enable scheduled report/digest jobs.",
  },
  "flow-status-auto": {
    youCan: "Check multi-step flow health and optional MCP developer widgets.",
  },
  "recs-list": {
    youCan: "Generate, filter, accept or dismiss AI suggestions on Active.",
  },
  "recs-accepted": {
    youCan: "Review suggestions you already accepted.",
  },
  "recs-dismissed": {
    youCan: "Review suggestions you dismissed.",
  },
  "mcp-status": {
    youCan: "See which MCP providers and keys are ready before you query.",
  },
  "mcp-compare": {
    youCan: "Compare information across connected research sources.",
  },
  "mcp-research": {
    youCan: "Research markets, leads and competitors.",
  },
  "mcp-marketing": {
    youCan: "Run SEO and marketing data queries.",
  },
  "mcp-content": {
    youCan: "Generate decks or get design assistance via MCP.",
  },
  "mcp-commerce": {
    youCan: "Ask questions against your Shopify catalog.",
    needs: "Shopify + commerce MCP.",
  },
  "mcp-crm-mail": {
    youCan: "Query CRM-style helpers and search mail via MCP.",
  },
  "mcp-catalog": {
    youCan: "Browse which MCP features exist and what they need.",
  },
  "raw-tools": {
    youCan: "Inspect raw MCP tools for debugging and power use.",
  },
  "mcp-developer": {
    youCan: "Search docs, look up domains and query architecture/context tools.",
  },
  "company-profile": {
    youCan: "Edit the company profile used for captions, outreach and AI context.",
  },
  "completeness-autofill": {
    youCan: "Improve profile completeness and auto-fill fields from the website.",
  },
  fortnox: {
    youCan: "Work with Fortnox invoices, costs, suppliers and financial snapshot.",
    needs: "Fortnox connected. Also feeds E-commerce → Purchases.",
  },
  "company-research": {
    youCan: "Run research helpers against the company domain.",
  },
  "connected-sources": {
    youCan: "See a read-only list of what feeds this company profile.",
  },
  "oauth-grid": {
    youCan: "Connect integrations with a guided session (why → connect → probe → done).",
    why: "This is the main unlock for almost every other page.",
  },
  "health-panel": {
    youCan: "Find and fix expired tokens or failing connection probes.",
  },
  "mcp-providers": {
    youCan: "Check MCP server status used by Intelligence and page widgets.",
  },
  language: {
    youCan: "Override UI language, or let geo pick Swedish (SE) vs English.",
  },
  "notif-appearance": {
    youCan: "See placeholder cards for notifications, appearance and security.",
    why: "Not wired to real controls yet.",
  },
  "ai-settings": {
    youCan: "Configure how AI features behave for this tenant.",
  },
  secrets: {
    youCan: "Store encrypted operator API keys per profile.",
    why: "Advanced path — day-to-day connects use OAuth on Connections.",
  },
  team: {
    youCan: "Invite teammates to the business profile.",
  },
  "quick-nav-prefs": {
    youCan: "Choose which destinations appear in quick navigation.",
  },
  "data-privacy": {
    youCan: "Understand profile-scoped data and permanently delete the active profile.",
    why: "Deletes cascaded connections, secrets and profile documents. Not a CSV export tool.",
  },
  "handbook-link": {
    youCan: "Open this handbook from Preferences → Help.",
  },
  "zernio-help": {
    youCan: "Learn how Zernio brokers several social/inbox/review connections.",
  },
  "handbook-page": {
    youCan: "Search and filter the full product map by readiness.",
  },
};

export function clarifyFeature(
  featureId: string,
  fallbackDescription: string
): FeatureClarity {
  return (
    featureClarity[featureId] ?? {
      youCan: fallbackDescription,
    }
  );
}
