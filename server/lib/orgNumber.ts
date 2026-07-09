/** Normalize Swedish org number to digits only (10 or 12 digits). */
export function normalizeOrgNumber(raw: unknown): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits;
}

export function formatOrgNumberDisplay(digits: string): string {
  const n = normalizeOrgNumber(digits);
  if (n.length === 10) return `${n.slice(0, 6)}-${n.slice(6)}`;
  return n;
}

export function isValidOrgNumber(raw: unknown): boolean {
  const n = normalizeOrgNumber(raw);
  return n.length === 10 || n.length === 12;
}
