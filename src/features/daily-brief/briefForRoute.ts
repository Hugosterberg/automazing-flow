import type { BriefItem, BriefItemKind } from "./buildDailyBrief";

/** Which brief signal kinds matter on each route. */
const ROUTE_KINDS: Record<string, BriefItemKind[]> = {
  "/messages": ["message"],
  "/tasks": ["task"],
  "/sales": ["lead", "marketing"],
  "/reviews": ["review"],
  "/automations": ["automation"],
  "/connections": ["connection"],
  "/marketing": ["marketing"],
  "/content": ["marketing", "recommendation"],
  "/ecommerce": ["marketing", "store"],
  "/company": ["economy"],
  "/customers": ["lead", "message"],
  "/activity": ["automation", "task", "lead", "agent"],
  "/ai-recommendations": ["recommendation"],
  "/insights": ["marketing"],
  "/social-media": ["recommendation", "marketing"],
};

function pathnameMatchesRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

function kindsForPathname(pathname: string): BriefItemKind[] | null {
  if (pathname === "/") return null;
  const exact = ROUTE_KINDS[pathname];
  if (exact) return exact;
  for (const [route, kinds] of Object.entries(ROUTE_KINDS)) {
    if (pathnameMatchesRoute(pathname, route)) return kinds;
  }
  return null;
}

/**
 * Brief items relevant to the page the user is on — used for contextual
 * hints under PagePurposeStrip and module-scoped command palette actions.
 */
export function briefItemsForRoute(pathname: string, items: BriefItem[]): BriefItem[] {
  const kinds = kindsForPathname(pathname);
  if (!kinds) return items.slice(0, 3);
  const kindSet = new Set(kinds);
  return items.filter((item) => kindSet.has(item.kind));
}

export function routeModuleLabel(pathname: string): string | null {
  if (pathname.startsWith("/messages")) return "Meddelanden";
  if (pathname.startsWith("/tasks")) return "Uppgifter";
  if (pathname.startsWith("/sales")) return "Sales";
  if (pathname.startsWith("/reviews")) return "Recensioner";
  if (pathname.startsWith("/automations")) return "Automationer";
  if (pathname.startsWith("/marketing")) return "Marketing";
  if (pathname.startsWith("/content")) return "Content";
  if (pathname.startsWith("/ecommerce")) return "E-handel";
  if (pathname.startsWith("/company")) return "Företag";
  return null;
}
