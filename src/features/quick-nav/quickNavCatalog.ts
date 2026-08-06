import type { ComponentType } from "react";
import {
  Activity as ActivityIcon,
  Building2,
  BookOpen,
  CalendarDays,
  Film,
  FolderOpen,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageSquare,
  PlugZap,
  Share2,
  ShoppingCart,
  Star,
  Target,
  Users,
  BarChart3,
  Zap,
} from "lucide-react";
import type { WorkspaceMode } from "@/features/workspace-mode/workspaceMode";

export type QuickNavBadgeKey = "messages" | "tasks" | "reviews";

export type QuickNavDestination = {
  key: string;
  to: string;
  label: string;
  /** Short label for bottom tabs (≤ ~10 chars). */
  shortLabel: string;
  /** Optional blurb for Hem "Gå till" cards. */
  description?: string;
  icon: ComponentType<{ className?: string }>;
  modes?: WorkspaceMode[];
  badgeKey?: QuickNavBadgeKey;
  match: (path: string) => boolean;
};

/**
 * Pool of destinations the user can pin as mobile primary shortcuts
 * (or home jump cards). Keep keys stable — they are stored in prefs.
 */
export const QUICK_NAV_CATALOG: QuickNavDestination[] = [
  {
    key: "messages",
    to: "/messages",
    label: "Meddelanden",
    shortLabel: "Mail",
    description: "Inkorg, DM och utkast",
    icon: MessageSquare,
    badgeKey: "messages",
    match: (path) => path.startsWith("/messages"),
  },
  {
    key: "tasks",
    to: "/tasks",
    label: "Uppgifter",
    shortLabel: "Uppgifter",
    description: "Att göra, förfallodatum och uppföljning",
    icon: ListChecks,
    badgeKey: "tasks",
    match: (path) => path.startsWith("/tasks"),
  },
  {
    key: "reviews",
    to: "/reviews",
    label: "Recensioner",
    shortLabel: "Omdömen",
    description: "Omdömen som väntar på svar",
    icon: Star,
    modes: ["business"],
    badgeKey: "reviews",
    match: (path) => path.startsWith("/reviews"),
  },
  {
    key: "content",
    to: "/content",
    label: "Innehåll",
    shortLabel: "Innehåll",
    description: "Skapa, bläddra och publicera",
    icon: Film,
    match: (path) => path.startsWith("/content"),
  },
  {
    key: "calendar",
    to: "/calendar",
    label: "Kalender",
    shortLabel: "Kalender",
    description: "Schemalagda inlägg och aktiviteter",
    icon: CalendarDays,
    match: (path) => path.startsWith("/calendar"),
  },
  {
    key: "social-media",
    to: "/social-media",
    label: "Socialt",
    shortLabel: "Socialt",
    description: "Inlägg, statistik och överblick",
    icon: Share2,
    match: (path) => path.startsWith("/social-media"),
  },
  {
    key: "sales",
    to: "/sales",
    label: "Försäljning",
    shortLabel: "Försäljning",
    description: "Leads, pipeline och uppföljning",
    icon: Target,
    modes: ["business"],
    match: (path) => path.startsWith("/sales"),
  },
  {
    key: "customers",
    to: "/customers",
    label: "Kunder",
    shortLabel: "Kunder",
    description: "Kundlista och relationer",
    icon: Users,
    modes: ["business"],
    match: (path) => path.startsWith("/customers"),
  },
  {
    key: "activity",
    to: "/activity",
    label: "Aktivitet",
    shortLabel: "Aktivitet",
    description: "Senaste händelser i arbetsytan",
    icon: ActivityIcon,
    match: (path) => path.startsWith("/activity"),
  },
  {
    key: "connections",
    to: "/connections",
    label: "Kopplingar",
    shortLabel: "Kopplingar",
    description: "Kopplade konton, status och omautentisering",
    icon: PlugZap,
    match: (path) => path.startsWith("/connections"),
  },
  {
    key: "company",
    to: "/company",
    label: "Företag",
    shortLabel: "Företag",
    description: "Företagsprofil och varumärke",
    icon: Building2,
    modes: ["business"],
    match: (path) => path.startsWith("/company"),
  },
  {
    key: "automations",
    to: "/automations",
    label: "Automationer",
    shortLabel: "Auto",
    description: "Flöden, scheman och körningar",
    icon: Zap,
    match: (path) => path.startsWith("/automations"),
  },
  {
    key: "marketing",
    to: "/marketing",
    label: "Marknadsföring",
    shortLabel: "Marknadsföring",
    description: "Kampanjer och marknadsinsikter",
    icon: Megaphone,
    modes: ["business"],
    match: (path) => path.startsWith("/marketing"),
  },
  {
    key: "ecommerce",
    to: "/ecommerce",
    label: "E-handel",
    shortLabel: "E-handel",
    description: "Butikskopplingar och återhämtning",
    icon: ShoppingCart,
    modes: ["business"],
    match: (path) => path.startsWith("/ecommerce"),
  },
  {
    key: "insights",
    to: "/insights",
    label: "Insikter",
    shortLabel: "Insikter",
    description: "Rapporter och nyckeltal",
    icon: BarChart3,
    match: (path) => path.startsWith("/insights"),
  },
  {
    key: "ai-recommendations",
    to: "/ai-recommendations",
    label: "AI-förslag",
    shortLabel: "AI",
    description: "Aktiva och avvisade AI-förslag",
    icon: Lightbulb,
    match: (path) => path.startsWith("/ai-recommendations"),
  },
  {
    key: "drive-library",
    to: "/content?tab=browse",
    label: "Innehållsbibliotek",
    shortLabel: "Drive",
    description: "Drive-assets och skapa-flöde",
    icon: FolderOpen,
    match: (path) => path.startsWith("/content"),
  },
  {
    key: "handbook",
    to: "/handbook",
    label: "Användarhandbok",
    shortLabel: "Handbok",
    description: "Vad du kan göra i varje del av appen",
    icon: BookOpen,
    match: (path) => path.startsWith("/handbook"),
  },
];

