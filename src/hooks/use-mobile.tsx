import * as React from "react";
import { useLocation } from "react-router-dom";

const MOBILE_BREAKPOINT = 768;
/** Split-pane inbox workspaces activate at this width (aligns with Tailwind `lg`). */
export const DESKTOP_WORKSPACE_BREAKPOINT = 1024;

export function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}

export function useIsDesktopWorkspace() {
  return useMediaQuery(`(min-width: ${DESKTOP_WORKSPACE_BREAKPOINT}px)`);
}

/** Single-pane inbox layout (below lg / 1024px). */
export function useStackedWorkspace() {
  return !useIsDesktopWorkspace();
}

/** Hide list chrome and show full-height detail on phones/tablets in portrait. */
export function useFocusedWorkspaceReading(hasSelection: boolean) {
  return useStackedWorkspace() && hasSelection;
}

/**
 * True when the URL indicates a stacked inbox reading a selected item
 * (Messages/Reviews/Customers). Used to hide bottom tabs and reclaim viewport.
 */
export function useMobileReadingFocus() {
  const stacked = useStackedWorkspace();
  const { pathname, search } = useLocation();

  return React.useMemo(() => {
    if (!stacked) return false;
    const params = new URLSearchParams(search);
    if (pathname.startsWith("/messages") && params.get("id")) return true;
    if (pathname.startsWith("/reviews") && params.get("id")) return true;
    if (pathname.startsWith("/customers") && params.get("index") != null && params.get("index") !== "") {
      return true;
    }
    return false;
  }, [stacked, pathname, search]);
}
