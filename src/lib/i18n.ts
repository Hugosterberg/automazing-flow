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
import svCatalog from "@/locales/sv/catalog.json";
import enCatalog from "@/locales/en/catalog.json";
import svErrors from "@/locales/sv/errors.json";
import enErrors from "@/locales/en/errors.json";
import svMessages from "@/locales/sv/messages.json";
import enMessages from "@/locales/en/messages.json";
import svConnections from "@/locales/sv/connections.json";
import enConnections from "@/locales/en/connections.json";
import svTasks from "@/locales/sv/tasks.json";
import enTasks from "@/locales/en/tasks.json";
import svReviews from "@/locales/sv/reviews.json";
import enReviews from "@/locales/en/reviews.json";
import svAutomations from "@/locales/sv/automations.json";
import enAutomations from "@/locales/en/automations.json";
import svMcp from "@/locales/sv/mcp.json";
import enMcp from "@/locales/en/mcp.json";
import svShortcuts from "@/locales/sv/shortcuts.json";
import enShortcuts from "@/locales/en/shortcuts.json";
import svPages from "@/locales/sv/pages.json";
import enPages from "@/locales/en/pages.json";
import svDailyBrief from "@/locales/sv/dailyBrief.json";
import enDailyBrief from "@/locales/en/dailyBrief.json";
import svLeads from "@/locales/sv/leads.json";
import enLeads from "@/locales/en/leads.json";
import svOutreach from "@/locales/sv/outreach.json";
import enOutreach from "@/locales/en/outreach.json";
import svDigitalBrand from "@/locales/sv/digitalBrand.json";
import enDigitalBrand from "@/locales/en/digitalBrand.json";
import svSocial from "@/locales/sv/social.json";
import enSocial from "@/locales/en/social.json";
import svMarketing from "@/locales/sv/marketing.json";
import enMarketing from "@/locales/en/marketing.json";
import svEcommerce from "@/locales/sv/ecommerce.json";
import enEcommerce from "@/locales/en/ecommerce.json";
import svInsights from "@/locales/sv/insights.json";
import enInsights from "@/locales/en/insights.json";

export const i18n = i18next;

const NAMESPACES = [
  "common",
  "landing",
  "home",
  "preferences",
  "catalog",
  "errors",
  "messages",
  "connections",
  "tasks",
  "reviews",
  "automations",
  "mcp",
  "shortcuts",
  "pages",
  "dailyBrief",
  "leads",
  "outreach",
  "digitalBrand",
  "social",
  "marketing",
  "ecommerce",
  "insights",
] as const;

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
        catalog: svCatalog,
        errors: svErrors,
        messages: svMessages,
        connections: svConnections,
        tasks: svTasks,
        reviews: svReviews,
        automations: svAutomations,
        mcp: svMcp,
        shortcuts: svShortcuts,
        pages: svPages,
        dailyBrief: svDailyBrief,
        leads: svLeads,
        outreach: svOutreach,
        digitalBrand: svDigitalBrand,
        social: svSocial,
        marketing: svMarketing,
        ecommerce: svEcommerce,
        insights: svInsights,
      },
      en: {
        common: enCommon,
        landing: enLanding,
        home: enHome,
        preferences: enPreferences,
        catalog: enCatalog,
        errors: enErrors,
        messages: enMessages,
        connections: enConnections,
        tasks: enTasks,
        reviews: enReviews,
        automations: enAutomations,
        mcp: enMcp,
        shortcuts: enShortcuts,
        pages: enPages,
        dailyBrief: enDailyBrief,
        leads: enLeads,
        outreach: enOutreach,
        digitalBrand: enDigitalBrand,
        social: enSocial,
        marketing: enMarketing,
        ecommerce: enEcommerce,
        insights: enInsights,
      },
    },
    lng: initialLanguage,
    fallbackLng: "en",
    defaultNS: "common",
    ns: [...NAMESPACES],
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
