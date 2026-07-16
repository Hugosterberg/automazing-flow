/**
 * Resolve quick-nav display labels from i18n (nav.* / navShort.*).
 * Catalog keys mostly match nav keys; sales → sales-marketing.
 */

type TFunc = (key: string, options?: Record<string, unknown>) => string;

function navKeyForQuickNav(key: string): string {
  if (key === "sales") return "sales-marketing";
  if (key === "drive-library") return "driveLibrary";
  return key;
}

export function quickNavLabel(key: string, t: TFunc): string {
  if (key === "drive-library") return t("quickNav.driveLibrary");
  return t(`nav.${navKeyForQuickNav(key)}`);
}

export function quickNavShortLabel(key: string, t: TFunc): string {
  return t(`navShort.${key}`);
}
