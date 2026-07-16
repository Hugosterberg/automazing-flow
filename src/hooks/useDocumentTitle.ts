import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { navItems, topNavItems } from "@/components/navConfig";
import { t as translate } from "@/lib/i18n";

const APP_NAME = "Automazing";

// Path → nav key, derived from the shared nav config so titles never drift
// from the sidebar/command-palette. Sorted by path length (descending) so the
// most specific prefix wins for nested routes.
const KEY_ENTRIES = [...navItems, ...topNavItems]
  .map((item) => [item.url, item.key] as const)
  .sort((a, b) => b[0].length - a[0].length);

function navKeyForPath(pathname: string): string | null {
  const exact = KEY_ENTRIES.find(([url]) => url === pathname);
  if (exact) return exact[1];
  const prefix = KEY_ENTRIES.find(([url]) => url !== "/" && pathname.startsWith(`${url}/`));
  return prefix ? prefix[1] : null;
}

/** Resolve the translated page title for a path (used by tests and tab titles). */
export function titleForPath(pathname: string): string {
  const key = navKeyForPath(pathname);
  return key ? translate(`nav.${key}`) : "";
}

/**
 * Keeps the browser tab title in sync with the active route, e.g.
 * "E-commerce · Automazing". Falls back to the bare app name on unknown
 * routes (landing page, 404). Call once, high in the tree (Layout).
 */
export function useDocumentTitle() {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const key = navKeyForPath(pathname);
    const title = key ? t(`nav.${key}`) : "";
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [pathname, t, i18n.language]);
}
