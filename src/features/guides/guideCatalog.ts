import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  ListChecks,
  MessageSquare,
  PenSquare,
  PlugZap,
  ShoppingBag,
  Star,
  Sparkles,
  UserPlus,
} from "lucide-react";

/**
 * Short, interactive walkthroughs for the parts of the portal that are not
 * self-evident. One guide per job to be done — never per screen — so the
 * steps read as "how do I get this done" rather than "what is on this page".
 *
 * Structure lives here (id, which route it belongs to, where each step sends
 * you); the copy lives in the `guides` translation namespace so both
 * languages stay in sync. Keep guides to 3-5 steps: anything longer is a
 * sign the flow itself needs simplifying, not a longer guide.
 */
export const GUIDE_IDS = [
  "connections",
  "home",
  "messages",
  "reviews",
  "tasks",
  "content",
  "automations",
  "ecommerce",
  "sales",
  "marketing",
  "company",
  "calendar",
] as const;

export type GuideId = (typeof GUIDE_IDS)[number];

export type GuideDefinition = {
  id: GuideId;
  /** Route this guide is offered on. */
  route: string;
  icon: LucideIcon;
  /** How many steps the translation file provides. */
  stepCount: number;
  /**
   * Optional deep link per step index — "take me there" for steps that
   * happen on another screen. Routes never live in translation files.
   */
  stepLinks?: Record<number, string>;
};

export const GUIDES: GuideDefinition[] = [
  {
    id: "connections",
    route: "/connections",
    icon: PlugZap,
    stepCount: 4,
    stepLinks: { 3: "/" },
  },
  {
    id: "home",
    route: "/",
    icon: Sparkles,
    stepCount: 4,
    stepLinks: { 1: "/messages", 3: "/connections" },
  },
  {
    id: "messages",
    route: "/messages",
    icon: MessageSquare,
    stepCount: 4,
    stepLinks: { 3: "/automations" },
  },
  {
    id: "reviews",
    route: "/reviews",
    icon: Star,
    stepCount: 4,
    stepLinks: { 3: "/automations" },
  },
  { id: "tasks", route: "/tasks", icon: ListChecks, stepCount: 4 },
  {
    id: "content",
    route: "/content",
    icon: PenSquare,
    stepCount: 4,
    stepLinks: { 3: "/calendar" },
  },
  {
    id: "automations",
    route: "/automations",
    icon: Bot,
    stepCount: 4,
    stepLinks: { 3: "/activity" },
  },
  { id: "ecommerce", route: "/ecommerce", icon: ShoppingBag, stepCount: 4 },
  { id: "sales", route: "/sales", icon: UserPlus, stepCount: 4 },
  { id: "marketing", route: "/marketing", icon: BarChart3, stepCount: 4 },
  {
    id: "company",
    route: "/company",
    icon: Building2,
    stepCount: 3,
    stepLinks: { 2: "/ai-recommendations" },
  },
  { id: "calendar", route: "/calendar", icon: CalendarDays, stepCount: 3 },
];

const BY_ID = new Map<string, GuideDefinition>(GUIDES.map((g) => [g.id, g]));
const BY_ROUTE = new Map<string, GuideDefinition>(GUIDES.map((g) => [g.route, g]));

export function getGuide(id: string | null | undefined): GuideDefinition | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/**
 * Guide offered for a pathname. Exact match first so "/" does not win for
 * every route, then the longest prefix so detail URLs keep their guide.
 */
export function guideForRoute(pathname: string): GuideDefinition | null {
  const exact = BY_ROUTE.get(pathname);
  if (exact) return exact;

  let best: GuideDefinition | null = null;
  for (const guide of GUIDES) {
    if (guide.route === "/") continue;
    if (!pathname.startsWith(guide.route)) continue;
    if (!best || guide.route.length > best.route.length) best = guide;
  }
  return best;
}
