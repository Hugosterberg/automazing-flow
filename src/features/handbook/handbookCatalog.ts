/**
 * English user handbook catalog — single source of truth for the Handbook page.
 * Status reflects code wiring honesty, not marketing:
 *   ready = shipped and usable for the core job
 *   beta  = works when prerequisites (OAuth, keys, MCP) are met; caveats apply
 *   wip   = UI/copy exists but incomplete or not wired end-to-end
 *
 * Keep tab names/ids aligned with PageModeTabs / ?tab= / ?view= / ?severity= in pages.
 */

export type HandbookStatus = "ready" | "beta" | "wip";

export type HandbookFeature = {
  id: string;
  name: string;
  /** What it does and the problem it aims to solve. */
  description: string;
  status: HandbookStatus;
};

export type HandbookTab = {
  id: string;
  name: string;
  /** Optional deep link (path + query). */
  href?: string;
  summary?: string;
  features: HandbookFeature[];
};

export type HandbookPage = {
  id: string;
  name: string;
  path: string;
  summary: string;
  group: "home" | "work" | "productivity" | "system";
  tabs: HandbookTab[];
};

export const HANDBOOK_STATUS_LABEL: Record<HandbookStatus, string> = {
  ready: "Ready",
  beta: "Works — needs setup",
  wip: "Under development",
};

