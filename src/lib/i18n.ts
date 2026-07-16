/**
 * i18next setup — the app's single translation entry point.
 *
 * Language policy: src/lib/appLanguage.ts (user → geo → en; Swedish only for SE).
 * Namespaces live under src/locales/<lang>/<namespace>.json.
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
import svLanding from "@/locales/sv/landing.json";
import enLanding from "@/locales/en/landing.json";
import svHome from "@/locales/sv/home.json";
import enHome from "@/locales/en/home.json";
import svPreferences from "@/locales/sv/preferences.json";
import enPreferences from "@/locales/en/preferences.json";

export const i18n = i18next;

function applyLanguageSideEffects(lang: string): void {
  const locale = localeForLanguage(lang);
  setFormatLocale(locale);
  setRelativeTimeLocale(locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "sv" ? "sv" : "en";
  }
}

export function initI18n(): void {
  if (i18next.isInitialized) return;

  const initialLanguage = resolveInitialLanguage();

  void i18next.use(initReactI18next).init({
    resources: {
      sv: {
        common: svCommon,
        landing: svLanding,
        home: svHome,
        preferences: svPreferences,
      },
      en: {
        common: enCommon,
        landing: enLanding,
        home: enHome,
        preferences: enPreferences,
      },
    },
    lng: initialLanguage,
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "landing", "home", "preferences"],
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

  applyLanguageSideEffects(initialLanguage);
  i18next.on("languageChanged", applyLanguageSideEffects);

  if (needsGeoDetection()) {
    void detectGeoLanguage().then((detected) => {
      if (detected && getUserLanguage() === null && detected !== i18next.language) {
        void i18next.changeLanguage(detected);
      }
    });
  }
}

/** Translation for non-React modules. Supports `ns:key` or defaultNS keys. */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options);
}
