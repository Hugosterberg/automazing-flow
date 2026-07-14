import { Bot, Users, Zap, MoreHorizontal, Trash2 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useRoutePrefetch } from "@/hooks/useRoutePrefetch";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { formatConnectFetchError } from "@/lib/oauthErrors";
import { appendOAuthProfileParams } from "@/lib/oauthProfile";
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
  CanvaIcon,
} from "@/components/platform-icons";
import type { AccountPlatform, ConnectedAccount, SocialPlatform } from "@/types/accounts";
import { apiUrl } from "@/lib/apiBase";

// Nav structure lives in navConfig.ts, shared with the command palette.
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  navItemsForMode,
  topNavItemsForMode,
} from "@/components/navConfig";
import { profilesLabelForMode, useWorkspaceMode } from "@/features/workspace-mode";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { formatNumber } from "@/lib/format";

function GenericMcpIcon(props: { className?: string }) {
  return <Bot className={props.className} aria-hidden />;
}

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
  canva: CanvaIcon,
  google_reviews: GoogleReviewsIcon,
  tripadvisor: TripadvisorIcon,
  google_ads: GoogleBusinessIcon,
  meta_business: FacebookIcon,
  dayai: GenericMcpIcon,
  windsor: GenericMcpIcon,
  era: GenericMcpIcon,
  ahrefs: GenericMcpIcon,
  canva_mcp: CanvaIcon,
  superhuman_mcp: GmailIcon,
  supermetrics_mcp: GenericMcpIcon,
  exa: GenericMcpIcon,
  klarity: GenericMcpIcon,
  lunarcrush: GenericMcpIcon,
  peec: GenericMcpIcon,
  sprouts: GenericMcpIcon,
  gamma: GenericMcpIcon,
  godaddy: GenericMcpIcon,
  shopify_mcp: ShopifyIcon,
  twilio_mcp: GenericMcpIcon,
};

function getAccountsForCategory(accounts: ConnectedAccount[], platforms: AccountPlatform[]) {
  if (platforms.length === 0) return [];
  return accounts.filter((a) => platforms.includes(a.platform));
}

