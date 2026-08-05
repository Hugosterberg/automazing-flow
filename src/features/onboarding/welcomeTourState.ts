/**
 * Welcome tour state + open channel.
 *
 * Seen/dismissed state lives in a profile document (not localStorage) so a
 * user who starts on desktop and continues on their phone is greeted once,
 * not once per device. The window event lets any surface reopen the tour —
 * command palette, help links — without threading props through the tree.
 */

export const WELCOME_TOUR_DOC_KEY = "welcome-tour";

export type WelcomeTourDoc = {
  /** Set when the user finishes the last slide. */
  completedAt?: string | null;
  /** Set when the user skips — treated the same as completed for auto-open. */
  dismissedAt?: string | null;
};

export const OPEN_WELCOME_TOUR_EVENT = "automazing:open-welcome-tour";

export function openWelcomeTour(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_WELCOME_TOUR_EVENT));
}

export function welcomeTourSeen(doc: WelcomeTourDoc | null | undefined): boolean {
  return Boolean(doc?.completedAt || doc?.dismissedAt);
}
