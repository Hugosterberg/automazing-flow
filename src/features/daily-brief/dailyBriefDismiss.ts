const STORAGE_KEY = "automazing-daily-brief-dismissed";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStore(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Item ids dismissed for the rest of today (local date). */
export function getDismissedBriefIds(): Set<string> {
  const store = readStore();
  const ids = store[todayKey()] ?? [];
  return new Set(ids);
}

export function dismissBriefItem(id: string) {
  const store = readStore();
  const day = todayKey();
  const ids = new Set(store[day] ?? []);
  ids.add(id);
  store[day] = Array.from(ids);
  writeStore(store);
}