function sectionForNavItemKey(key: string): AccountSection | null {
  if (key === "social-media") return "social-media";
  if (key === "ecommerce") return "ecommerce";
  if (key === "messages") return "messages";
  if (key === "calendar") return "calendar";
  if (key === "marketing") return "marketing";
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
  tasksOverdueCount: number,
  messagesUnreadCount: number,
  connectedAccountsCount: number
): NavBadgeInfo | null {
  if (key === "connections" && connectedAccountsCount > 0) {
    return {
      count: connectedAccountsCount,
      ariaLabel: `${connectedAccountsCount} connected accounts`,
      tone: "primary",
    };
  }
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
  if (key === "messages" && messagesUnreadCount > 0) {
    return {
      count: messagesUnreadCount,
      ariaLabel: `${messagesUnreadCount} unread messages`,
      tone: "primary",
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
  const { mode } = useWorkspaceMode();
  const visibleTopNavItems = topNavItemsForMode(mode).filter((item) => item.key !== "preferences");
  const visibleNavItems = navItemsForMode(mode);
  const {
    accounts,
    activeProfileId,
    getSelectedAccountId,
    setSelectedAccountId,
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
  // and is shared with the /tasks board and home dashboard.
  const { tasks } = useTasks(aiBusinessProfileId);
  const tasksOverdueCount = useMemo(() => {
    const nowMs = Date.now();
    return tasks.filter((t) => isTaskOverdue(t, nowMs)).length;
  }, [tasks]);
  const [messagesUnreadCount, setMessagesUnreadCount] = useState(0);
  const messagesAccountKey = useMemo(
    () =>
      accounts
        .filter((a) => ["gmail", "outlook", "instagram", "facebook", "whatsapp"].includes(a.platform))
        .map((a) => a.id)
        .sort()
        .join("|"),
    [accounts]
  );

  useEffect(() => {
    let ignore = false;

    async function loadUnreadCount() {
      if (!messagesAccountKey) {
        setMessagesUnreadCount(0);
        return;
      }

      try {
        // Scope to the active profile like the Messages page does — otherwise
        // the badge counts unread across every profile.
        const unifiedUrl = apiUrl(
          `/api/messages/unified${
            aiBusinessProfileId ? `?business_profile_id=${encodeURIComponent(aiBusinessProfileId)}` : ""
          }`
        );
        const res = await fetchWithTimeout(unifiedUrl, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data.messages) ? data.messages : [];
        const unread = rows.filter((m: { isUnread?: unknown }) => Boolean(m.isUnread)).length;
        if (!ignore) setMessagesUnreadCount(unread);
      } catch {
        if (!ignore) setMessagesUnreadCount(0);
      }
    }

    void loadUnreadCount();
    window.addEventListener("automazing:oauth-success", loadUnreadCount);
    return () => {
      ignore = true;
      window.removeEventListener("automazing:oauth-success", loadUnreadCount);
    };
  }, [messagesAccountKey, aiBusinessProfileId]);

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

  function handleConnectNewZernioAccount(platform: SocialPlatform) {
    setZernioOpen(false);
    handleConnectPlatform(platform, { provider: "zernio" });
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
      params.set("app_origin", window.location.origin);
      appendOAuthProfileParams(params, aiBusinessProfileId);
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
    // Return to THIS origin after OAuth, not the server's BASE_URL — otherwise
    // a user on a different origin lands on BASE_URL and appears logged out.
    params.set("app_origin", window.location.origin);
    appendOAuthProfileParams(params, aiBusinessProfileId);
    if (platform === "tiktok" && options?.provider && options.provider !== "auto") {
      params.set("provider", options.provider);
    }
    if ((platform === "google_calendar" || platform === "outlook_calendar") && options?.provider && options.provider !== "auto") {
      params.set("provider", options.provider);
    }
    // google_business is already handled above (lines 319-328). tripadvisor
    // with provider=official also returns early (line 330). Anything reaching
    // this point that still accepts a provider query param is google_reviews,
    // google_ads, or tripadvisor with provider=auto|zernio.
    if (
      (platform === "google_reviews" || platform === "google_ads" || platform === "tripadvisor") &&
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
    params.set("app_origin", window.location.origin);
    appendOAuthProfileParams(params, aiBusinessProfileId);
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
      const res = await fetchWithTimeout(apiUrl("/api/auth/tripadvisor/manual-connect"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          apiKey: apiKey || undefined,
          profileId: activeProfileId || undefined,
          business_profile_id: aiBusinessProfileId || undefined,
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
        <SidebarMenu>
          {visibleTopNavItems.map((item) => {
            const isActive = location.pathname === item.url;
            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
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
                    {item.key === "connections" && accounts.length > 0 ? (
                      <NavCountBadge
                        count={accounts.length}
                        ariaLabel={`${accounts.length} connected accounts`}
                        tone="primary"
                      />
                    ) : null}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
        <SidebarSeparator className="my-2" />
        {NAV_GROUP_ORDER.map((groupKey) => {
          const groupItems = visibleNavItems.filter((i) => i.group === groupKey);
          if (groupItems.length === 0) return null;
          const showLabel = groupKey !== "work";
          return (
        <SidebarGroup key={groupKey}>
          {showLabel && (
            <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-wide text-muted-foreground/70">
              {NAV_GROUP_LABELS[groupKey]}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {groupItems.map((item) => {
                const isActive = location.pathname === item.url;
                const categoryAccounts = getAccountsForCategory(accounts, item.platforms);
                const hasConnect = item.platforms.length > 0;
                // Hide platform-specific routes that have no connected accounts and are not active
                // (show them as dimmed but still present so user knows what's possible)
                const hasAccounts = categoryAccounts.length > 0;
                const isDataRoute = item.platforms.length > 0 && !item.hideAccounts;
                const section = sectionForNavItemKey(item.key);
                const selectedAccountId = section ? getSelectedAccountId(section) : null;

                const navBadge = getNavBadge(
                  item.key,
                  aiActiveCount,
                  tasksOverdueCount,
                  messagesUnreadCount,
                  accounts.length
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
                          } ${isDataRoute && !hasAccounts && !isActive ? "opacity-60" : ""}`}
                        >
                          {item.title}
                        </span>
                        {navBadge ? (
                          <NavCountBadge
                            count={navBadge.count}
                            ariaLabel={navBadge.ariaLabel}
                            tone={navBadge.tone}
                          />
                        ) : isDataRoute && !hasAccounts ? (
                          <span className="text-[10px] text-muted-foreground/70 bg-muted rounded px-1.5 py-0.5 shrink-0">
                            Koppla
                          </span>
                        ) : null}
                      </NavLink>
                    </SidebarMenuButton>
                    {!item.hideAccounts && isActive && categoryAccounts.length > 0 ? (
                    <div className="mx-3.5 mt-1 mb-2 border-l border-sidebar-border pl-3 space-y-0.5">
                      {categoryAccounts.map((account) => {
                        const isSelected = selectedAccountId === account.id;
                        const isClickable = !!section;
                        return (
                          <div
                            key={account.id}
                            className="group/sub flex items-center gap-1 rounded-md pr-1 hover:bg-sidebar-accent/50"
                          >
                            {isClickable ? (
                            <button
                              type="button"
                              onClick={() => section && handleAccountClick(section, account.id, isSelected)}
                              className={`flex flex-1 items-center min-w-0 text-left py-0.5 px-1.5 rounded ${
                                isSelected ? "bg-sidebar-accent font-medium" : ""
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/80 leading-tight">{account.username}</span>
                              {account.stats?.followersCount != null && (
                                <span
                                  className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 shrink-0 tabular-nums"
                                  aria-label={`${formatNumber(account.stats.followersCount)} följare`}
                                >
                                  <Users className="h-2.5 w-2.5" aria-hidden />
                                  {formatNumber(account.stats.followersCount)}
                                </span>
                              )}
                            </button>
                            ) : (
                            <div className="flex flex-1 min-w-0 py-0.5 px-1.5">
                              <span className="text-[10px] text-muted-foreground/70 break-all leading-tight">{account.username}</span>
                            </div>
                            )}
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
                    </div>
                    ) : null}
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
            {profilesLabelForMode(mode)}
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
            onConnectNew={handleConnectNewZernioAccount}
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
              Enter Tripadvisor Location ID and optionally API key (if not set in .env.local).
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
