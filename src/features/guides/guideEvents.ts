/**
 * Cross-component channel for opening a guide.
 *
 * The dialog is mounted once inside the page chrome, but a guide can be
 * triggered from anywhere — the command palette, an empty state, a failed
 * connection. A window event keeps those callers from having to reach for
 * shared state or thread props through the tree.
 */
export const OPEN_GUIDE_EVENT = "automazing:open-guide";

export type OpenGuideDetail = { guideId?: string };

export function openGuide(guideId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenGuideDetail>(OPEN_GUIDE_EVENT, { detail: { guideId } }));
}
