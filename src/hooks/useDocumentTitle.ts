import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { navItems, topNavItems } from "@/components/navConfig";

const APP_NAME = "Automazing";

// Path → page title, derived from the shared nav config so titles never drift
// from the sidebar/command-palette. Sorted by path length (descending) so the
// most specific prefix wins for nested routes.
const TITLE_ENTRIES = [...navItems, ...topNavItems]
  .map((item) => [item.url, item.title] as const)
  .sort((a, b) => b[0].length - a[0].length);

export function titleForPath(pathname: string): string {
  const exact = TITLE_ENTRIES.find(([url]) => url === pathname);
  if (exact) return exact[1];
  const prefix = TITLE_ENTRIES.find(([url]) => url !== "/" && pathname.startsWith(`${url}/`));
  return prefix ? prefix[1] : "";
}

/**
 * Keeps the browser tab title in sync with the active route, e.g.
 * "E-commerce · Automazing". Falls back to the bare app name on unknown
 * routes (landing page, 404). Call once, high in the tree (Layout).
 */
export function useDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = titleForPath(pathname);
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [pathname]);
}
