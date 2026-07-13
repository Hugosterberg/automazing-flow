const STORAGE_KEY = "automazing-daily-brief-dismissed";

/**
 * Per-day brief item state in localStorage. Two ways an item leaves the list:
 * - done: the user handled it — counts toward today's progress ("3 of 5").
 * - snoozed: hidden until tomorrow without counting as handled.
 * Older builds stored a plain id array per day; those ids read back as snoozed.
 */
export interface BriefDayState {
  done: string[];
  snoozed: string[];
}

type Store = Record<string, BriefDayState | string[]>;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function normaliseDay(entry: BriefDayState | string[] | undefined): BriefDayState {
  if (Array.isArray(entry)) return { done: [], snoozed: entry };
  if (entry && typeof entry === "object") {
    return {
      done: Array.isArray(entry.done) ? entry.done : [],
      snoozed: Array.isArray(entry.snoozed) ? entry.snoozed : [],
    };
  }
  return { done: [], snoozed: [] };
}

/** Today's done/snoozed item ids (local date). */
export function getBriefDayState(): BriefDayState {
  return normaliseDay(readStore()[todayKey()]);
}

function addToDay(id: string, bucket: keyof BriefDayState) {
  const store = readStore();
  const day = todayKey();
  const state = normaliseDay(store[day]);
  const ids = new Set(state[bucket]);
  ids.add(id);
  store[day] = { ...state, [bucket]: Array.from(ids) };
  writeStore(store);
}

/** Mark an item handled for today — hides it and counts toward progress. */
export function markBriefItemDone(id: string) {
  addToDay(id, "done");
}

/** Hide an item until tomorrow without counting it as handled. */
export function snoozeBriefItem(id: string) {
  addToDay(id, "snoozed");
}
