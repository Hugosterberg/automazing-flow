type GmailFetchArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: {
    set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
  };
  stored: Record<string, unknown>;
  googleClientId?: string;
  googleClientSecret?: string;
};
function debugLog(runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[gmail]", { runId, hypothesisId, location, message, data });
  }
}

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessage = {
  id: string;
  threadId?: string;
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

type GmailSendReplyArgs = GmailFetchArgs & {
  messageId: string;
  replyText: string;
};

type GmailRefreshResult = {
  accessToken: string | null;
  oauthError?: string;
  oauthDescription?: string;
};

async function refreshGmailToken({
  refreshToken,
  googleClientId,
  googleClientSecret,
}: {
  refreshToken?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}): Promise<GmailRefreshResult> {
  if (!googleClientId || !googleClientSecret) {
    return { accessToken: null, oauthError: "missing_server_oauth_config" };
  }
  if (!refreshToken) {
    return { accessToken: null, oauthError: "missing_refresh_token" };
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const d = (await r.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (d.access_token) {
    return { accessToken: d.access_token };
  }
  return {
    accessToken: null,
    oauthError: d.error || "refresh_failed",
    oauthDescription: d.error_description,
  };
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sanitizeHeader(value: string): string {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function ensureReplySubject(subject: string): string {
  const clean = sanitizeHeader(subject || "(No subject)");
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

export function buildGmailReplyRaw({
  to,
  subject,
  message,
  messageId,
  references,
}: {
  to: string;
  subject: string;
  message: string;
  messageId?: string;
  references?: string;
}): string {
  const cleanTo = sanitizeHeader(to);
  if (!cleanTo) {
    throw new Error("gmail_reply_missing_recipient");
  }
  const cleanSubject = ensureReplySubject(subject);
  const cleanMessageId = sanitizeHeader(messageId || "");
  const cleanReferences = sanitizeHeader([references, cleanMessageId].filter(Boolean).join(" "));
  const headers = [
    `To: ${cleanTo}`,
    `Subject: ${cleanSubject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    cleanMessageId ? `In-Reply-To: ${cleanMessageId}` : "",
    cleanReferences ? `References: ${cleanReferences}` : "",
  ].filter(Boolean);
  return encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${message.trim()}\r\n`);
}

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

  async function fetchMessagesList(token: string) {
    const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=INBOX", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    debugLog("pre-fix", "H5", "gmail.ts:fetchMessagesList", "Gmail list response status", {
      status: listRes.status,
      ok: listRes.ok,
      accountId,
      hasRefreshToken: Boolean(refreshToken),
    });
    if (listRes.status === 401) {
      const body = (await listRes.json().catch(() => ({}))) as {
        error?: { message?: string; status?: string };
      };
      return {
        unauthorized: true as const,
        providerMessage: body?.error?.message ?? null,
        providerStatus: body?.error?.status ?? null,
      };
    }
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
  let refreshDiagnostic: GmailRefreshResult | null = null;

  if ("unauthorized" in listData && listData.unauthorized && refreshToken) {
    refreshDiagnostic = await refreshGmailToken({ refreshToken, googleClientId, googleClientSecret });
    if (refreshDiagnostic.accessToken) {
      token = refreshDiagnostic.accessToken;
      await tokenStore.set(accountId, { ...stored, accessToken: refreshDiagnostic.accessToken });
      listData = await fetchMessagesList(token);
    }
  }

  if ("error" in listData || ("unauthorized" in listData && listData.unauthorized)) {
    debugLog("pre-fix", "H5", "gmail.ts:fetchGmailAccountData", "Returning Gmail error to client", {
      unauthorized: "unauthorized" in listData ? Boolean(listData.unauthorized) : false,
      providerMessage: "providerMessage" in listData ? listData.providerMessage : null,
      providerStatus: "providerStatus" in listData ? listData.providerStatus : null,
      refreshOauthError: refreshDiagnostic?.oauthError ?? null,
    });
    if (!googleClientId || !googleClientSecret) {
      return {
        error:
          "Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET so tokens can be refreshed.",
        status: 503,
      };
    }
    if (!refreshToken && "unauthorized" in listData && listData.unauthorized) {
      return {
        error:
          "Gmail access expired and no refresh token is stored. Disconnect and reconnect Gmail (use consent that includes offline access).",
        status: 401,
      };
    }
    if (refreshDiagnostic?.oauthError === "invalid_grant") {
      const hint = refreshDiagnostic.oauthDescription ? ` (${refreshDiagnostic.oauthDescription})` : "";
      return {
        error: `Google revoked or expired this connection${hint}. Reconnect Gmail in Accounts.`,
        status: 401,
      };
    }
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
        signal: AbortSignal.timeout(15_000),
      })
        .then(async (r) => (r.ok ? r.json() : null))
        .catch((error) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[gmail] Failed to fetch message", { accountId, messageId: id, error });
          }
          return null;
        })
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
        threadId: msg.threadId,
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

export async function sendGmailReply({
  accessToken,
  refreshToken,
  accountId,
  tokenStore,
  stored,
  googleClientId,
  googleClientSecret,
  messageId,
  replyText,
}: GmailSendReplyArgs) {
  async function getOriginal(token: string) {
    const url =
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}` +
      "?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID&metadataHeaders=References";
    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
  }

  async function sendWithToken(token: string, original: GmailMessage) {
    const headers = original.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
    let raw: string;
    try {
      raw = buildGmailReplyRaw({
        to: getHeader("From"),
        subject: getHeader("Subject"),
        message: replyText,
        messageId: getHeader("Message-ID"),
        references: getHeader("References"),
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "gmail_reply_build_failed" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        raw,
        ...(original.threadId ? { threadId: original.threadId } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  }

  async function refreshStoredToken() {
    const refreshed = await refreshGmailToken({ refreshToken, googleClientId, googleClientSecret });
    if (!refreshed.accessToken) return null;
    await tokenStore.set(accountId, { ...stored, accessToken: refreshed.accessToken });
    return refreshed.accessToken;
  }

  let token = accessToken;
  let originalRes = await getOriginal(token);
  if (originalRes.status === 401) {
    const nextToken = await refreshStoredToken();
    if (!nextToken) return { ok: false, status: 401, error: "gmail_reconnect_required" };
    token = nextToken;
    originalRes = await getOriginal(token);
  }
  if (!originalRes.ok) {
    const body = await originalRes.json().catch(() => ({}));
    return { ok: false, status: originalRes.status, error: String(body?.error?.message || "gmail_message_load_failed") };
  }
  const original = (await originalRes.json().catch(() => ({}))) as GmailMessage;
  const sendRes = await sendWithToken(token, original);
  if (sendRes.status === 401) {
    const nextToken = await refreshStoredToken();
    if (!nextToken) return { ok: false, status: 401, error: "gmail_reconnect_required" };
    const retry = await sendWithToken(nextToken, original);
    if (retry.ok) return { ok: true, status: retry.status, data: await retry.json().catch(() => ({})) };
    return { ok: false, status: retry.status, error: await providerError(retry) };
  }
  if (!sendRes.ok) {
    return { ok: false, status: sendRes.status, error: await providerError(sendRes) };
  }
  return { ok: true, status: sendRes.status, data: await sendRes.json().catch(() => ({})) };
}

async function providerError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return String(body?.error?.message || body?.error || "provider_send_failed");
}
