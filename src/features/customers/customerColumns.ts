/** Pick the most useful column for list previews (email/name/company). */
export function guessPrimaryColumn(columns: string[]): string {
  const prefs = ["email", "e-post", "name", "namn", "customer", "kund", "company", "företag", "foretag"];
  for (const pref of prefs) {
    const found = columns.find((c) => c.toLowerCase().includes(pref));
    if (found) return found;
  }
  return columns[0] ?? "";
}

export function guessSecondaryColumn(columns: string[], primary: string): string {
  const prefs = ["name", "namn", "phone", "telefon", "company", "företag", "city", "stad", "address", "adress"];
  for (const pref of prefs) {
    const found = columns.find((c) => c !== primary && c.toLowerCase().includes(pref));
    if (found) return found;
  }
  return columns.find((c) => c !== primary) ?? "";
}
