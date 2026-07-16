/**
 * i18next setup — the app's single translation entry point.
 *
 * Standard stack: i18next + react-i18next with JSON resources under
 * src/locales/<lang>/<namespace>.json. Components use `useTranslation()`;
 * non-React modules import { t } from here.
 *
 * Language policy lives in src/lib/appLanguage.ts: explicit user choice →
 * cached geo detection → English, with a one-time /api/geo lookup on the
 * very first visit (Swedish only when browsing from Sweden).
 *
 * Migration convention (see AGENTS.md → Internationalization):
 *   - New/changed UI copy goes through t("namespace:key") — never hardcoded.
 *   - Existing Swedish strings are migrated slice by slice; a slice gets its
 *     own namespace file when `common` grows past a screenful.
 */

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import {
  detectGeoLanguage,
  getUserLanguage,
  localeForLanguage,
  needsGeoDetection,
  resolveInitialLanguage,
} from "@/lib/appLanguage";
import { setFormatLocale } from "@/lib/format";
import { setRelativeTimeLocale } from "@/lib/relativeTime";
import svCommon from "@/locales/sv/common.json";
import enCommon from "@/locales/en/common.json";

export const i18n = i18next;

function applyLanguageSideEffects(lang: string): void {
  const locale = localeForLanguage(lang);
  setFormatLocale(locale);
  setRelativeTimeLocale(locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "sv" ? "sv" : "en";
  }
}

/**
 * Initialize synchronously with the best known language so the first paint
 * is already correct for returning visitors; kick off geo detection in the
 * background only when we know nothing yet (first ever visit).
 */
export function initI18n(): void {
  if (i18next.isInitialized) return;

  const initialLanguage = resolveInitialLanguage();

  void i18next.use(initReactI18next).init({
    resources: {
      sv: { common: svCommon },
      en: { common: enCommon },
    },
    lng: initialLanguage,
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: { escapeValue: false }, // React escapes output itself
    returnEmptyString: false,
  });

  applyLanguageSideEffects(initialLanguage);
  i18next.on("languageChanged", applyLanguageSideEffects);

  if (needsGeoDetection()) {
    void detectGeoLanguage().then((detected) => {
      // The user may have picked a language while the lookup was in flight.
      if (detected && getUserLanguage() === null && detected !== i18next.language) {
        void i18next.changeLanguage(detected);
      }
    });
  }
}

/** Translation for non-React modules (nav titles in helpers, etc.). */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options);
}
