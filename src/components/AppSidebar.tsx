import { Share2, ShoppingCart, CalendarDays, Zap, Plus, MoreHorizontal, Trash2 } from "lucide-react";
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
  SidebarMenuAction,
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
import { InstagramIcon, TikTokIcon, YoutubeIcon } from "@/components/platform-icons";
import type { SocialPlatform } from "@/types/accounts";

const API_BASE = "/api";

const navItems = [
  { title: "Social Media", url: "/social-media", icon: Share2 },
  { title: "E-commerce", url: "/ecommerce", icon: ShoppingCart },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
];

const platformIcons: Record<SocialPlatform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
};

export function AppSidebar() {
  const location = useLocation();
  const { accounts, selectedAccountId, setSelectedAccountId, removeAccount } = useAccounts();

  function handleConnectPlatform(platform: SocialPlatform) {
    window.location.href = `${API_BASE}/auth/${platform}`;
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
                return (
                  <SidebarMenuItem key={item.title}>
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
          <SidebarGroupLabel className="flex items-center justify-between px-2">
            <span>Anslutna konton</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleConnectPlatform("instagram")}>
                  <InstagramIcon className="h-4 w-4 mr-2" />
                  Instagram
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleConnectPlatform("tiktok")}>
                  <TikTokIcon className="h-4 w-4 mr-2" />
                  TikTok
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleConnectPlatform("youtube")}>
                  <YoutubeIcon className="h-4 w-4 mr-2" />
                  YouTube
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {accounts.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Inga konton anslutna. Klicka + för att lägga till.
              </p>
            ) : (
              <SidebarMenu>
                {accounts.map((account) => {
                  const Icon = platformIcons[account.platform];
                  const isSelected = selectedAccountId === account.id;
                  return (
                    <SidebarMenuItem key={account.id}>
                      <SidebarMenuButton
                        onClick={() => setSelectedAccountId(isSelected ? null : account.id)}
                        isActive={isSelected}
                        className="cursor-pointer"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-secondary">
                            <Icon className="h-3 w-3" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{account.username}</span>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction showOnHover onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </SidebarMenuAction>
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
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  );
}