export type QuickNavDestinationKey = (typeof QUICK_NAV_CATALOG)[number]["key"];

export const QUICK_NAV_BY_KEY = Object.fromEntries(
  QUICK_NAV_CATALOG.map((item) => [item.key, item])
) as Record<string, QuickNavDestination>;

export const DEFAULT_PRIMARY_KEYS_BUSINESS = ["messages", "tasks", "reviews"] as const;
export const DEFAULT_PRIMARY_KEYS_PRIVATE = ["messages", "tasks", "content"] as const;
export const DEFAULT_HOME_JUMP_KEYS = ["connections", "social-media", "content"] as const;

/** Max custom primary slots beside Hem. */
export const MAX_PRIMARY_SHORTCUTS = 3;
/** Max home jump cards. Alias used by UI copy. */
export const MAX_HOME_JUMPS = 3;
export const QUICK_NAV_PRIMARY_LIMIT = MAX_PRIMARY_SHORTCUTS;
export const QUICK_NAV_HOME_JUMP_LIMIT = MAX_HOME_JUMPS;

/** Path prefix used to prevent pinning two destinations that collide (e.g. content + drive-library). */
export function pathConflictKey(to: string): string {
  return to.split("?")[0] ?? to;
}

export function destinationAllowedInMode(
  dest: QuickNavDestination,
  mode: WorkspaceMode
): boolean {
  return !dest.modes || dest.modes.includes(mode);
}

export function catalogForMode(mode: WorkspaceMode): QuickNavDestination[] {
  return QUICK_NAV_CATALOG.filter((d) => destinationAllowedInMode(d, mode));
}

export function defaultPrimaryKeys(mode: WorkspaceMode): string[] {
  return mode === "private"
    ? [...DEFAULT_PRIMARY_KEYS_PRIVATE]
    : [...DEFAULT_PRIMARY_KEYS_BUSINESS];
}

export function defaultHomeJumpKeys(mode: WorkspaceMode): string[] {
  return DEFAULT_HOME_JUMP_KEYS.filter((key) => {
    const dest = QUICK_NAV_BY_KEY[key];
    return dest ? destinationAllowedInMode(dest, mode) : false;
  });
}
