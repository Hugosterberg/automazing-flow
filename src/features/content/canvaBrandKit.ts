/**
 * Brand Studio kit — the visual/voice preferences behind AI-generated,
 * Canva-autofilled posts (colors, font, text size, format, tone, topics).
 * Persisted per business profile via `useProfileDocument`.
 */

export type CanvaPostFormat = "feed_square" | "feed_portrait" | "story";
export type CanvaTextSize = "small" | "medium" | "large";

export interface CanvaBrandKit {
  /** Free-text label for which account/brand this kit is for, e.g. "Bitcoinlivet". */
  label: string;
  colors: { primary: string; secondary: string; accent: string };
  /** Informational — should match the font actually used inside the chosen Canva template. */
  fontFamily: string;
  textSize: CanvaTextSize;
  format: CanvaPostFormat;
  /** Hard cap on the AI headline length, so it fits the template's text box. Derived from textSize+format, editable. */
  maxHeadlineChars: number;
  toneOfVoice: string;
  topics: string;
  /** Canva Brand Template id to autofill into, one per format. */
  brandTemplateIds: Partial<Record<CanvaPostFormat, string>>;
}

export const CANVA_BRAND_KIT_DOC_KEY = "canva-brand-kit";

export const POST_FORMAT_OPTIONS: Array<{ value: CanvaPostFormat; ratio: string }> = [
  { value: "feed_square", ratio: "1:1" },
  { value: "feed_portrait", ratio: "4:5" },
  { value: "story", ratio: "9:16" },
];

const TEXT_SIZE_BASE_CHARS: Record<CanvaTextSize, number> = {
  small: 100,
  medium: 65,
  large: 40,
};

/** Taller formats give a headline a bit more room before it feels cramped. */
const FORMAT_CHAR_MULTIPLIER: Record<CanvaPostFormat, number> = {
  feed_square: 1,
  feed_portrait: 1.15,
  story: 1.3,
};

export function defaultMaxHeadlineChars(size: CanvaTextSize, format: CanvaPostFormat): number {
  return Math.round(TEXT_SIZE_BASE_CHARS[size] * FORMAT_CHAR_MULTIPLIER[format]);
}

// Bitcoin-orange/near-black/white — a sensible on-brand starting point for a
// crypto-focused account; any kit can override these via the color pickers.
export const DEFAULT_BRAND_KIT: CanvaBrandKit = {
  label: "",
  colors: { primary: "#F7931A", secondary: "#0B0E11", accent: "#FFFFFF" },
  fontFamily: "",
  textSize: "medium",
  format: "feed_square",
  maxHeadlineChars: defaultMaxHeadlineChars("medium", "feed_square"),
  toneOfVoice: "",
  topics: "",
  brandTemplateIds: {},
};
