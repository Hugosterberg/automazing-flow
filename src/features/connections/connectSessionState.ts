import type { AccountPlatform } from "@/types/accounts";
import { isMcpPlatform } from "./mcpProviders";

/**
 * Client-only pending Connect Session — survives full-page OAuth redirects.
 * Not tenant data; sessionStorage is the right scratchpad.
 */

export const CONNECT_SESSION_STORAGE_KEY = "automazing:connect-session";

export type ConnectSessionStep =
  | "why"
  | "prerequisites"
  | "connect"
  | "verify"
  | "done"
  | "error";

export type PendingConnectSession = {
  platform: AccountPlatform;
  /** Where to send the user after success (in-app path). */
  returnTo?: string | null;
  step: ConnectSessionStep;
  /** Account id from OAuth callback — used to auto-probe. */
  accountId?: string | null;
  /** Error message when step === "error". */
  errorMessage?: string | null;
  errorFix?: string | null;
  updatedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readPendingConnectSession(): PendingConnectSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(CONNECT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingConnectSession;
    if (!parsed?.platform || !parsed?.step) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingConnectSession(
  partial: Omit<PendingConnectSession, "updatedAt"> & { updatedAt?: string }
): void {
  if (!canUseStorage()) return;
  try {
    const next: PendingConnectSession = {
      ...partial,
      updatedAt: partial.updatedAt ?? new Date().toISOString(),
    };
    window.sessionStorage.setItem(CONNECT_SESSION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
}

export function clearPendingConnectSession(): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(CONNECT_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Deep-link into Connections Center opening a guided session for a platform. */
export function connectionsSessionHref(
  platform: string,
  extras?: { wizard?: boolean; tab?: "mcp" | "health" }
): string {
  const params = new URLSearchParams();
  params.set("session", platform);
  if (extras?.wizard) params.set("wizard", "1");
  if (extras?.tab) params.set("tab", extras.tab);
  return `/connections?${params.toString()}`;
}

/** In-app value surface after a successful connect (mail → messages, etc.). */
export function valueSurfaceForPlatform(platform: AccountPlatform): { to: string; labelKey: string } {
  switch (platform) {
    case "gmail":
    case "outlook":
    case "instagram":
    case "facebook":
    case "whatsapp":
      return { to: "/messages?bucket=today", labelKey: "session.nextMessages" };
    case "google_calendar":
    case "outlook_calendar":
      return { to: "/calendar", labelKey: "session.nextCalendar" };
    case "shopify":
    case "notion":
      return { to: "/ecommerce", labelKey: "session.nextEcommerce" };
    case "google_reviews":
    case "tripadvisor":
    case "judgeme":
      return { to: "/reviews", labelKey: "session.nextReviews" };
    case "google_drive":
    case "canva":
      return { to: "/content", labelKey: "session.nextContent" };
    case "google_ads":
    case "meta_business":
      return { to: "/marketing", labelKey: "session.nextMarketing" };
    case "fortnox":
      return { to: "/company", labelKey: "session.nextCompany" };
    default:
      if (isMcpPlatform(platform)) {
        return { to: "/intelligence", labelKey: "session.nextIntelligence" };
      }
      return { to: "/connections", labelKey: "session.nextConnections" };
  }
}
