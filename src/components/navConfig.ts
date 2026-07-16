import type { ComponentType } from "react";
import {
  Share2,
  ShoppingCart,
  LineChart,
  BarChart3,
  Users,
  CalendarDays,
  Star,
  MessageSquare,
  Settings,
  FolderOpen,
  PlugZap,
  ListChecks,
  Activity,
  Megaphone,
  Globe2,
  Building2,
  Zap,
  Bot,
} from "lucide-react";
import { LightbulbGlowIcon } from "@/components/platform-icons";
import type { AccountPlatform } from "@/types/accounts";
import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";

/**
 * Shared navigation config. Single source of truth for the app's routes,
 * consumed by both the sidebar (AppSidebar) and the command palette
 * (CommandPalette) so the two never drift apart.
 *
 * Display titles are NOT stored here — they live in the translation files
 * (src/locales/<lang>/common.json) under `nav.<key>` and `navGroups.<group>`,
 * so every consumer renders `t("nav." + item.key)` and language switching
 * just works. Adding a nav item = add it here + add `nav.<key>` to BOTH
 * locale files.
 *
 * Sidebar groups read top-to-bottom as a user journey:
 *   Work:         day-to-day channels and content
 *   Productivity: cross-cutting assistants (tasks, activity, AI)
 *   System:       config and provider wiring
 * Keep this list short — flat long sidebars are hard to scan.
 */
export type NavGroup = "work" | "productivity" | "system";

export const NAV_GROUP_ORDER: NavGroup[] = ["work", "productivity", "system"];

export interface TopNavItem {
  /** Stable id; also the translation key suffix (`nav.<key>`). */
  key: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  platforms: AccountPlatform[];
  hideAccounts?: boolean;
  /**
   * Workspace modes where the item is shown. Omitted = visible in both.
   * Private keeps the personally useful surface (content, socials, calendar,
   * messages, tasks, activity, AI); everything company-oriented is
   * business-only.
   */
  modes?: WorkspaceMode[];
}

export interface NavItem extends TopNavItem {
  group: NavGroup;
}

export const topNavItems: TopNavItem[] = [
  {
    key: "company",
    url: "/company",
    icon: Building2,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    modes: ["business"],
  },
  {
    key: "connections",
    url: "/connections",
    icon: PlugZap,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
  {
    key: "preferences",
    url: "/preferences",
    icon: Settings,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
];

export const navItems: NavItem[] = [
  {
    key: "content",
    url: "/content",
    icon: FolderOpen,
    platforms: ["google_drive", "canva"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "social-media",
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
    url: "/ecommerce",
    icon: ShoppingCart,
    platforms: ["shopify", "notion"] as AccountPlatform[],
    group: "work",
    modes: ["business"],
  },
  {
    key: "sales-marketing",
    url: "/sales",
    icon: LineChart,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "work",
    modes: ["business"],
  },
  {
    key: "marketing",
    url: "/marketing",
    icon: Megaphone,
    platforms: ["google_ads", "meta_business"] as AccountPlatform[],
    group: "work",
    modes: ["business"],
  },
  {
    key: "digital-brand",
    url: "/digital-brand",
    icon: Globe2,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "work",
    modes: ["business"],
  },
  {
    key: "customers",
    url: "/customers",
    icon: Users,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "work",
    modes: ["business"],
  },
  {
    key: "calendar",
    url: "/calendar",
    icon: CalendarDays,
    platforms: ["google_calendar", "outlook_calendar"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "messages",
    url: "/messages",
    icon: MessageSquare,
    platforms: ["gmail", "outlook", "instagram", "facebook", "whatsapp"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "reviews",
    url: "/reviews",
    icon: Star,
    platforms: ["google_reviews", "tripadvisor"] as AccountPlatform[],
    group: "work",
    modes: ["business"],
  },
  {
    key: "tasks",
    url: "/tasks",
    icon: ListChecks,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "insights",
    url: "/insights",
    icon: BarChart3,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "activity",
    url: "/activity",
    icon: Activity,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "automations",
    url: "/automations",
    icon: Zap,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "ai-recommendations",
    url: "/ai-recommendations",
    icon: LightbulbGlowIcon,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "productivity",
  },
  {
    key: "intelligence",
    url: "/intelligence",
    icon: Bot,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "system",
  },
];

function itemVisibleInMode(item: TopNavItem, mode: WorkspaceMode): boolean {
  return !item.modes || item.modes.includes(mode);
}

/** Sidebar/palette nav items visible in the given workspace mode. */
export function navItemsForMode(mode: WorkspaceMode): NavItem[] {
  return navItems.filter((item) => itemVisibleInMode(item, mode));
}

/** Top (system) nav items visible in the given workspace mode. */
export function topNavItemsForMode(mode: WorkspaceMode): TopNavItem[] {
  return topNavItems.filter((item) => itemVisibleInMode(item, mode));
}

/**
 * Whether a pathname is reachable in the given mode. Non-nav URLs (home,
 * not-found, deep links with query params handled upstream) are always
 * allowed — this only fences off pages whose nav entry is mode-restricted.
 */
export function isNavUrlAllowedInMode(pathname: string, mode: WorkspaceMode): boolean {
  const restricted = [...topNavItems, ...navItems].find(
    (item) => item.url === pathname && item.modes && !item.modes.includes(mode)
  );
  return !restricted;
}
