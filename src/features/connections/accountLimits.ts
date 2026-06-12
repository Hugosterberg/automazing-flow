import type { ConnectedAccount } from "@/types/accounts";

/**
 * Connection limit: at most ONE account per platform per business profile.
 *
 * Keeps the mental model simple ("the profile's Instagram", "the profile's
 * Gmail") and prevents the duplicate-account churn that made connection lists
 * flicker: historical OAuth flows generated a new account id per reconnect,
 * so the same mailbox/page could pile up several times.
 */

function dedupeKey(account: ConnectedAccount): string {
  return `${account.profileId}:${account.platform}`;
}

/**
 * Collapses duplicates so only the newest connected account per
 * (profile, platform) remains. Disconnected rows are dropped from
 * consideration but preserved in the output (history). Original order is
 * kept for the survivors.
 */
export function dedupeAccountsByProfilePlatform(accounts: ConnectedAccount[]): ConnectedAccount[] {
  const newestByKey = new Map<string, ConnectedAccount>();
  for (const account of accounts) {
    if (account.disconnectedAt) continue;
    const key = dedupeKey(account);
    const current = newestByKey.get(key);
    if (!current) {
      newestByKey.set(key, account);
      continue;
    }
    const currentTime = new Date(current.connectedAt).getTime() || 0;
    const candidateTime = new Date(account.connectedAt).getTime() || 0;
    if (candidateTime >= currentTime) {
      newestByKey.set(key, account);
    }
  }
  return accounts.filter(
    (account) => Boolean(account.disconnectedAt) || newestByKey.get(dedupeKey(account)) === account
  );
}

/**
 * Insert-or-replace under the one-per-platform rule: removes any existing
 * account on the same (profile, platform) — and the same id anywhere — before
 * appending the new account.
 */
export function applyAccountLimit(
  accounts: ConnectedAccount[],
  newAccount: ConnectedAccount
): ConnectedAccount[] {
  const next = accounts.filter((account) => {
    if (account.id === newAccount.id) return false;
    if (account.disconnectedAt) return true;
    return dedupeKey(account) !== dedupeKey(newAccount);
  });
  return [...next, newAccount];
}
