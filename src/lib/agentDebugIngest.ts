/** Local Cursor/agent debug ingest — dev only; production must not call 127.0.0.1. */
const AGENT_DEBUG_INGEST =
  "http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c";

export function postAgentDebugIngest(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  const sessionId = String(payload.sessionId ?? "debug");
  fetch(AGENT_DEBUG_INGEST, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": sessionId,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export function sendAgentDebugBeacon(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(AGENT_DEBUG_INGEST, blob);
  } catch {
    // ignore
  }
}
