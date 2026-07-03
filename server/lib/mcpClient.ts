/**
 * Minimal MCP (Model Context Protocol) client over Streamable HTTP.
 *
 * automazing consumes remote MCP servers (Day.ai CRM, Exa search, …) as data
 * providers. This module owns the protocol plumbing — JSON-RPC 2.0 envelopes,
 * the initialize handshake, SSE-or-JSON response parsing, session headers —
 * so provider modules stay one-line wrappers with their own endpoint + auth.
 *
 * Deliberately not a full SDK: we only need request/response tool calls
 * (initialize, tools/list, tools/call). Server-initiated streams, resources,
 * and prompts are out of scope until a provider needs them.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

/** Protocol versions we try, newest first. Servers negotiate downward. */
const PROTOCOL_VERSIONS = ["2025-03-26", "2024-11-05"];

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export type McpResult<T> =
  | ({ ok: true } & T)
  | { ok: false; status: number; message: string };

export interface McpServerHandle {
  endpoint: string;
  headers: Record<string, string>;
  sessionId: string | null;
  serverName: string | null;
  protocolVersion: string;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string };
  id?: unknown;
}

/**
 * Parse a Streamable HTTP response body. Servers may answer a POST with
 * plain JSON or with a short SSE stream whose `data:` lines carry the
 * JSON-RPC messages; we accept both and return the response matching `id`
 * (or the first message with a result/error).
 */
function parseRpcBody(contentType: string, body: string, id: number): JsonRpcResponse | null {
  if (contentType.includes("text/event-stream")) {
    for (const rawLine of body.split(/\r?\n/)) {
      if (!rawLine.startsWith("data:")) continue;
      const data = rawLine.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as JsonRpcResponse;
        if (parsed && (parsed.id === id || parsed.result !== undefined || parsed.error !== undefined)) {
          return parsed;
        }
      } catch {
        // Ignore non-JSON keepalive lines.
      }
    }
    return null;
  }
  try {
    return JSON.parse(body) as JsonRpcResponse;
  } catch {
    return null;
  }
}

let rpcCounter = 1;

async function rpcRequest(
  handle: Pick<McpServerHandle, "endpoint" | "headers" | "sessionId">,
  method: string,
  params: Record<string, unknown> | undefined,
  options?: { notification?: boolean; timeoutMs?: number }
): Promise<McpResult<{ result: unknown; sessionId: string | null }>> {
  const id = rpcCounter++;
  const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (params !== undefined) payload.params = params;
  if (!options?.notification) payload.id = id;

  let response: Response;
  try {
    response = await fetch(handle.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(handle.sessionId ? { "Mcp-Session-Id": handle.sessionId } : {}),
        ...handle.headers,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "MCP request failed before a response.",
    };
  }

  const sessionId = response.headers.get("mcp-session-id") || handle.sessionId || null;

  // Notifications expect no body; 202/204 is success.
  if (options?.notification) {
    if (response.ok) return { ok: true, result: null, sessionId };
    return { ok: false, status: response.status, message: `MCP notification rejected (${response.status}).` };
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    const parsed = parseRpcBody(response.headers.get("content-type") || "", body, id);
    const detail = parsed?.error?.message || body.slice(0, 300) || response.statusText;
    return { ok: false, status: response.status, message: `MCP ${method} failed: ${detail}` };
  }

  const parsed = parseRpcBody(response.headers.get("content-type") || "", body, id);
  if (!parsed) {
    return { ok: false, status: 502, message: `MCP ${method} returned an unreadable response.` };
  }
  if (parsed.error) {
    return { ok: false, status: 502, message: parsed.error.message || `MCP ${method} returned an error.` };
  }
  return { ok: true, result: parsed.result ?? null, sessionId };
}

/**
 * Run the initialize handshake. Tries protocol versions newest-first so a
 * server pinned to an older spec (Day.ai reports 2024-11-05) still connects.
 */
export async function connectMcp(options: {
  endpoint: string;
  headers: Record<string, string>;
}): Promise<McpResult<{ handle: McpServerHandle }>> {
  let lastError: { status: number; message: string } = {
    status: 502,
    message: "MCP initialize failed.",
  };

  for (const protocolVersion of PROTOCOL_VERSIONS) {
    const init = await rpcRequest(
      { endpoint: options.endpoint, headers: options.headers, sessionId: null },
      "initialize",
      {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "automazing", version: "1.0.0" },
      }
    );
    if (init.ok === false) {
      lastError = { status: init.status, message: init.message };
      continue;
    }

    const result = (init.result ?? {}) as Record<string, unknown>;
    const serverInfo = (result.serverInfo ?? {}) as Record<string, unknown>;
    const handle: McpServerHandle = {
      endpoint: options.endpoint,
      headers: options.headers,
      sessionId: init.sessionId,
      serverName: serverInfo.name ? String(serverInfo.name) : null,
      protocolVersion: result.protocolVersion ? String(result.protocolVersion) : protocolVersion,
    };

    // Spec: the client confirms with an initialized notification. Best-effort —
    // some servers don't require it for stateless tool calls.
    await rpcRequest(handle, "notifications/initialized", undefined, { notification: true }).catch(() => null);

    return { ok: true, handle };
  }

  return { ok: false, ...lastError };
}

export async function listMcpTools(
  handle: McpServerHandle
): Promise<McpResult<{ tools: McpToolDescriptor[] }>> {
  const res = await rpcRequest(handle, "tools/list", {});
  if (res.ok === false) {
    return { ok: false, status: res.status, message: res.message };
  }
  const result = (res.result ?? {}) as Record<string, unknown>;
  const rawTools = Array.isArray(result.tools) ? result.tools : [];
  const tools: McpToolDescriptor[] = rawTools.map((t) => {
    const tool = (t ?? {}) as Record<string, unknown>;
    return {
      name: String(tool.name || ""),
      description: tool.description ? String(tool.description) : undefined,
      inputSchema:
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? (tool.inputSchema as Record<string, unknown>)
          : undefined,
    };
  });
  return { ok: true, tools: tools.filter((t) => t.name) };
}

export interface McpToolCallOutput {
  /** Concatenated text blocks from the tool result. */
  text: string;
  /** Raw content blocks for callers that need structure. */
  content: unknown[];
  isError: boolean;
}

export async function callMcpTool(
  handle: McpServerHandle,
  name: string,
  args: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<McpResult<McpToolCallOutput>> {
  const res = await rpcRequest(handle, "tools/call", { name, arguments: args }, options);
  if (res.ok === false) {
    return { ok: false, status: res.status, message: res.message };
  }
  const result = (res.result ?? {}) as Record<string, unknown>;
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((block) => {
      const b = (block ?? {}) as Record<string, unknown>;
      return b.type === "text" && typeof b.text === "string" ? b.text : "";
    })
    .filter(Boolean)
    .join("\n");
  return { ok: true, text, content, isError: Boolean(result.isError) };
}