export const handbookPages: HandbookPage[] = [
  {
    id: "home",
    name: "Home",
    path: "/",
    group: "home",
    summary:
      "Daily operating screen for the active profile. Reachable via the logo and mobile Home — not a sidebar Work item. Tabs: Today (default), Market pulse (business mode only), More.",
    tabs: [
      {
        id: "today",
        name: "Today",
        href: "/",
        summary: "Default home tab (`?tab=` omitted).",
        features: [
          {
            id: "daily-brief",
            name: "Daily brief",
            description:
              "Pulls live signals (tasks, messages, reviews, ads, inventory, connections) into one morning briefing so you know what to act on first.",
            status: "ready",
          },
          {
            id: "welcome-tour",
            name: "Welcome tour & first-win checklist",
            description:
              "Onboarding that walks new users into real flows (connect → first valuable action) instead of a dead-end splash screen. Bilingual chrome (SE→sv, else en; Preferences override).",
            status: "ready",
          },
          {
            id: "wins-today",
            name: "Wins today",
            description:
              "Short strip of completed approvals/publishes so progress is visible without opening Activity.",
            status: "ready",
          },
          {
            id: "approve-drafts",
            name: "Approve drafts",
            description:
              "Surfaces AI-generated replies and outreach drafts waiting for human approval before anything is sent.",
            status: "ready",
          },
          {
            id: "weekly-results",
            name: "Weekly results",
            description:
              "Week-over-week snapshot of activity so progress is visible without opening every analytics tab.",
            status: "ready",
          },
          {
            id: "today-tiles",
            name: "Today tiles",
            description:
              "Shortcut cards into tasks, messages, leads, reviews and connection health for the active business profile.",
            status: "ready",
          },
          {
            id: "sync-freshness",
            name: "Sync freshness",
            description:
              "Shows when connections last synced successfully so stale data is obvious.",
            status: "ready",
          },
        ],
      },
      {
        id: "pulse",
        name: "Market pulse",
        href: "/?tab=pulse",
        summary: "Shown in business workspace mode when pulse/MCP data is available.",
        features: [
          {
            id: "market-pulse",
            name: "Market pulse",
            description:
              "External market/social pulse for business profiles — depends on MCP/provider availability.",
            status: "beta",
          },
        ],
      },
      {
        id: "more",
        name: "More",
        href: "/?tab=more",
        features: [
          {
            id: "profile-list",
            name: "Profiles on this account",
            description:
              "List/edit profiles when you have several. Day-to-day switching also lives in the app chrome header.",
            status: "ready",
          },
          {
            id: "home-ai-recs",
            name: "AI recommendations widget",
            description: "Highlights open AI suggestions without leaving Home.",
            status: "ready",
          },
          {
            id: "flow-status",
            name: "Flow automation status",
            description: "Quick view of whether key automations are healthy or failing.",
            status: "ready",
          },
          {
            id: "quick-nav",
            name: "Quick-nav destinations",
            description: "Jump links into frequent areas (customizable under Preferences → Navigation).",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "content",
    name: "Content",
    path: "/content",
    group: "work",
    summary:
      "Find assets, create variants, and publish safely. Tabs: Browse (default) → Selected → Create → Publish → History. Next-step bar guides the flow.",
    tabs: [
      {
        id: "browse",
        name: "Browse",
        href: "/content?tab=browse",
        features: [
          {
            id: "drive-browse",
            name: "Google Drive browse",
            description:
              "Browse connected Drive folders and media so creative files live next to publishing — not in a separate tool.",
            status: "ready",
          },
          {
            id: "local-upload",
            name: "Local upload",
            description: "Upload files into the working set when Drive is not the source.",
            status: "ready",
          },
        ],
      },
      {
        id: "selected",
        name: "Selected",
        href: "/content?tab=selected",
        features: [
          {
            id: "selection",
            name: "Asset selection & reorder",
            description:
              "Build a working set of images/videos, reorder them, and hand them to Create or Publish.",
            status: "ready",
          },
        ],
      },
      {
        id: "create",
        name: "Create",
        href: "/content?tab=create",
        features: [
          {
            id: "ideas",
            name: "Content ideas hub",
            description: "AI-assisted ideas for posts and campaigns based on the company profile.",
            status: "ready",
          },
          {
            id: "reel-builder",
            name: "Reel builder",
            description:
              "Assemble short vertical clips (e.g. 30/60s) from selected media when video tooling is configured.",
            status: "beta",
          },
          {
            id: "apiai-tools",
            name: "Image transforms (API.AI)",
            description:
              "Background removal, resize, shadows and other image tools — requires a tenant API.AI key under Preferences → API keys.",
            status: "beta",
          },
          {
            id: "canva",
            name: "Canva brand studio",
            description: "Jump into Canva with brand context when Canva OAuth is connected.",
            status: "beta",
          },
        ],
      },
      {
        id: "publish",
        name: "Publish",
        href: "/content?tab=publish",
        features: [
          {
            id: "composer",
            name: "Publish composer",
            description:
              "Compose captions and schedule or send posts to connected social accounts.",
            status: "ready",
          },
          {
            id: "publish-readiness",
            name: "Publish readiness / moderation",
            description:
              "Blocks or warns on unsafe/incomplete media before publish so bad posts do not go out silently.",
            status: "ready",
          },
        ],
      },
      {
        id: "history",
        name: "History",
        href: "/content?tab=history",
        features: [
          {
            id: "generated-history",
            name: "Generated assets history",
            description:
              "Keeps prior AI/generated outputs (profile documents) so you can reuse or clear them.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "social-media",
    name: "Social",
    path: "/social-media",
    group: "work",
    summary:
      "Publish, measure and schedule social activity. Modes: Publish (default), Stats, Schedule & more.",
    tabs: [
      {
        id: "publish",
        name: "Publish",
        href: "/social-media?tab=publish",
        features: [
          {
            id: "social-composer",
            name: "Social publish composer",
            description:
              "Publish or schedule posts to Instagram, TikTok, YouTube, X, Facebook and more via connected accounts (often through Zernio).",
            status: "ready",
          },
          {
            id: "connect-status",
            name: "Per-platform connect status",
            description:
              "Shows which networks are healthy so you fix connections before a failed publish.",
            status: "ready",
          },
        ],
      },
      {
        id: "stats",
        name: "Stats",
        href: "/social-media?tab=stats",
        features: [
          {
            id: "account-stats",
            name: "Account stats overview",
            description: "Follower and engagement snapshots for connected social accounts.",
            status: "ready",
          },
          {
            id: "ai-profile",
            name: "AI profile analysis",
            description: "Optional AI read of the social profile to suggest positioning improvements.",
            status: "beta",
          },
          {
            id: "gbp",
            name: "Google Business panel",
            description: "GBP-oriented stats when Google Business Profile is connected.",
            status: "beta",
          },
        ],
      },
      {
        id: "more",
        name: "Schedule & more",
        href: "/social-media?tab=more",
        features: [
          {
            id: "scheduled",
            name: "Scheduled posts",
            description: "List and manage posts already queued for future publish times.",
            status: "ready",
          },
          {
            id: "drive-queue",
            name: "Instagram from Drive folder",
            description:
              "Daily queue: images from a Drive to-post folder → brand/AI/vision captions (optional A/B + Shopify product match) → schedule to Instagram → move file to posted after publish. Needs Drive reconnect (full drive scope) + Instagram via Zernio. Cron also appears under Automations → Content.",
            status: "beta",
          },
          {
            id: "social-workflows",
            name: "Social automation workflows",
            description:
              "Toggles/hints for social-related automation jobs so posting stays scheduled without babysitting every cron.",
            status: "ready",
          },
          {
            id: "social-ideas",
            name: "Content ideas",
            description: "Idea prompts tailored for social channels.",
            status: "ready",
          },
          {
            id: "ai-image",
            name: "AI image helper",
            description: "Generate or transform images when API.AI/Canva prerequisites are met.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    path: "/ecommerce",
    group: "work",
    summary:
      "Shopify store cockpit (Notion optional under Tools). Default tab: Overview. Other tabs: Orders, Products, Insights, Tools.",
    tabs: [
      {
        id: "overview",
        name: "Overview",
        href: "/ecommerce",
        summary: "Default ecommerce tab (`?tab=` omitted).",
        features: [
          {
            id: "ecom-overview-kpis",
            name: "KPI cards & smart signals",
            description:
              "Revenue, sales, customers, products, ad spend/ROAS and purchases/costs. Clickable cards open detail sheets. Smart signals flag stale unfulfilled orders, pending payments, low stock, abandoned carts, low ROAS, wasteful ads, overdue supplier invoices and thin margins.",
            status: "ready",
          },
          {
            id: "ecom-overview-sections",
            name: "Products · Customers · Ads · Sales · Purchases",
            description:
              "Five sections with counts/sums and drill-down sheets. Blends Shopify catalog/orders/customers, Meta/Google campaigns (ROAS), and Fortnox financial snapshot + supplier invoices when connected. Quick actions: export CSV, add lead, filter unfulfilled/pending, cart recovery drafts, open Marketing/Economy.",
            status: "ready",
          },
        ],
      },
      {
        id: "orders",
        name: "Orders",
        href: "/ecommerce?tab=orders",
        features: [
          {
            id: "orders-list",
            name: "Orders list & filters",
            description:
              "Browse recent Shopify orders, filter by payment/fulfillment (persisted per profile), expand line items and export CSV.",
            status: "ready",
          },
          {
            id: "action-needed",
            name: "Action needed strip",
            description:
              "Highlights stale unfulfilled orders, pending payments and low stock so operations do not stall.",
            status: "ready",
          },
          {
            id: "cart-recovery",
            name: "Abandoned cart recovery draft",
            description:
              "Draft a recovery email for abandoned checkouts — you approve before anything sends.",
            status: "ready",
          },
        ],
      },
      {
        id: "products",
        name: "Products",
        href: "/ecommerce?tab=products",
        features: [
          {
            id: "product-catalog",
            name: "Product catalog",
            description:
              "Create/edit products and versions in-app, or import from Shopify into the profile catalog.",
            status: "ready",
          },
        ],
      },
      {
        id: "insights",
        name: "Insights",
        href: "/ecommerce?tab=insights",
        features: [
          {
            id: "store-insights",
            name: "Store insights",
            description:
              "30-day revenue trend, AOV, fulfillment, top products/customers and promotions — plus add top buyers as sales leads.",
            status: "ready",
          },
        ],
      },
      {
        id: "tools",
        name: "Tools",
        href: "/ecommerce?tab=tools",
        features: [
          {
            id: "alibaba",
            name: "Alibaba / 1688 import",
            description:
              "Paste a supplier URL to pull title, specs and images into a draft product (optional Shopify draft).",
            status: "beta",
          },
          {
            id: "notion",
            name: "Notion workspace",
            description:
              "Browse Notion pages/databases when Notion is connected for ops notes next to commerce.",
            status: "beta",
          },
          {
            id: "shop-info",
            name: "Shop plan info",
            description: "Store name, domain, plan, currency and timezone from Shopify.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "sales",
    name: "Sales",
    path: "/sales",
    group: "work",
    summary:
      "Lead pipeline and outreach. Tabs: Leads (default), Outreach, Pipeline, Overview, Discover, Goals.",
    tabs: [
      {
        id: "leads",
        name: "Leads",
        href: "/sales",
        features: [
          {
            id: "leads-crm",
            name: "Leads list",
            description:
              "Capture and update leads, follow-ups and statuses so outreach has a durable queue scoped to the profile.",
            status: "ready",
          },
        ],
      },
      {
        id: "outreach",
        name: "Outreach",
        href: "/sales?tab=outreach",
        features: [
          {
            id: "outreach-queue",
            name: "Outreach queue & AI drafts",
            description:
              "Generate and review outreach drafts before send — keeps sales messages consistent with brand context.",
            status: "ready",
          },
        ],
      },
      {
        id: "pipeline",
        name: "Pipeline",
        href: "/sales?tab=pipeline",
        features: [
          {
            id: "pipeline-board",
            name: "Pipeline board",
            description:
              "Kanban-style stages for sales work so deals do not get lost between tasks and leads.",
            status: "ready",
          },
        ],
      },
      {
        id: "overview",
        name: "Overview",
        href: "/sales?tab=overview",
        features: [
          {
            id: "sales-overview",
            name: "Sales action hub",
            description:
              "Aggregates next actions and optional Shopify metrics for a sales-focused day start.",
            status: "ready",
          },
        ],
      },
      {
        id: "discover",
        name: "Discover",
        href: "/sales?tab=discover",
        features: [
          {
            id: "discover",
            name: "Brand discovery & playbook",
            description:
              "AI/MCP-assisted discovery of angles, channels and sales plays for the brand.",
            status: "beta",
          },
        ],
      },
      {
        id: "goals",
        name: "Goals",
        href: "/sales?tab=goals",
        features: [
          {
            id: "goals",
            name: "Sales goals",
            description: "Track targets with optional Shopify sync for revenue progress.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    path: "/marketing",
    group: "work",
    summary:
      "Paid campaigns and ideas. Tabs: Campaigns (default), Ads, Ideas, Paths. Needs Meta Business and/or Google Ads for live metrics.",
    tabs: [
      {
        id: "campaigns",
        name: "Campaigns",
        href: "/marketing",
        features: [
          {
            id: "campaign-tasks",
            name: "Campaign tasks",
            description: "Operational checklist and follow-ups for marketing campaigns.",
            status: "ready",
          },
        ],
      },
      {
        id: "ads",
        name: "Ads",
        href: "/marketing?tab=ads",
        features: [
          {
            id: "ad-performance",
            name: "Ad performance & ROAS",
            description:
              "Live Meta/Google campaign metrics blended with Shopify revenue for ROAS, cost-per-order signals and inventory-vs-ads alerts.",
            status: "beta",
          },
        ],
      },
      {
        id: "ideas",
        name: "Ideas",
        href: "/marketing?tab=ideas",
        features: [
          {
            id: "marketing-ideas",
            name: "Marketing ideas / playbook",
            description: "AI suggestions for channels, promos and campaign angles.",
            status: "beta",
          },
        ],
      },
      {
        id: "paths",
        name: "Paths",
        href: "/marketing?tab=paths",
        features: [
          {
            id: "marketing-paths",
            name: "Growth paths & setup",
            description: "Guided marketing paths plus MCP research helpers when connected.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "digital-brand",
    name: "Digital brand",
    path: "/digital-brand",
    group: "work",
    summary:
      "Website and brand presence audit. Tabs: Overview (default), Recommendations, Research.",
    tabs: [
      {
        id: "overview",
        name: "Overview",
        href: "/digital-brand",
        features: [
          {
            id: "site-audit",
            name: "Site audit",
            description:
              "Scores site readiness using PageSpeed/HTML signals so you see technical brand gaps quickly.",
            status: "beta",
          },
        ],
      },
      {
        id: "recs",
        name: "Recommendations",
        href: "/digital-brand?tab=recs",
        features: [
          {
            id: "brand-recs",
            name: "SEO / performance / trust recs",
            description:
              "Prioritized recommendations across SEO, speed, trust and channels.",
            status: "beta",
          },
        ],
      },
      {
        id: "research",
        name: "Research",
        href: "/digital-brand?tab=research",
        features: [
          {
            id: "brand-research",
            name: "Multi-source research",
            description:
              "MCP-backed compare/research across sources for brand and competitor context.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "customers",
    name: "Customers",
    path: "/customers",
    group: "work",
    summary:
      "Lightweight customer workspace from CSV (profile documents) — not a live Shopify CRM sync. Tabs: List (default), Assistant.",
    tabs: [
      {
        id: "list",
        name: "List",
        href: "/customers",
        features: [
          {
            id: "csv-customers",
            name: "CSV customer list",
            description:
              "Upload, search and export customers stored on the profile document — useful for offline lists and campaigns. Shopify top customers live under E-commerce → Overview/Insights.",
            status: "beta",
          },
        ],
      },
      {
        id: "assistant",
        name: "Assistant",
        href: "/customers?tab=assistant",
        features: [
          {
            id: "customer-mcp",
            name: "Customer assistant (MCP)",
            description: "Query customer-oriented MCP tools when providers are connected.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "calendar",
    name: "Calendar",
    path: "/calendar",
    group: "work",
    summary:
      "Unified calendar for meetings, tasks and scheduled social posts. Views via `?view=day|week|month` — default Week on desktop, Day on mobile.",
    tabs: [
      {
        id: "views",
        name: "Day / Week / Month",
        href: "/calendar",
        features: [
          {
            id: "local-events",
            name: "Local events",
            description: "Create and edit calendar events stored for the profile.",
            status: "ready",
          },
          {
            id: "provider-sync",
            name: "Google / Outlook sync",
            description:
              "Pull connected calendar events so planning happens in one place when Google Calendar or Outlook Calendar is connected.",
            status: "ready",
          },
          {
            id: "overlays",
            name: "Tasks, leads & scheduled posts",
            description:
              "Overlay work items and social schedules on the same calendar grid.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "messages",
    name: "Messages",
    path: "/messages",
    group: "work",
    summary:
      "Unified inbox. Channel tabs: Mail (default) | Instagram | Messenger | WhatsApp (`?tab=mail|instagram|messenger|whatsapp`). Legacy `/mail` redirects here.",
    tabs: [
      {
        id: "mail",
        name: "Mail",
        href: "/messages",
        features: [
          {
            id: "mail-inbox",
            name: "Gmail / Outlook inbox",
            description:
              "Load threads from connected mail accounts with sort options and unread counts.",
            status: "ready",
          },
          {
            id: "mail-folders",
            name: "Mail folders",
            description:
              "Browse provider folders, create folders and move messages (Gmail/Outlook) so triage can stay folder-based.",
            status: "ready",
          },
          {
            id: "triage-buckets",
            name: "Triage buckets",
            description:
              "Client-side buckets Today / This week / FYI / Noise (`?bucket=`) so the inbox is action-oriented, not chronological-only.",
            status: "ready",
          },
        ],
      },
      {
        id: "social-channels",
        name: "Instagram / Messenger / WhatsApp",
        href: "/messages?tab=instagram",
        features: [
          {
            id: "social-inbox",
            name: "Social messaging inbox",
            description:
              "DM-style threads from connected Instagram, Facebook Messenger and WhatsApp accounts (typically via Zernio).",
            status: "ready",
          },
        ],
      },
      {
        id: "shared",
        name: "Shared inbox tools",
        features: [
          {
            id: "reply",
            name: "Reply & send",
            description: "Reply from the app through the connected provider.",
            status: "ready",
          },
          {
            id: "ai-draft",
            name: "AI drafts & summaries",
            description:
              "Optional AI help to draft replies and summarize threads — review before send.",
            status: "beta",
          },
          {
            id: "auto-reply",
            name: "Auto-reply handoff",
            description:
              "Deep-links into Automations → Messages for scheduled auto-reply flows with human-in-the-loop where configured.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "reviews",
    name: "Reviews",
    path: "/reviews",
    group: "work",
    summary:
      "Monitor and answer reviews (Google, Tripadvisor, Judge.me, …). Tabs: Inbox (default), Drafts, Place. UI labels may be Swedish (Inkorg / Utkast / Verksamhet).",
    tabs: [
      {
        id: "inbox",
        name: "Inbox",
        href: "/reviews",
        features: [
          {
            id: "reviews-inbox",
            name: "Reviews inbox",
            description:
              "Aggregate reviews, filter them, draft AI replies and send when the provider allows.",
            status: "ready",
          },
        ],
      },
      {
        id: "drafts",
        name: "Drafts",
        href: "/reviews?tab=drafts",
        features: [
          {
            id: "review-drafts",
            name: "Reply drafts queue",
            description: "Hold AI or manual reply drafts until you approve publish.",
            status: "ready",
          },
        ],
      },
      {
        id: "place",
        name: "Place",
        href: "/reviews?tab=place",
        features: [
          {
            id: "place-info",
            name: "Place profile & ratings",
            description:
              "Place-level rating breakdown and photos — coverage depends on the connected review provider.",
            status: "beta",
          },
          {
            id: "judgeme-request",
            name: "Judge.me review request",
            description: "Trigger review-request flows when Judge.me is connected.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "tasks",
    name: "Tasks",
    path: "/tasks",
    group: "productivity",
    summary:
      "To-dos scoped to the active profile. Quick filters via `?view=today|overdue|all` (default All). Module filter: general / pipeline / campaign.",
    tabs: [
      {
        id: "filters",
        name: "Today / Overdue / All",
        href: "/tasks",
        features: [
          {
            id: "task-board",
            name: "Task board",
            description:
              "Create tasks with checklists, due dates, search and status so operational work stays explicit.",
            status: "ready",
          },
          {
            id: "module-filter",
            name: "Module filter",
            description:
              "Scope the board to general tasks, sales pipeline tasks or marketing campaign tasks.",
            status: "ready",
          },
          {
            id: "ai-task-assist",
            name: "AI task assist",
            description:
              "Optional AI help for task wording/breakdown when AI preferences/keys are set.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "insights",
    name: "Insights",
    path: "/insights",
    group: "productivity",
    summary:
      "Cross-channel analytics. Tabs: Overview (default), Social, Marketing, Reviews, Website.",
    tabs: [
      {
        id: "overview",
        name: "Overview",
        href: "/insights",
        features: [
          {
            id: "insights-overview",
            name: "Cross-channel overview",
            description:
              "High-level strip of company signals across connected analytics sources (empty until data exists).",
            status: "ready",
          },
        ],
      },
      {
        id: "social",
        name: "Social",
        href: "/insights?tab=social",
        features: [
          {
            id: "social-trends",
            name: "Social follower trends",
            description: "Trend charts from stored social snapshots.",
            status: "ready",
          },
        ],
      },
      {
        id: "marketing",
        name: "Marketing",
        href: "/insights?tab=marketing",
        features: [
          {
            id: "marketing-trends",
            name: "Marketing trends",
            description: "Ad performance trends when marketing/ad accounts have data.",
            status: "beta",
          },
        ],
      },
      {
        id: "reviews",
        name: "Reviews",
        href: "/insights?tab=reviews",
        features: [
          {
            id: "review-summaries",
            name: "Review summaries",
            description: "Account-level review summaries for connected review platforms.",
            status: "ready",
          },
        ],
      },
      {
        id: "website",
        name: "Website",
        href: "/insights?tab=website",
        features: [
          {
            id: "site-analytics",
            name: "Website analytics",
            description:
              "Site tracking summary and setup helpers when tracking is configured.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "activity",
    name: "Activity",
    path: "/activity",
    group: "productivity",
    summary:
      "Audit trail of automations, publishes and failures. Severity filters via `?severity=error|warning|all|success|info` — default All. Live hint prioritizes errors when present.",
    tabs: [
      {
        id: "feed",
        name: "Error / Warning / All / Success / Info",
        href: "/activity",
        features: [
          {
            id: "activity-feed",
            name: "Activity feed",
            description:
              "Filterable, searchable log for traceability across modules (content, messages, ecommerce, agents, …).",
            status: "ready",
          },
          {
            id: "agent-activity",
            name: "Agent activity",
            description:
              "Shows external agent runs when they POST into `/api/agent-activity` (empty until agents post).",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "automations",
    name: "Automations",
    path: "/automations",
    group: "productivity",
    summary:
      "Enable and schedule cron-backed jobs with run status. Topic tabs: Messages (default) | Content | Reports | Insights (`?tab=`).",
    tabs: [
      {
        id: "messages",
        name: "Messages",
        href: "/automations",
        features: [
          {
            id: "auto-messages",
            name: "Message automations",
            description:
              "Catalog jobs for mail/social auto-reply and related message workflows — enable schedule, see last run / failures / retry.",
            status: "ready",
          },
        ],
      },
      {
        id: "content",
        name: "Content",
        href: "/automations?tab=content",
        features: [
          {
            id: "auto-content",
            name: "Content automations",
            description:
              "Jobs for publishing sweeps, Instagram Drive queue enqueue, and other content crons. Configure Drive folders on Social → Schedule & more.",
            status: "ready",
          },
        ],
      },
      {
        id: "reports",
        name: "Reports",
        href: "/automations?tab=reports",
        features: [
          {
            id: "auto-reports",
            name: "Report automations",
            description: "Scheduled report/digest jobs from the automation catalog.",
            status: "ready",
          },
        ],
      },
      {
        id: "insights",
        name: "Insights",
        href: "/automations?tab=insights",
        features: [
          {
            id: "flow-status-auto",
            name: "Flow status & developer tools",
            description:
              "Health of multi-step automation flows plus optional MCP developer widgets.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "ai-recommendations",
    name: "AI suggestions",
    path: "/ai-recommendations",
    group: "productivity",
    summary:
      "Generated recommendations you can accept or dismiss. Tabs: Active (default), Accepted, Dismissed. Supports kind filter and Generate/refresh.",
    tabs: [
      {
        id: "active",
        name: "Active",
        href: "/ai-recommendations",
        features: [
          {
            id: "recs-list",
            name: "Recommendations inbox",
            description:
              "Generate, filter by kind, and accept/dismiss AI suggestions so ideas become tracked decisions.",
            status: "ready",
          },
        ],
      },
      {
        id: "accepted",
        name: "Accepted",
        href: "/ai-recommendations?tab=accepted",
        features: [
          {
            id: "recs-accepted",
            name: "Accepted suggestions",
            description: "History of suggestions you chose to keep/act on.",
            status: "ready",
          },
        ],
      },
      {
        id: "dismissed",
        name: "Dismissed",
        href: "/ai-recommendations?tab=dismissed",
        features: [
          {
            id: "recs-dismissed",
            name: "Dismissed suggestions",
            description: "Suggestions you rejected so they do not clutter Active.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "intelligence",
    name: "MCP Intelligence",
    path: "/intelligence",
    group: "system",
    summary:
      "Hub for Model Context Protocol tools. Default tab: Status (`overview`). All tabs are provider-gated (beta until MCP servers/keys are connected).",
    tabs: [
      {
        id: "overview",
        name: "Status",
        href: "/intelligence",
        features: [
          {
            id: "mcp-status",
            name: "Provider & key status",
            description:
              "Connection and key status for MCP providers so you see what is available before running queries.",
            status: "beta",
          },
        ],
      },
      {
        id: "compare",
        name: "Compare",
        href: "/intelligence?tab=compare",
        features: [
          {
            id: "mcp-compare",
            name: "Compare sources",
            description: "Side-by-side compare across connected research/MCP sources.",
            status: "beta",
          },
        ],
      },
      {
        id: "research",
        name: "Research",
        href: "/intelligence?tab=research",
        features: [
          {
            id: "mcp-research",
            name: "Market / lead / competitor research",
            description: "Market pulse, lead research and competitor analysis via MCP.",
            status: "beta",
          },
        ],
      },
      {
        id: "marketing",
        name: "Marketing",
        href: "/intelligence?tab=marketing",
        features: [
          {
            id: "mcp-marketing",
            name: "SEO & marketing queries",
            description: "SEO and marketing data queries through connected MCP providers.",
            status: "beta",
          },
        ],
      },
      {
        id: "content",
        name: "Content",
        href: "/intelligence?tab=content",
        features: [
          {
            id: "mcp-content",
            name: "Decks & design assist",
            description: "Presentation/deck generation and design assistance tools.",
            status: "beta",
          },
        ],
      },
      {
        id: "commerce",
        name: "Commerce",
        href: "/intelligence?tab=commerce",
        features: [
          {
            id: "mcp-commerce",
            name: "Shopify catalog queries",
            description: "Ask questions against the connected Shopify store catalog.",
            status: "beta",
          },
        ],
      },
      {
        id: "crm-mail",
        name: "CRM & mail",
        href: "/intelligence?tab=crm-mail",
        features: [
          {
            id: "mcp-crm-mail",
            name: "CRM assistant & mail search",
            description: "CRM-oriented queries and mail search via MCP.",
            status: "beta",
          },
        ],
      },
      {
        id: "catalog",
        name: "Catalog",
        href: "/intelligence?tab=catalog",
        features: [
          {
            id: "mcp-catalog",
            name: "Feature catalog",
            description: "Browse which MCP-backed features exist and what they need.",
            status: "beta",
          },
        ],
      },
      {
        id: "tools",
        name: "Tools",
        href: "/intelligence?tab=tools",
        features: [
          {
            id: "raw-tools",
            name: "Raw tools explorer",
            description: "Inspect available MCP tools for debugging and power users.",
            status: "beta",
          },
        ],
      },
      {
        id: "developer",
        name: "Developer",
        href: "/intelligence?tab=developer",
        features: [
          {
            id: "mcp-developer",
            name: "Docs, domain & architecture tools",
            description:
              "Documentation search, domain lookup, architecture/context queries for builders.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "company",
    name: "Company",
    path: "/company",
    group: "system",
    summary:
      "Company profile, Fortnox economy and research. Tabs: Profile (default), Economy, Research, System. Business workspace only.",
    tabs: [
      {
        id: "profile",
        name: "Profile",
        href: "/company",
        features: [
          {
            id: "company-profile",
            name: "Company profile",
            description:
              "Name, website, notes and other brand fields — used across captions, outreach and AI context.",
            status: "ready",
          },
          {
            id: "completeness-autofill",
            name: "Completeness & auto-fill",
            description:
              "Completeness score plus optional auto-fill/enrichment from the website when available.",
            status: "ready",
          },
        ],
      },
      {
        id: "economy",
        name: "Economy",
        href: "/company?tab=economy",
        features: [
          {
            id: "fortnox",
            name: "Fortnox economy",
            description:
              "Invoices, supplier invoices, financial snapshot, articles and related bookkeeping cards when Fortnox is connected. Also powers E-commerce → Overview → Purchases.",
            status: "beta",
          },
        ],
      },
      {
        id: "research",
        name: "Research",
        href: "/company?tab=research",
        features: [
          {
            id: "company-research",
            name: "Company research",
            description: "MCP/SEO research helpers for the company domain.",
            status: "beta",
          },
        ],
      },
      {
        id: "system",
        name: "System",
        href: "/company?tab=system",
        features: [
          {
            id: "connected-sources",
            name: "Connected sources summary",
            description: "Read-only overview of what feeds this company profile.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "connections",
    name: "Connections",
    path: "/connections",
    group: "system",
    summary:
      "Connect and health-check integrations. Tabs: Integrations (default), Health, MCP. Deep links: `?session=<platform>`, `?wizard=1`.",
    tabs: [
      {
        id: "integrations",
        name: "Integrations",
        href: "/connections",
        features: [
          {
            id: "oauth-grid",
            name: "Integration grid & connect sessions",
            description:
              "Guided OAuth/connect flows (why → connect → auto-probe → done) for Shopify, Google, Meta, mail, Drive, Fortnox and more. Prefer this over pasting tokens.",
            status: "ready",
          },
        ],
      },
      {
        id: "health",
        name: "Health",
        href: "/connections?tab=health",
        features: [
          {
            id: "health-panel",
            name: "Connection health",
            description:
              "Surfaces expired tokens and failing probes so broken links are fixed before automations run.",
            status: "ready",
          },
        ],
      },
      {
        id: "mcp",
        name: "MCP",
        href: "/connections?tab=mcp",
        features: [
          {
            id: "mcp-providers",
            name: "MCP providers",
            description:
              "Status and catalog for MCP servers used by Intelligence and page widgets.",
            status: "beta",
          },
        ],
      },
    ],
  },
  {
    id: "preferences",
    name: "Preferences",
    path: "/preferences",
    group: "system",
    summary:
      "Account preferences. Tabs: Overview (default), AI, API keys, Team, Navigation, Data, Help.",
    tabs: [
      {
        id: "overview",
        name: "Overview",
        href: "/preferences",
        features: [
          {
            id: "language",
            name: "Language",
            description:
              "UI language override. Without override: Sweden → Swedish, otherwise English (geo), cached to avoid flash.",
            status: "ready",
          },
          {
            id: "notif-appearance",
            name: "Notifications / appearance / security cards",
            description:
              "Placeholder preference cards — display-only copy today; no wired controls yet.",
            status: "wip",
          },
        ],
      },
      {
        id: "ai",
        name: "AI",
        href: "/preferences?tab=ai",
        features: [
          {
            id: "ai-settings",
            name: "AI settings",
            description: "Configure how AI features behave for this tenant.",
            status: "ready",
          },
        ],
      },
      {
        id: "api-keys",
        name: "API keys",
        href: "/preferences?tab=api-keys",
        features: [
          {
            id: "secrets",
            name: "Tenant API keys",
            description:
              "Store operator secrets (OpenAI, API.AI, etc.) encrypted per profile — advanced path, not the user-facing OAuth Connect flow.",
            status: "ready",
          },
        ],
      },
      {
        id: "team",
        name: "Team",
        href: "/preferences?tab=team",
        features: [
          {
            id: "team",
            name: "Team invites",
            description: "Invite collaborators to the business profile with pending-invite tracking.",
            status: "ready",
          },
        ],
      },
      {
        id: "navigation",
        name: "Navigation",
        href: "/preferences?tab=navigation",
        features: [
          {
            id: "quick-nav-prefs",
            name: "Quick navigation prefs",
            description: "Customize quick-nav destinations used around the app.",
            status: "ready",
          },
        ],
      },
      {
        id: "data",
        name: "Data",
        href: "/preferences?tab=data",
        features: [
          {
            id: "data-privacy",
            name: "Data & privacy / delete profile",
            description:
              "Explains that data is profile-scoped. Permanently delete the active profile and cascaded connections, secrets and profile documents. Not a general export tool.",
            status: "ready",
          },
        ],
      },
      {
        id: "help",
        name: "Help",
        href: "/preferences?tab=help",
        features: [
          {
            id: "handbook-link",
            name: "Link to user handbook",
            description: "Opens `/handbook` — the English feature map with readiness status.",
            status: "ready",
          },
          {
            id: "zernio-help",
            name: "Zernio & integration help",
            description:
              "How Zernio is used as the broker for several social/inbox/review connections, plus provider help links.",
            status: "ready",
          },
        ],
      },
    ],
  },
  {
    id: "handbook",
    name: "User handbook",
    path: "/handbook",
    group: "system",
    summary:
      "This page. App chrome is Swedish/English; feature blurbs stay English for operator consistency. Search + status filters (Ready / Needs setup / Under development).",
    tabs: [
      {
        id: "this",
        name: "Handbook",
        href: "/handbook",
        features: [
          {
            id: "handbook-page",
            name: "Feature catalog",
            description:
              "Searchable accordion of pages → tabs → features with readiness labels. Source: `handbookCatalog.ts` — update that file when shipping new UI.",
            status: "ready",
          },
        ],
      },
    ],
  },
];

export function countHandbookByStatus(status: HandbookStatus): number {
  let n = 0;
  for (const page of handbookPages) {
    for (const tab of page.tabs) {
      for (const f of tab.features) {
        if (f.status === status) n += 1;
      }
    }
  }
  return n;
}
