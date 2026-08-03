import type { Connection } from "@/types/connection";
import type { AccountPlatform } from "@/types/accounts";

/**
 * A connection counts as "verified" for onboarding when it is present and healthy.
 * Used by First-win / priority wizard so OAuth-without-probe is not "done".
 */
export function isConnectionVerified(connection: Connection): boolean {
  return connection.health === "healthy" && !connection.disconnectedAt;
}

/** Platforms with at least one healthy active connection. */
export function healthyPlatformSet(connections: Iterable<Connection>): Set<string> {
  const set = new Set<string>();
  for (const c of connections) {
    if (isConnectionVerified(c)) set.add(String(c.platform).toLowerCase());
  }
  return set;
}

export function hasHealthyPlatform(
  connections: Iterable<Connection>,
  platforms: AccountPlatform | AccountPlatform[]
): boolean {
  const healthy = healthyPlatformSet(connections);
  const list = Array.isArray(platforms) ? platforms : [platforms];
  return list.some((p) => healthy.has(String(p).toLowerCase()));
}

/**
 * Whether a connect session should treat the latest resync as success.
 * Explicit non-probeable paths (e.g. keyless MCP already saved) pass when
 * health is healthy OR the result says ok with healthy/unknown kept healthy.
 */
export function isResyncSuccess(result: {
  health?: string;
  ok?: boolean;
}): boolean {
  const health = String(result.health || "").toLowerCase();
  return health === "healthy";
}
