/**
 * Shared market pulse fetch — used by the intelligence HTTP route and the
 * nightly market-pulse-snapshot cron (no user session on cron path).
 */

import { MCP_FEATURE_PLATFORMS } from "./mcpCatalog.ts";
import { argNameForTool, runMcpQuery, trimMcpText } from "./mcpQuery.ts";
import { assessMcpAccount, findReadyMcpAccount } from "./mcpReadiness.ts";
import { findMcpAccountForProfile, listToolsForStored, callToolForStored, pickTool } from "./mcpAccess.ts";

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

export const MARKET_PULSE_TOOL_PATTERNS = [/^topic$/i, /topic/i, /^coin/i, /sentiment/i, /search/i];
export const MARKET_PULSE_ARG_CANDIDATES = ["topic", "symbol", "coin", "query", "q"];
export const DEFAULT_MARKET_PULSE_TOPIC = "bitcoin";

export type MarketPulsePayload =
  | {
      available: true;
      topic: string;
      tool: string;
      text: string;
      provider?: string;
      fetchedAt: string;
      source?: "live" | "snapshot";
    }
  | {
      available: false;
      reason: string;
      message?: string;
    };

export async function fetchMarketPulseLive(options: {
  tokenStore: TokenStoreLike;
  businessProfileId: string | null;
  topic?: string;
}): Promise<MarketPulsePayload> {
  const topic =
    String(options.topic || DEFAULT_MARKET_PULSE_TOPIC)
      .trim()
      .toLowerCase() || DEFAULT_MARKET_PULSE_TOPIC;

  const ready = await findReadyMcpAccount({
    tokenStore: options.tokenStore,
    businessProfileId: options.businessProfileId,
    platforms: [...MCP_FEATURE_PLATFORMS.marketPulse],
  });

  if (ready.ok === false) {
    const account = await findMcpAccountForProfile({
      tokenStore: options.tokenStore,
      businessProfileId: options.businessProfileId,
      platforms: [...MCP_FEATURE_PLATFORMS.marketPulse],
    });
    if (account) {
      const assessed = await assessMcpAccount(options.tokenStore, account);
      if (assessed.status === "missing_credential" || assessed.status === "auth_expired") {
        return {
          available: false,
          reason: assessed.status,
          message: assessed.message,
        };
      }
    }
    return {
      available: false,
      reason: "not_connected",
      message: ready.error,
    };
  }

  const result = await runMcpQuery({
    tokenStore: options.tokenStore,
    account: ready.account,
    toolPatterns: MARKET_PULSE_TOOL_PATTERNS,
    argCandidates: MARKET_PULSE_ARG_CANDIDATES,
    query: topic,
    maxChars: 4_000,
  });

  if (result.ok === false) {
    return {
      available: false,
      reason: "provider_error",
      message: result.error,
    };
  }

  return {
    available: true,
    topic,
    tool: result.tool,
    text: result.text,
    provider: result.provider,
    fetchedAt: new Date().toISOString(),
    source: "live",
  };
}

/** Cron-safe fetch without membership checks — caller must verify profile scope. */
export async function fetchMarketPulseForCron(options: {
  tokenStore: TokenStoreLike;
  businessProfileId: string;
  topic?: string;
}): Promise<
  | { ok: true; topic: string; tool: string; text: string; provider: string }
  | { ok: false; reason: string }
> {
  const live = await fetchMarketPulseLive({
    tokenStore: options.tokenStore,
    businessProfileId: options.businessProfileId,
    topic: options.topic,
  });
  if (live.available === false) {
    return { ok: false, reason: live.reason };
  }
  return {
    ok: true,
    topic: live.topic,
    tool: live.tool,
    text: live.text,
    provider: live.provider || "lunarcrush",
  };
}

/** Legacy inline helpers kept for any direct tool calls in intelligenceRoutes. */
export { argNameForTool, trimMcpText };
