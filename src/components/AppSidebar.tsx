import {
  Share2,
  ShoppingCart,
  CalendarDays,
  Mail,
  Settings,
  Zap,
  Plus,
  MoreHorizontal,
  Trash2,
  Layers,
  Loader2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useCallback } from "react";
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
import {
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
  XIcon,
  FacebookIcon,
  GoogleBusinessIcon,
  WhatsAppIcon,
  ShopifyIcon,
  GmailIcon,
  OutlookIcon,
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
    title: "E-commerce",
    url: "/ecommerce",
    icon: ShoppingCart,
    platforms: ["shopify"] as AccountPlatform[],
  },
  {
    key: "calendar",
    title: "Calendar",
    url: "/calendar",
    icon: CalendarDays,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
  {
    key: "mail",
    title: "Mail",
    url: "/mail",
    icon: Mail,
    platforms: ["gmail", "outlook"] as AccountPlatform[],
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
  gmail: GmailIcon,
  outlook: OutlookIcon,
};

function getAccountsForCategory(accounts: ConnectedAccount[], platforms: AccountPlatform[]) {
  if (platforms.length === 0) return [];
  return accounts.filter((a) => platforms.includes(a.platform));
}

type ZernioAccountRow = {
  id?: string;
  accountId?: string;
  mappedPlatform?: SocialPlatform;
  rawPlatform?: string;
  username?: string;
  name?: string;
  displayName?: string;
};

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    accounts,
    activeProfileId,
    selectedAccountId,
    setSelectedAccountId,
    removeAccount,
    addAccountFromOAuth,
  } = useAccounts();
  const [shopifyDialogOpen, setShopifyDialogOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [zernioOpen, setZernioOpen] = useState(false);
  const [zernioFilter, setZernioFilter] = useState<SocialPlatform | null>(null);
  const [zernioAccounts, setZernioAccounts] = useState<ZernioAccountRow[]>([]);
  const [zernioLoading, setZernioLoading] = useState(false);
  const [zernioLinking, setZernioLinking] = useState<string | null>(null);
  const [zernioError, setZernioError] = useState<string | null>(null);

  const loadZernioAccounts = useCallback(async () => {
    setZernioLoading(true);
    setZernioError(null);
    try {
      const r = await fetch(`${API_BASE}/zernio/accounts`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof j.error === "string" ? j.error : "Could not load Zernio accounts");
      }
      setZernioAccounts(Array.isArray(j.accounts) ? j.accounts : []);
    } catch (e) {
      setZernioAccounts([]);
      setZernioError(e instanceof Error ? e.message : "Zernio request failed");
    } finally {
      setZernioLoading(false);
    }
  }, []);

  function openZernioPicker(filter: SocialPlatform | null) {
    setZernioFilter(filter);
    setZernioOpen(true);
    void loadZernioAccounts();
  }

  async function linkZernioAccount(row: ZernioAccountRow) {
    const zid = String(row.id || row.accountId || "").trim();
    if (!zid) return;
    setZernioLinking(zid);
    setZernioError(null);
    try {
      const r = await fetch(`${API_BASE}/zernio/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zernioAccountId: zid,
          profile_id: activeProfileId ?? undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof j.error === "string" ? j.error : "Link failed");
      }
      addAccountFromOAuth(
        j.account_id,
        j.platform as AccountPlatform,
        j.username,
        activeProfileId ?? undefined,
        {
          isZernio: true,
          zernioAccountId: j.zernioAccountId || zid,
          profileUrl: j.profileUrl,
          displayName: j.displayName,
        }
      );
      setZernioOpen(false);
      setSelectedAccountId(j.account_id);
      navigate("/social-media");
    } catch (e) {
      setZernioError(e instanceof Error ? e.message : "Link failed");
    } finally {
      setZernioLinking(null);
    }
  }

  function handleConnectPlatform(platform: AccountPlatform) {
    if (platform === "shopify") {
      setShopDomain("");
      setShopifyDialogOpen(true);
      return;
    }
    if (platform === "facebook" || platform === "google_business" || platform === "whatsapp") {
      openZernioPicker(platform);
      return;
    }
    const params = new URLSearchParams();
    if (activeProfileId) params.set("profile_id", activeProfileId);
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

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight text-foreground">
          automazing
        </span>
      </div>
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
                              onClick={() => setSelectedAccountId(isSelected ? null : account.id)}
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
                                                : platform === "gmail"
                                                  ? "Gmail"
                                                  : "Outlook";
                              return (
                                <DropdownMenuItem
                                  key={platform}
                                  onClick={() => handleConnectPlatform(platform)}
                                >
                                  <Icon className="h-4 w-4 mr-2" />
                                  {label}
                                </DropdownMenuItem>
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

      <Dialog open={zernioOpen} onOpenChange={setZernioOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Link Zernio account
            </DialogTitle>
            <DialogDescription>
              {zernioFilter
                ? `Showing only ${zernioFilter.replace(/_/g, " ")}. Connect the channel in the Zernio dashboard first.`
                : "Choose a channel already connected in Zernio (Facebook, TikTok, Google Business, WhatsApp, etc.)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {zernioLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Loading accounts…
              </div>
            )}
            {zernioError && (
              <p className="text-sm text-destructive border border-destructive/30 rounded-md px-3 py-2">
                {zernioError}
              </p>
            )}
            {!zernioLoading &&
              (() => {
                const filtered = zernioFilter
                  ? zernioAccounts.filter((a) => a.mappedPlatform === zernioFilter)
                  : zernioAccounts;
                if (filtered.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-2">
                      No accounts here yet. Connect the channel in{" "}
                      <a
                        href="https://zernio.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        Zernio
                      </a>
                      , set <code className="text-xs bg-muted px-1 rounded">ZERNIO_API_KEY</code> in the server{" "}
                      <code className="text-xs bg-muted px-1 rounded">.env</code>, see{" "}
                      <code className="text-xs bg-muted px-1 rounded">docs/KOPPLINGAR.md</code>.
                    </p>
                  );
                }
                return (
                  <ul className="space-y-2">
                    {filtered.map((row) => {
                      const zid = String(row.id || row.accountId || "");
                      const mp = row.mappedPlatform;
                      const ZIcon = mp ? platformIcons[mp as AccountPlatform] : Layers;
                      const title =
                        row.displayName || row.name || row.username || zid || "Account";
                      const idHint =
                        zid.length > 14 ? `${zid.slice(0, 12)}…` : zid || "";
                      return (
                        <li key={zid || title}>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start gap-2 h-auto py-2.5"
                            disabled={!!zernioLinking}
                            onClick={() => void linkZernioAccount(row)}
                          >
                            <ZIcon className="h-4 w-4 shrink-0" />
                            <span className="flex flex-col items-start min-w-0 text-left">
                              <span className="truncate font-medium text-sm">{title}</span>
                              <span className="text-[11px] text-muted-foreground truncate">
                                {mp?.replace(/_/g, " ") ?? row.rawPlatform ?? "channel"}
                                {idHint ? ` · ${idHint}` : ""}
                              </span>
                            </span>
                            {zernioLinking === zid && (
                              <Loader2 className="h-4 w-4 animate-spin shrink-0 ml-auto" />
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZernioOpen(false)}>
              Close
            </Button>
            <Button variant="secondary" type="button" disabled={zernioLoading} onClick={() => void loadZernioAccounts()}>
              Refresh list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </Sidebar>
  );
}
