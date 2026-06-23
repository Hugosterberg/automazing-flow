export function scopedStorageKey(
  prefix: string,
  scopeId?: string | null,
  fallbackScope: string | null = "default"
): string {
  const normalizedScope = String(scopeId || "").trim();
  if (normalizedScope) return `${prefix}:${normalizedScope}`;
  return fallbackScope ? `${prefix}:${fallbackScope}` : prefix;
}
