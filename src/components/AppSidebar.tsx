import {
  Share2,
  ShoppingCart,
  LineChart,
  Users,
  CalendarDays,
  Star,
  MessageSquare,
  Settings,
  Zap,
  Plus,
  MoreHorizontal,
  Trash2,
  Layers,
  FolderOpen,
  PlugZap,
  ListChecks,
  Activity,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { lazy, Suspense, useMemo, useState } from "react";
import { formatConnectFetchError } from "@/lib/oauthErrors";
import { getOAuthProfileId } from "@/lib/oauthProfile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAccounts } from "@/context/AccountsContext";
import type { AccountSection } from "@/context/AccountsContext";
import { useActiveBusinessProfileIdOptional } from "@/features/business-profiles";
import { useAiRecommendations } from "@/features/ai-recommendations";
import { useTasks, isTaskOverdue } from "@/features/tasks";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { useZernioAccounts, type ZernioAccountRow } from "@/hooks/useZernioAccounts";

/**
 * Lazy-loaded Zernio link dialog. The sidebar always renders but the dialog
 * only appears after the user clicks "Connect". Deferring its chunk keeps
 * the dialog body + platform icon tree out of the main bundle; the first
 * open incurs a small chunk fetch that's imperceptible for a click-triggered
 * flow.
 */
const ZernioLinkDialog = lazy(() =>
  import("@/components/ZernioLinkDialog").then((m) => ({ default: m.ZernioLinkDialog }))
);
import {
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
  XIcon,
  FacebookIcon,
  GoogleBusinessIcon,
  WhatsAppIcon,
  ShopifyIcon,
  NotionIcon,
  GmailIcon,
  OutlookIcon,
  GoogleCalendarIcon,
  GoogleDriveIcon,
  GoogleReviewsIcon,
  TripadvisorIcon,
  LightbulbGlowIcon,
} from "@/components/platform-icons";
import type { AccountPlatform, ConnectedAccount, SocialPlatform } from "@/types/accounts";
import { apiUrl } from "@/lib/apiBase";

/**
 * Sidebar groups. Reads top-to-bottom as a user journey:
 *   Work:         day-to-day channels and content
 *   Productivity: cross-cutting assistants (tasks, activity, AI)
 *   System:       config and provider wiring
 * Keep this list short — flat long sidebars are hard to scan.
 */
type NavGroup = "work" | "productivity" | "system";

const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: "Work",
  productivity: "Productivity",
  system: "System",
};

