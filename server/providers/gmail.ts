type GmailFetchArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: {
    set: (accountId: string, value: Record<string, unknown>) => unknown;
  };
  stored: Record<string, unknown>;
  googleClientId?: string;
  googleClientSecret?: string;
};
const DEBUG_INGEST_URL = "http://127.0.0.1:7917/ingest/7239d227-c463-4b17-b647-b3b429e5fe5c";

function debugLog(runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  // #region agent log
  fetch(DEBUG_INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9f37ed" },
    body: JSON.stringify({
      sessionId: "9f37ed",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessage = {
  id: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
    body?: { data?: string };
    parts?: Array<{
      mimeType?: string;
      body?: { data?: string };
      parts?: Array<{
        mimeType?: string;
        body?: { data?: string };
      }>;
    }>;
  };
};

export async function fetchGmailAccountData({
  accessToken,
  refreshToken,
  accountId,
  tokenStore,
  stored,
  googleClientId,
  googleClientSecret,
}: GmailFetchArgs) {
  function decodeBase64Url(value: string | undefined): string {
    if (!value) return "";
    try {
      const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      return Buffer.from(padded, "base64").toString("utf8");
    } catch {
      return "";
    }
  }

  function extractBody(payload?: GmailMessage["payload"]): string {
    if (!payload) return "";
    const direct = decodeBase64Url(payload.body?.data);
    if (direct.trim()) return direct;

    const parts = payload.parts ?? [];
    for (const part of parts) {
      if (part.mimeType?.startsWith("text/plain")) {
        const txt = decodeBase64Url(part.body?.data);
        if (txt.trim()) return txt;
      }
      if (part.parts?.length) {
        for (const nested of part.parts) {
          if (nested.mimeType?.startsWith("text/plain")) {
            const txt = decodeBase64Url(nested.body?.data);
            if (txt.trim()) return txt;
          }
        }
      }
    }
    return "";
  }

  async function refreshGmailToken(rt: string) {
    if (!googleClientId || !googleClientSecret || !rt) return null;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: rt,
        grant_type: "refresh_token",
      }).toString(),
    });
    const d = (await r.json()) as { access_token?: string };
    return d.access_token ?? null;
  }

  async function fetchMessagesList(token: string) {
    const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX", {
      headers: { Authorization: `Bearer ${token}` },
    });
    debugLog("pre-fix", "H5", "gmail.ts:fetchMessagesList", "Gmail list response status", {
      status: listRes.status,
      ok: listRes.ok,
      accountId,
      hasRefreshToken: Boolean(refreshToken),
    });
    if (listRes.status === 401) return { unauthorized: true as const };
    if (!listRes.ok) {
      const body = (await listRes.json().catch(() => ({}))) as {
        error?: { message?: string; status?: string };
      };
      debugLog("pre-fix", "H5", "gmail.ts:fetchMessagesList", "Gmail provider error body", {
        status: listRes.status,
        providerStatus: body?.error?.status ?? null,
        providerMessage: body?.error?.message ?? null,
      });
      return {
        error: listRes.status,
        providerMessage: body?.error?.message ?? null,
        providerStatus: body?.error?.status ?? null,
      };
    }
    return listRes.json();
  }

  let token = accessToken;
  let listData = await fetchMessagesList(token);

  if ("unauthorized" in listData && listData.unauthorized && refreshToken) {
    const newToken = await refreshGmailToken(refreshToken);
    if (newToken) {
      token = newToken;
      tokenStore.set(accountId, { ...stored, accessToken: newToken });
      listData = await fetchMessagesList(token);
    }
  }

  if ("error" in listData || ("unauthorized" in listData && listData.unauthorized)) {
    debugLog("pre-fix", "H5", "gmail.ts:fetchGmailAccountData", "Returning Gmail error to client", {
      unauthorized: "unauthorized" in listData ? Boolean(listData.unauthorized) : false,
      providerMessage: "providerMessage" in listData ? listData.providerMessage : null,
      providerStatus: "providerStatus" in listData ? listData.providerStatus : null,
    });
    if ("providerMessage" in listData) {
      const providerMessage = String(listData.providerMessage || "").toLowerCase();
      if (providerMessage.includes("mail service not enabled")) {
        return {
          error:
            "Gmail is not enabled for this Google account. Activate Gmail on the account (mail.google.com) and reconnect.",
          status: 400,
        };
      }
      if (providerMessage.includes("access not configured")) {
        return {
          error:
            "Gmail API is not enabled in Google Cloud for this OAuth app. Enable Gmail API for the project and reconnect.",
          status: 400,
        };
      }
    }
    return { error: "Gmail token invalid. Reconnect the account.", status: 401 };
  }

  const messageIds = (((listData as { messages?: Array<{ id: string }> }).messages || []) as Array<{ id: string }>).map(
    (m) => m.id
  );
  const messages = await Promise.all(
    messageIds.map((id) =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .catch(() => null)
    )
  );

  const getHeader = (headers: GmailHeader[] | undefined, name: string) =>
    (headers || []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  const parseSender = (from: string) => {
    const match = from.match(/^(.+?)\s*<(.+)>$/);
    if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
    return { name: from, email: from };
  };

  const formatted = (messages as Array<GmailMessage | null>)
    .filter((msg): msg is GmailMessage => Boolean(msg))
    .map((msg) => {
      const headers = msg.payload?.headers ?? [];
      const dateRaw = getHeader(headers, "Date");
      const subject = getHeader(headers, "Subject");
      const body = extractBody(msg.payload);
      return {
        id: msg.id,
        subject: subject || "(No subject)",
        from: parseSender(getHeader(headers, "From")),
        date: dateRaw || (msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : ""),
        snippet: msg.snippet || "",
        body: body || msg.snippet || "",
        isUnread: (msg.labelIds || []).includes("UNREAD"),
      };
    });

  return { messages: formatted };
}
