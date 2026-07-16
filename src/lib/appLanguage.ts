/**
 * App language resolution — framework-free so it can run before React mounts
 * and be unit-tested without i18next.
 *
 * Policy (product decision, see ai/DECISIONS.md):
 *   - Visitors browsing from Sweden default to Swedish.
 *   - Everyone else defaults to English.
 *   - An explicit user choice (language switcher in Preferences) always wins
 *     and is remembered per browser.
 *
 * Resolution order:
 *   1. `app-language`      — explicit user choice (persisted forever).
 *   2. `app-language-geo`  — cached result of the last geo lookup, so repeat
 *                            visits start in the right language without a
 *                            network round-trip (no language flash).
 *   3. "en"                — safe default while the first geo lookup runs.
 */

export type AppLanguage = "sv" | "en";

export const APP_LANGUAGES: { value: AppLanguage; label: string }[] = [
  { value: "sv", label: "Svenska" },
  { value: "en", label: "English" },
];

const USER_LANGUAGE_KEY = "app-language";
const GEO_LANGUAGE_KEY = "app-language-geo";

function readKey(key: string): AppLanguage | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === "sv" || raw === "en" ? raw : null;
  } catch {
    return null; // storage unavailable (private mode etc.)
  }
}

function writeKey(key: string, value: AppLanguage): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable — the choice just won't persist
  }
}

/** Explicit user choice, if any. */
export function getUserLanguage(): AppLanguage | null {
  return readKey(USER_LANGUAGE_KEY);
}

/** Persist an explicit user choice (always wins over geo detection). */
export function setUserLanguage(lang: AppLanguage): void {
  writeKey(USER_LANGUAGE_KEY, lang);
}

/** Clear explicit choice so geo (or English) applies again. */
export function clearUserLanguage(): void {
  try {
    localStorage.removeItem(USER_LANGUAGE_KEY);
  } catch {
    // ignore
  }
}

/** Cached geo language, if any. */
export function getGeoLanguage(): AppLanguage | null {
  return readKey(GEO_LANGUAGE_KEY);
}

/** Language to boot with, before any network call. */
export function resolveInitialLanguage(): AppLanguage {
  return getUserLanguage() ?? readKey(GEO_LANGUAGE_KEY) ?? "en";
}

/** True when we have neither a user choice nor a cached geo result. */
export function needsGeoDetection(): boolean {
  return getUserLanguage() === null && readKey(GEO_LANGUAGE_KEY) === null;
}

/** Map ISO country code → default UI language (SE → sv, everything else → en). */
export function languageFromCountry(country: string | null | undefined): AppLanguage {
  return country === "SE" ? "sv" : "en";
}

/**
 * Ask the backend which country the request came from (Vercel geo header).
 * Returns the detected default language, or null when detection failed —
 * callers should then stay on the current language rather than flip-flop.
 */
export async function detectGeoLanguage(): Promise<AppLanguage | null> {
  try {
    const res = await fetch("/api/geo", { credentials: "include" });
    if (!res.ok) return null;
    const body = (await res.json()) as { country?: string | null };
    const lang = languageFromCountry(body.country);
    writeKey(GEO_LANGUAGE_KEY, lang);
    return lang;
  } catch {
    return null;
  }
}

/** BCP 47 locale used for Intl date/number formatting per UI language. */
export function localeForLanguage(lang: string): string {
  return lang === "sv" ? "sv-SE" : "en-US";
}
