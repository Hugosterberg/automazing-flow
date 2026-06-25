import type { ComponentType } from "react";
import {
  Share2,
  ShoppingCart,
  LineChart,
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
} from "lucide-react";
import { LightbulbGlowIcon } from "@/components/platform-icons";
import type { AccountPlatform } from "@/types/accounts";

/**
 * Shared navigation config. Single source of truth for the app's routes,
 * consumed by both the sidebar (AppSidebar) and the command palette
 * (CommandPalette) so the two never drift apart.
 *
 * Sidebar groups read top-to-bottom as a user journey:
 *   Work:         day-to-day channels and content
 *   Productivity: cross-cutting assistants (tasks, activity, AI)
 *   System:       config and provider wiring
 * Keep this list short — flat long sidebars are hard to scan.
 */
export type NavGroup = "work" | "productivity" | "system";

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  work: "Work",
  productivity: "Productivity",
  system: "System",
};

export const NAV_GROUP_ORDER: NavGroup[] = ["work", "productivity", "system"];

export interface TopNavItem {
  key: string;
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
  platforms: AccountPlatform[];
  hideAccounts?: boolean;
}

export interface NavItem extends TopNavItem {
  group: NavGroup;
}

export const topNavItems: TopNavItem[] = [
  {
    key: "company",
    title: "Company",
    url: "/company",
    icon: Building2,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
  },
  {
    key: "connections",
    title: "Connections",
    url: "/connections",
    icon: PlugZap,
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

export const navItems: NavItem[] = [
  {
    key: "content",
    title: "Content",
    url: "/content",
    icon: FolderOpen,
    platforms: ["google_drive", "canva"] as AccountPlatform[],
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
    title: "E-commerce",
    url: "/ecommerce",
    icon: ShoppingCart,
    platforms: ["shopify", "notion"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "sales-marketing",
    title: "Sales",
    url: "/sales",
    icon: LineChart,
    platforms: [] as AccountPlatform[],
    hideAccounts: true,
    group: "work",
  },
  {
    key: "marketing",
    title: "Marketing",
    url: "/marketing",
    icon: Megaphone,
    platforms: ["google_ads", "meta_business"] as AccountPlatform[],
    group: "work",
  },
  {
    key: "digital-brand",
    title: "Digital Brand",
    url: "/digital-brand",
    icon: Globe2,
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
    platforms: ["gmail", "outlook", "instagram", "facebook", "whatsapp"] as AccountPlatform[],
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
];
