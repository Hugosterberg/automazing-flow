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
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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
  ShopifyIcon,
  GmailIcon,
  OutlookIcon,
  LightbulbGlowIcon,
} from "@/components/platform-icons";
import type { AccountPlatform, ConnectedAccount } from "@/types/accounts";

const API_BASE = (import.meta.env.VITE_API_URL || "").trim() || "/api";

const navItems = [
  {
    key: "social-media",
    title: "Social Media",
    url: "/social-media",
    icon: Share2,
    platforms: ["instagram", "tiktok", "youtube"] as AccountPlatform[],
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
  shopify: ShopifyIcon,
  gmail: GmailIcon,
  outlook: OutlookIcon,
};

function getAccountsForCategory(accounts: ConnectedAccount[], platforms: AccountPlatform[]) {
  if (platforms.length === 0) return [];
  return accounts.filter((a) => platforms.includes(a.platform));
}

export function AppSidebar() {
  const location = useLocation();
  const { accounts, activeProfileId, selectedAccountId, setSelectedAccountId, removeAccount } = useAccounts();

  function handleConnectPlatform(platform: AccountPlatform) {
    const params = new URLSearchParams();
    if (activeProfileId) params.set("profile_id", activeProfileId);
    if (platform === "shopify") {
      const shop = window.prompt("Ange din Shopify-butik (t.ex. minbutik.myshopify.com):");
      if (!shop?.trim()) return;
      params.set("shop", shop.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `${API_BASE}/auth/${platform}${query}`;
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
                        Anslutna konton
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
                                      {account.stats.followersCount.toLocaleString("sv-SE")}
                                      {" följare"}
                                    </>
                                  )}
                                  {account.stats.followersCount != null && account.stats.mediaCount != null && " · "}
                                  {account.stats.mediaCount != null && (
                                    <>{account.stats.mediaCount} inlägg</>
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
                                  Koppla bort
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
                              Anslut fler
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {!hasConnect && (
                        <p className="text-[11px] text-muted-foreground/70 py-0.5 italic">
                          Snart tillgängligt
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
            Profil
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <ProfileSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
