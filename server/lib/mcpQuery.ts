/**
 * Shared MCP tool query helper — list tools, pick by pattern, call with
 * schema-aware argument shaping.
 */

import {
  listToolsForStored,
  callToolForStored,
  pickTool,
  type StoredMcpAccount,
} from "./mcpAccess.ts";
import type { McpToolDescriptor } from "./mcpClient.ts";

interface TokenStoreLike {
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<Record<string, unknown> | null>;
  entries: () => Promise<Array<[string, Record<string, unknown>]>>;
}

export function argNameForTool(tool: McpToolDescriptor, candidates: string[]): string | null {
  const properties =
    tool.inputSchema && typeof tool.inputSchema === "object"
      ? ((tool.inputSchema as Record<string, unknown>).properties as Record<string, unknown> | undefined)
      : undefined;
  const names = properties ? Object.keys(properties) : [];
  for (const candidate of candidates) {
    const hit = names.find((n) => n.toLowerCase() === candidate);
    if (hit) return hit;
  }
  const required = (tool.inputSchema as Record<string, unknown> | undefined)?.required;
  if (Array.isArray(required) && typeof required[0] === "string") return required[0];
  return names[0] ?? null;
}

export function trimMcpText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function runMcpQuery(options: {
  tokenStore: TokenStoreLike;
  account: StoredMcpAccount;
  toolPatterns: RegExp[];
  argCandidates: string[];
  query: string;
  maxChars?: number;
}): Promise<
  | { ok: true; tool: string; text: string; provider: string }
  | { ok: false; status: number; error: string }
> {
  const toolsRes = await listToolsForStored(options.tokenStore, options.account);
  if (toolsRes.ok === false) {
    return { ok: false, status: 502, error: toolsRes.message };
  }
  const tool = pickTool(toolsRes.tools, options.toolPatterns);
  if (!tool) {
    return { ok: false, status: 502, error: "The connected provider exposes no matching tool." };
  }
  const argName = argNameForTool(tool, options.argCandidates);
  const callRes = await callToolForStored(
    options.tokenStore,
    options.account,
    tool.name,
    argName ? { [argName]: options.query } : {}
  );
  if (callRes.ok === false) {
    return { ok: false, status: 502, error: callRes.message };
  }
  if (callRes.isError) {
    return {
      ok: false,
      status: 502,
      error: trimMcpText(callRes.text, 500) || "Provider returned an error.",
    };
  }
  return {
    ok: true,
    provider: String(options.account.platform || ""),
    tool: tool.name,
    text: trimMcpText(callRes.text, options.maxChars ?? 20_000),
  };
}