const navItems: Array<{
  key: string;
  title: string;
  url: string;
  icon: (props: { className?: string }) => JSX.Element;
  platforms: AccountPlatform[];
  hideAccounts?: boolean;
  group: NavGroup;
}> = [
  {
    key: "content",
    title: "Content",
    url: "/content",
    icon: FolderOpen,
    platforms: ["google_drive"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "social-media",
    title: "Social Media",
    url: "/social-media",
    icon: Share2,
    platforms: [
      "instagram",
      "tiktok",
      "youtube",
      "x",
      "facebook",
      "google_business",
      "whatsapp",
    ] as AccountPlatform[],
    group: "work",
  },
  {
    key: "ecommerce",
    title: "Organization & Management",
    url: "/ecommerce",
    icon: ShoppingCart,
    platforms: ["shopify", "notion"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "sales-marketing",
    title: "Sales & Marketing",
    url: "/sales-marketing",
    icon: LineChart,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "work",
  },
  {
    key: "customers",
    title: "Customers",
    url: "/customers",
    icon: Users,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "work",
  },
  {
    key: "calendar",
    title: "Calendar",
    url: "/calendar",
    icon: CalendarDays,
    platforms: ["google_calendar", "outlook_calendar"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "messages",
    title: "Messages",
    url: "/messages",
    icon: MessageSquare,
    platforms: ["gmail", "outlook"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "reviews",
    title: "Reviews",
    url: "/reviews",
    icon: Star,
    platforms: ["google_reviews", "tripadvisor"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "tasks",
    title: "Tasks",
    url: "/tasks",
    icon: ListChecks,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "activity",
    title: "Activity",
    url: "/activity",
    icon: Activity,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "ai-recommendations",
    title: "AI Recommendations",
    url: "/ai-recommendations",
    icon: LightbulbGlowIcon,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "connections",
    title: "Connections",
    url: "/connections",
    icon: PlugZap,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "system",
  },
  {
    key: "preferences",
    title: "Preferences",
    url: "/preferences",
    icon: Settings,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "system",
  },
];

const NAV_GROUP_ORDER: NavGroup[] = ["work", "productivity", "system"];

const platformIcons: Record<AccountPlatform, (props: { className?: string }) => JSX.Element> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  x: XIcon,
  facebook: FacebookIcon,
  google_business: GoogleBusinessIcon,
  whatsapp: WhatsAppIcon,
  shopify: ShopifyIcon,
  notion: NotionIcon,
  gmail: GmailIcon,
  outlook: OutlookIcon,
  google_calendar: GoogleCalendarIcon,
  outlook_calendar: OutlookIcon,
  google_drive: GoogleDriveIcon,
  google_reviews: GoogleReviewsIcon,
  tripadvisor: TripadvisorIcon,
};

function getAccountsForCategory(accounts: ConnectedAccount[], platforms: AccountPlatform[]) {
  if (platforms.length === 0) return [];
  return accounts.filter((a) => platforms.includes(a.platform));
}

const numberFormatter = new Intl.NumberFormat("en-US");

function sectionForNavItemKey(key: string): AccountSection | null {
  if (key === "social-media") return "social-media";
  if (key === "ecommerce") return "ecommerce";
  if (key === "messages") return "messages";
  if (key === "calendar") return "calendar";
  if (key === "reviews") return "reviews";
  if (key === "content") return "content";
  return null;
}

type NavBadgeTone = "primary" | "warning";

interface NavBadgeInfo {
  count: number;
  ariaLabel: string;
  tone: NavBadgeTone;
  /**
   * Optional deep-link override. When present, the whole nav row points
   * here instead of `item.url` — letting a badge send the user straight
   * to the filtered view that explains the count (e.g. overdue tasks).
   */
  href?: string;
}

/**
 * Map a nav item key to its badge payload, if any. Keeps the per-item
 * logic declarative and makes it trivial to add further counts later
 * (e.g. unread messages) without touching the render loop.
 */
function getNavBadge(
  key: string,
  aiActiveCount: number,
  tasksOverdueCount: number
): NavBadgeInfo | null {
  if (key === "ai-recommendations" && aiActiveCount > 0) {
    return {
      count: aiActiveCount,
      ariaLabel: `${aiActiveCount} active AI recommendations`,
      tone: "primary",
    };
  }
  if (key === "tasks" && tasksOverdueCount > 0) {
    return {
      count: tasksOverdueCount,
      ariaLabel: `${tasksOverdueCount} overdue tasks`,
      tone: "warning",
      href: "/tasks?view=overdue",
    };
  }
  return null;
}

/**
 * Small pill used in sidebar nav rows to surface attention counts. Caps
 * visually at "9+" so the pill width stays stable regardless of value.
 * `tone` maps to semantic color tokens so variants stay themeable.
 */
function NavCountBadge({
  count,
  ariaLabel,
  tone,
}: {
  count: number;
  ariaLabel: string;
  tone: NavBadgeTone;
}) {
  const toneClass =
    tone === "warning"
      ? "bg-warning text-warning-foreground"
      : "bg-primary text-primary-foreground";
  return (
    <span
      className={`inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${toneClass}`}
      aria-label={ariaLabel}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefetchFor = useRoutePrefetch();
  const {
    accounts,
    activeProfileId,
    getSelectedAccountId,
    setSelectedAccountId,
    showOverview,
    setShowOverview,
    removeAccount,
    addAccountFromOAuth,
  } = useAccounts();
  const [shopifyDialogOpen, setShopifyDialogOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [tripadvisorDialogOpen, setTripadvisorDialogOpen] = useState(false);
  const [tripadvisorLocationId, setTripadvisorLocationId] = useState("");
  const [tripadvisorApiKey, setTripadvisorApiKey] = useState("");
  const [tripadvisorConnecting, setTripadvisorConnecting] = useState(false);
  const [tripadvisorConnectError, setTripadvisorConnectError] = useState<string | null>(null);
  const [zernioOpen, setZernioOpen] = useState(false);
  const [zernioFilter, setZernioFilter] = useState<SocialPlatform | null>(null);
  const {
    zernioAccounts,
    zernioLoading,
    zernioLinking,
    zernioError,
    loadZernioAccounts,
    linkZernioAccount,
  } = useZernioAccounts({
    activeProfileId,
    addAccountFromOAuth,
  });
  // Badge count for the "AI Recommendations" sidebar entry. Reuses the same
  // cached query the page/widget use — no extra network request. We count
  // "active" rows (new + seen) so the badge matches the Active tab on the
  // dedicated page.
  const aiBpId = useActiveBusinessProfileIdOptional();
  const aiBusinessProfileId = aiBpId ?? activeProfileId ?? null;
  const { recommendations: aiRecommendations } = useAiRecommendations(
    aiBusinessProfileId
  );
  const aiActiveCount = useMemo(
    () =>
      aiRecommendations.filter(
        (r) => r.status === "new" || r.status === "seen"
      ).length,
    [aiRecommendations]
  );

  // Tasks nav badge. Counts overdue items only — "overdue" is the signal
  // a user actually needs to act on, so the badge stays sharp rather than
  // inflating with every open task. Uses the same cached query as the
  // Tasks page/widget, no extra fetch. Definition lives in taskFilters.ts
  // and is shared with the /tasks page tabs and home dashboard.
  const { tasks } = useTasks(aiBusinessProfileId);
  const tasksOverdueCount = useMemo(() => {
    const nowMs = Date.now();
    return tasks.filter((t) => isTaskOverdue(t, nowMs)).length;
  }, [tasks]);

  const socialNavItem = navItems.find((item) => item.key === "social-media");
  const socialAccounts = useMemo(
    () => getAccountsForCategory(accounts, socialNavItem?.platforms ?? []),
    [accounts, socialNavItem]
  );
  const socialOverview = useMemo(() => {
    return socialAccounts.reduce(
      (acc, account) => {
        acc.connected += 1;
        if (typeof account.stats?.followersCount === "number") {
          acc.followers += account.stats.followersCount;
          acc.hasFollowers = true;
        }
        if (typeof account.stats?.mediaCount === "number") {
          acc.posts += account.stats.mediaCount;
          acc.hasPosts = true;
        }
        if (typeof account.stats?.engagementRate === "number") {
          acc.engagementSum += account.stats.engagementRate;
          acc.engagementCount += 1;
        }
        return acc;
      },
      {
        connected: 0,
        followers: 0,
        posts: 0,
        engagementSum: 0,
        engagementCount: 0,
        hasFollowers: false,
        hasPosts: false,
      }
    );
  }, [socialAccounts]);
  function handleOpenOverview() {
    setShowOverview(true);
    setSelectedAccountId("social-media", null);
    if (location.pathname !== "/social-media") {
      navigate("/social-media");
    }
  }

  function openZernioPicker(filter: SocialPlatform | null) {
    setZernioFilter(filter);
    setZernioOpen(true);
    void loadZernioAccounts();
  }

  async function handleLinkZernioAccount(row: ZernioAccountRow) {
    const linkedAccountId = await linkZernioAccount(row);
    if (!linkedAccountId) return;
    setZernioOpen(false);
    setSelectedAccountId("social-media", linkedAccountId);
    navigate("/social-media");
  }

  function handleConnectPlatform(
    platform: AccountPlatform,
    options?: { provider?: "auto" | "zernio" | "official" }
  ) {
    if (platform === "shopify") {
      setShopDomain("");
      setShopifyDialogOpen(true);
      return;
    }
    if (platform === "google_business" && options?.provider === "official") {
      const params = new URLSearchParams({ provider: "official" });
      const oauthProfileId = getOAuthProfileId(activeProfileId);
      if (oauthProfileId) params.set("profile_id", oauthProfileId);
      window.location.href = `${apiUrl("/api/auth/google_business")}?${params}`;
      return;
    }
    if (platform === "google_business") {
      openZernioPicker(platform);
      return;
    }
    if (platform === "tripadvisor" && options?.provider === "official") {
      setTripadvisorLocationId("");
      setTripadvisorApiKey("");
      setTripadvisorConnectError(null);
      setTripadvisorDialogOpen(true);
      return;
    }
    const params = new URLSearchParams();
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    if (platform === "tiktok" && options?.provider && options.provider !== "auto") {
      params.set("provider", options.provider);
    }
    if ((platform === "google_calendar" || platform === "outlook_calendar") && options?.provider && options.provider !== "auto") {
      params.set("provider", options.provider);
    }
    // google_business is already handled above (lines 319-328). tripadvisor
    // with provider=official also returns early (line 330). Anything reaching
    // this point that still accepts a provider query param is google_reviews
    // or tripadvisor with provider=auto|zernio.
    if (
      (platform === "google_reviews" || platform === "tripadvisor") &&
      options?.provider &&
      options.provider !== "auto"
    ) {
      params.set("provider", options.provider);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `${apiUrl(`/api/auth/${platform}`)}${query}`;
  }

  function handleShopifyConnect() {
    const shop = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!shop) return;
    const params = new URLSearchParams({ shop });
    const oauthProfileId = getOAuthProfileId(activeProfileId);
    if (oauthProfileId) params.set("profile_id", oauthProfileId);
    setShopifyDialogOpen(false);
    setShopDomain("");
    window.location.href = `${apiUrl("/api/auth/shopify")}?${params}`;
  }

  async function handleTripadvisorManualConnect() {
    const locationId = tripadvisorLocationId.trim();
    const apiKey = tripadvisorApiKey.trim();
    if (!locationId) {
      setTripadvisorConnectError("Error: locationId is required | Status: 400 | Exception: not provided");
      return;
    }
    setTripadvisorConnecting(true);
    setTripadvisorConnectError(null);
    try {
      const res = await fetch(apiUrl("/api/auth/tripadvisor/manual-connect"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          apiKey: apiKey || undefined,
          profileId: activeProfileId || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          formatConnectFetchError({
            status: res.status,
            payload,
            fallbackMessage: "Could not connect Tripadvisor.",
          })
        );
      }
      addAccountFromOAuth(
        String(payload.account_id || ""),
        "tripadvisor",
        String(payload.username || `Tripadvisor ${locationId}`),
        activeProfileId || undefined
      );
      setSelectedAccountId("reviews", String(payload.account_id || ""));
      setTripadvisorDialogOpen(false);
      navigate("/reviews");
    } catch (err) {
      setTripadvisorConnectError(err instanceof Error ? err.message : "Error: Could not connect Tripadvisor. | Status: unknown | Exception: not provided");
    } finally {
      setTripadvisorConnecting(false);
    }
  }

  function handleAccountClick(section: AccountSection, accountId: string, isSelected: boolean) {
    if (section === "social-media") {
      setShowOverview(false);
    }
    setSelectedAccountId(section, isSelected ? null : accountId);
  }

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="w-full flex items-center gap-2 px-4 py-5 border-b border-border hover:bg-accent/40 transition-colors text-left"
      >
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-display text-lg font-bold text-foreground">
          automazing
        </span>
      </button>
      <SidebarContent className="pt-4" role="navigation" aria-label="Main">
        {NAV_GROUP_ORDER.map((groupKey) => {
          const groupItems = navItems.filter((i) => i.group === groupKey);
          if (groupItems.length === 0) return null;
          return (
        <SidebarGroup key={groupKey}>
          <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {NAV_GROUP_LABELS[groupKey]}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {groupItems.map((item) => {
                const isActive = location.pathname === item.url;
                const categoryAccounts = getAccountsForCategory(accounts, item.platforms);
                const hasConnect = item.platforms.length > 0;
                const section = sectionForNavItemKey(item.key);
                const selectedAccountId = section ? getSelectedAccountId(section) : null;

                const navBadge = getNavBadge(
                  item.key,
                  aiActiveCount,
                  tasksOverdueCount
                );

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={navBadge?.href ?? item.url}
                        end
                        onPointerEnter={() => prefetchFor(item.url)}
                        onFocus={() => prefetchFor(item.url)}
                        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                          isActive
                            ? "bg-accent text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                        activeClassName=""
                      >
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                        />
                        <span
                          className={`text-sm flex-1 ${
                            isActive ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {item.title}
                        </span>
                        {navBadge ? (
                          <NavCountBadge
                            count={navBadge.count}
                            ariaLabel={navBadge.ariaLabel}
                            tone={navBadge.tone}
                          />
                        ) : null}
                      </NavLink>
                    </SidebarMenuButton>
                    {!item.hideAccounts && (
                    <div className="mx-3.5 mt-1 mb-2 border-l border-sidebar-border pl-3 space-y-0.5">
                      {item.key === "social-media" && (
                        <button
                          type="button"
                          onClick={handleOpenOverview}
                          className={`w-full text-left rounded-md border px-2 py-1.5 mb-1 transition-colors ${
                            showOverview
                              ? "border-primary/40 bg-sidebar-accent font-medium"
                              : "border-sidebar-border bg-sidebar-accent/30 hover:bg-sidebar-accent/50"
                          }`}
                        >
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Total overview</p>
                          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span>Accounts: {numberFormatter.format(socialOverview.connected)}</span>
                            <span>
                              Followers:{" "}
                              {socialOverview.hasFollowers ? numberFormatter.format(socialOverview.followers) : "–"}
                            </span>
                            <span>Posts: {socialOverview.hasPosts ? numberFormatter.format(socialOverview.posts) : "–"}</span>
                            <span>
                              Avg ER:{" "}
                              {socialOverview.engagementCount > 0
                                ? `${(socialOverview.engagementSum / socialOverview.engagementCount).toFixed(1)}%`
                                : "–"}
                            </span>
                          </div>
                        </button>
                      )}
                        <p className="text-[11px] font-medium text-muted-foreground/80 py-0.5">
                        Connected accounts
                      </p>
                      {categoryAccounts.map((account) => {
                        const Icon = platformIcons[account.platform];
                        const isSelected = selectedAccountId === account.id;
                        return (
                          <div
                            key={account.id}
                            className="group/sub flex items-center gap-1 rounded-md py-0.5 pr-1 hover:bg-sidebar-accent/50"
                          >
                            <button
                              type="button"
                              onClick={() => section && handleAccountClick(section, account.id, isSelected)}
                              className={`flex flex-1 flex-col items-start gap-0 min-w-0 text-left py-1 px-1.5 rounded text-xs ${
                                isSelected ? "bg-sidebar-accent font-medium" : ""
                              }`}
                            >
                              <span className="flex items-center gap-2 w-full min-w-0">
                                <Avatar className="h-5 w-5 shrink-0">
                                  <AvatarFallback className="text-[9px] bg-secondary">
                                    <Icon className="h-2.5 w-2.5" />
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate">{account.username}</span>
                              </span>
                              {account.stats && (account.stats.followersCount != null || account.stats.mediaCount != null) && (
                                <span className="text-[11px] text-muted-foreground pl-7">
                                  {account.stats.followersCount != null && (
                                    <>
                                      {account.stats.followersCount.toLocaleString("en-US")}
                                      {" followers"}
                                    </>
                                  )}
                                  {account.stats.followersCount != null && account.stats.mediaCount != null && " · "}
                                  {account.stats.mediaCount != null && (
                                    <>
                                      {account.platform === "whatsapp"
                                        ? `${account.stats.mediaCount} templates`
                                        : `${account.stats.mediaCount} posts`}
                                    </>
                                  )}
                                </span>
                              )}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 shrink-0 opacity-0 group-hover/sub:opacity-100 focus-visible:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Account actions for ${account.username}`}
                                >
                                  <MoreHorizontal className="h-3 w-3" aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => removeAccount(account.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Disconnect
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })}
                      {hasConnect && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Plus className="h-3 w-3 shrink-0" />
                              Connect more
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {item.platforms.map((platform) => {
                              const Icon = platformIcons[platform];
                              const label =
                                platform === "instagram"
                                  ? "Instagram"
                                  : platform === "tiktok"
                                    ? "TikTok"
                                    : platform === "youtube"
                                      ? "YouTube"
                                      : platform === "x"
                                        ? "X (Twitter)"
                                        : platform === "facebook"
                                          ? "Facebook (Zernio)"
                                          : platform === "google_business"
                                            ? "Google Business"
                                            : platform === "whatsapp"
                                              ? "WhatsApp (Zernio)"
                                              : platform === "shopify"
                                                ? "Shopify"
                                                : platform === "notion"
                                                  ? "Notion"
                                                : platform === "gmail"
                                                  ? "Gmail"
                                                : platform === "outlook"
                                                  ? "Outlook"
                                                : platform === "google_calendar"
                                                  ? "Google Calendar"
                                                : platform === "outlook_calendar"
                                                  ? "Outlook Calendar"
                                                : platform === "google_drive"
                                                  ? "Google Drive"
                                                : platform === "google_reviews"
                                                  ? "Google Reviews"
                                                  : "Tripadvisor";
                              return (
                                platform === "tiktok" ? (
                                  <div key={platform}>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("tiktok", { provider: "auto" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      TikTok (Auto)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("tiktok", { provider: "zernio" })}>
                                      <Layers className="h-4 w-4 mr-2" />
                                      TikTok via Zernio
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("tiktok", { provider: "official" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      TikTok via Official API
                                    </DropdownMenuItem>
                                  </div>
                                ) : platform === "google_calendar" ? (
                                  <div key={platform}>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_calendar", { provider: "auto" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Google Calendar (Auto)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_calendar", { provider: "zernio" })}>
                                      <Layers className="h-4 w-4 mr-2" />
                                      Google Calendar via Zernio
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_calendar", { provider: "official" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Google Calendar via Official API
                                    </DropdownMenuItem>
                                  </div>
                                ) : platform === "outlook_calendar" ? (
                                  <div key={platform}>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("outlook_calendar", { provider: "auto" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Outlook Calendar (Auto)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("outlook_calendar", { provider: "zernio" })}>
                                      <Layers className="h-4 w-4 mr-2" />
                                      Outlook Calendar via Zernio
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("outlook_calendar", { provider: "official" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Outlook Calendar via Official API
                                    </DropdownMenuItem>
                                  </div>
                                ) : platform === "google_business" ? (
                                  <div key={platform}>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_business", { provider: "zernio" })}>
                                      <Layers className="h-4 w-4 mr-2" />
                                      Google Business via Zernio
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_business", { provider: "official" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Google Business via Official API
                                    </DropdownMenuItem>
                                  </div>
                                ) : platform === "google_reviews" ? (
                                  <div key={platform}>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_reviews", { provider: "auto" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Google Reviews (Auto)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_reviews", { provider: "zernio" })}>
                                      <Layers className="h-4 w-4 mr-2" />
                                      Google Reviews via Zernio
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("google_reviews", { provider: "official" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Google Reviews via Official API
                                    </DropdownMenuItem>
                                  </div>
                                ) : platform === "tripadvisor" ? (
                                  <div key={platform}>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("tripadvisor", { provider: "auto" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Tripadvisor (Auto)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("tripadvisor", { provider: "zernio" })}>
                                      <Layers className="h-4 w-4 mr-2" />
                                      Tripadvisor via Zernio
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConnectPlatform("tripadvisor", { provider: "official" })}>
                                      <Icon className="h-4 w-4 mr-2" />
                                      Tripadvisor via Official API (Manual)
                                    </DropdownMenuItem>
                                  </div>
                                ) : (
                                  <DropdownMenuItem
                                    key={platform}
                                    onClick={() => handleConnectPlatform(platform)}
                                  >
                                    <Icon className="h-4 w-4 mr-2" />
                                    {label}
                                  </DropdownMenuItem>
                                )
                              );
                            })}
                            {item.key === "social-media" && (
                              <DropdownMenuItem onClick={() => openZernioPicker(null)}>
                                <Layers className="h-4 w-4 mr-2" />
                                All Zernio channels…
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {!hasConnect && (
                        <p className="text-[11px] text-muted-foreground/70 py-0.5 italic">
                          Coming soon
                        </p>
                      )}
                    </div>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-xs text-muted-foreground">
            Business profiles
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ProfileSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>

      {zernioOpen ? (
        <Suspense fallback={null}>
          <ZernioLinkDialog
            open={zernioOpen}
            onOpenChange={setZernioOpen}
            zernioFilter={zernioFilter}
            zernioAccounts={zernioAccounts}
            zernioLoading={zernioLoading}
            zernioLinking={zernioLinking}
            zernioError={zernioError}
            onRefresh={loadZernioAccounts}
            onLink={handleLinkZernioAccount}
            platformIcons={platformIcons}
          />
        </Suspense>
      ) : null}

      <Dialog open={shopifyDialogOpen} onOpenChange={setShopifyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShopifyIcon className="h-4 w-4" />
              Connect Shopify
            </DialogTitle>
            <DialogDescription>
              Enter your Shopify store domain to get started.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="shop-domain">Store domain</Label>
            <Input
              id="shop-domain"
              placeholder="mystore.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleShopifyConnect()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShopifyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleShopifyConnect} disabled={!shopDomain.trim()}>
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tripadvisorDialogOpen} onOpenChange={setTripadvisorDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TripadvisorIcon className="h-4 w-4" />
              Connect Tripadvisor
            </DialogTitle>
            <DialogDescription>
              Enter Tripadvisor Location ID and optionally API key (if not set in .env).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tripadvisor-location-id">Location ID</Label>
              <Input
                id="tripadvisor-location-id"
                placeholder="e.g. 304554"
                value={tripadvisorLocationId}
                onChange={(e) => setTripadvisorLocationId(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tripadvisor-api-key">API Key (optional)</Label>
              <Input
                id="tripadvisor-api-key"
                type="password"
                placeholder="Leave empty to use .env"
                value={tripadvisorApiKey}
                onChange={(e) => setTripadvisorApiKey(e.target.value)}
              />
            </div>
            {tripadvisorConnectError && (
              <p className="text-xs text-destructive">{tripadvisorConnectError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTripadvisorDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleTripadvisorManualConnect()} disabled={tripadvisorConnecting || !tripadvisorLocationId.trim()}>
              {tripadvisorConnecting ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
