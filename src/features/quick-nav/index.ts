export {
  QUICK_NAV_CATALOG,
  QUICK_NAV_BY_KEY,
  QUICK_NAV_PRIMARY_LIMIT,
  QUICK_NAV_HOME_JUMP_LIMIT,
  MAX_PRIMARY_SHORTCUTS,
  MAX_HOME_JUMPS,
  catalogForMode,
  defaultPrimaryKeys,
  defaultHomeJumpKeys,
  pathConflictKey,
  type QuickNavDestination,
  type QuickNavDestinationKey,
  type QuickNavBadgeKey,
} from "./quickNavCatalog";
export {
  QUICK_NAV_PREFS_DOC_KEY,
  buildQuickNavPrefs,
  resolvePrimaryKeys,
  resolveHomeJumpKeys,
  moreDestinationKeys,
  type QuickNavPrefs,
} from "./quickNavPrefs";
export { useQuickNavPrefs } from "./useQuickNavPrefs";
export { QuickNavPrefsEditor } from "./QuickNavPrefsEditor";
export { quickNavLabel, quickNavShortLabel } from "./quickNavLabels";
