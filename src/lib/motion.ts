/**
 * Shared motion presets. Keep these constant across the app so motion
 * feels intentional rather than sprinkled. Pages that previously defined
 * `const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }`
 * inline should import `pageFadeUp` from here instead.
 *
 * Guiding rule: motion is used to *introduce* a page, not to stage content
 * per section. Long staggered reveals made the app feel slow without adding
 * information. Prefer a single, subtle fade on mount.
 */

import type { Transition } from "framer-motion";

export const pageFadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
} as const;

/** Default transition timing for the page-level fade above. */
export const pageFadeUpTransition: Transition = {
  duration: 0.28,
  ease: "easeOut",
};

/** Scroll-triggered section reveal for landing page blocks. */
export const sectionReveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-48px" },
  transition: { duration: 0.45, ease: "easeOut" },
} as const;

export const sectionRevealTransition: Transition = {
  duration: 0.45,
  ease: "easeOut",
};

/**
 * Subtle fade without translate — use for inline content that appears
 * post-mount (e.g. data arriving from a query).
 */
export const softFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
} as const;
