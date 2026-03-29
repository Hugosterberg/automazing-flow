import {
  Share2,
  ShoppingCart,
  LineChart,
  Users,
  CalendarDays,
  Star,
  Mail,
  Settings,
  Zap,
  Plus,
  MoreHorizontal,
  Trash2,
  Layers,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
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
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { ZernioLinkDialog } from "@/components/ZernioLinkDialog";
import { useZernioAccounts, type ZernioAccountRow } from "@/hooks/useZernioAccounts";
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
  GoogleReviewsIcon,
  TripadvisorIcon,
  LightbulbGlowIcon,
} from "@/components/platform-icons";
import type { AccountPlatform, ConnectedAccount, SocialPlatform } from "@/types/accounts";

const API_BASE = (import.meta.env.VITE_API_URL || "").trim() || "/api";

const navItems = [
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
  },
  {
    key: "ecommerce",
    title: "Organization & Management",
    url: "/ecommerce",
    icon: ShoppingCart,
    platforms: ["shopify", "notion"] as AccountPlatform[],
  },
  {
    key: "sales-marketing",
    title: "Sales & Marketing",
    url: "/sales-marketing",
    icon: LineChart,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
  {
    key: "customers",
    title: "Customers",
    url: "/customers",
    icon: Users,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
  {
    key: "calendar",
    title: "Calendar",
    url: "/calendar",
    icon: CalendarDays,
    platforms: ["google_calendar", "outlook_calendar"] as AccountPlatform[],
  },
  {
    key: "mail",
    title: "Mail",
    url: "/mail",
    icon: Mail,
    platforms: ["gmail", "outlook"] as AccountPlatform[],
  },
  {
    key: "reviews",
    title: "Reviews",
    url: "/reviews",
    icon: Star,
    platforms: ["google_reviews", "tripadvisor"] as AccountPlatform[],
  },
  {
    key: "ai-recommendations",
    title: "AI Recommendations",
    url: "/ai-recommendations",
    icon: LightbulbGlowIcon,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
  {
    key: "preferences",
    title: "Preferences",
    url: "/preferences",
    icon: Settings,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
];

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
  google_reviews: GoogleReviewsIcon,
  tripadvisor: TripadvisorIcon,
};

function getAccountsForCategory(accounts: ConnectedAccount[], platforms: AccountPlatform[]) {
  if (platforms.length === 0) return [];
  return accounts.filter((a) => platforms.includes(a.platform));
}

const numberFormatter = new Intl.NumberFormat("en-US");

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    accounts,
    activeProfileId,
    selectedAccountId,
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
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-fix',hypothesisId:'H1',location:'AppSidebar:handleOpenOverview',message:'Total overview clicked - using showOverview',data:{pathname:location.pathname,showOverview:true},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setShowOverview(true);
    setSelectedAccountId(null);
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
    setSelectedAccountId(linkedAccountId);
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
    if (platform === "google_business") {
      // Current tenant may not support direct Google Business connect via Zernio API.
      // Keep reliable fallback: link from already-connected Zernio accounts.
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
    if (activeProfileId) params.set("profile_id", activeProfileId);
    if (platform === "tiktok" && options?.provider && options.provider !== "auto") {
      params.set("provider", options.provider);
    }
    if ((platform === "google_calendar" || platform === "outlook_calendar") && options?.provider && options.provider !== "auto") {
      params.set("provider", options.provider);
    }
    if ((platform === "google_reviews" || platform === "tripadvisor") && options?.provider && options.provider !== "auto") {
      params.set("provider", options.provider);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `${API_BASE}/auth/${platform}${query}`;
  }

  function handleShopifyConnect() {
    const shop = shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!shop) return;
    const params = new URLSearchParams({ shop });
    if (activeProfileId) params.set("profile_id", activeProfileId);
    setShopifyDialogOpen(false);
    setShopDomain("");
    window.location.href = `${API_BASE}/auth/shopify?${params}`;
  }

  async function handleTripadvisorManualConnect() {
    const locationId = tripadvisorLocationId.trim();
    const apiKey = tripadvisorApiKey.trim();
    if (!locationId) {
      setTripadvisorConnectError("Location ID is required.");
      return;
    }
    setTripadvisorConnecting(true);
    setTripadvisorConnectError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/tripadvisor/manual-connect`, {
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
        throw new Error(payload?.error || "Could not connect Tripadvisor.");
      }
      addAccountFromOAuth(
        String(payload.account_id || ""),
        "tripadvisor",
        String(payload.username || `Tripadvisor ${locationId}`),
        activeProfileId || undefined
      );
      setSelectedAccountId(String(payload.account_id || ""));
      setTripadvisorDialogOpen(false);
      navigate("/reviews");
    } catch (err) {
      setTripadvisorConnectError(err instanceof Error ? err.message : "Could not connect Tripadvisor.");
    } finally {
      setTripadvisorConnecting(false);
    }
  }

  function handleAccountClick(accountId: string, isSelected: boolean) {
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-fix',hypothesisId:'H3',location:'AppSidebar:handleAccountClick',message:'Account clicked - clears showOverview',data:{accountId,wasSelected:isSelected},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    setShowOverview(false);
    setSelectedAccountId(isSelected ? null : accountId);
  }

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3f6df6'},body:JSON.stringify({sessionId:'3f6df6',runId:'post-fix',hypothesisId:'H6',location:'AppSidebar:mount',message:'AppSidebar mounted - logging self test',data:{pathname:location.pathname},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [location.pathname]);

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
        <span className="text-lg font-bold tracking-tight text-foreground">
          automazing
        </span>
      </button>
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.url;
                const categoryAccounts = getAccountsForCategory(accounts, item.platforms);
                const hasConnect = item.platforms.length > 0;

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                          isActive
                            ? "bg-accent text-foreground glow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        }`}
                        activeClassName=""
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{item.title}</span>
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
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Total overview</p>
                          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
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
                              onClick={() => handleAccountClick(account.id, isSelected)}
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
                                <span className="text-[10px] text-muted-foreground pl-7">
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
                                  className="h-5 w-5 shrink-0 opacity-0 group-hover/sub:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-3 w-3" />
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
                                            ? "Google Business (Zernio)"
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
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-xs text-muted-foreground">
            Profile
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ProfileSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>

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
