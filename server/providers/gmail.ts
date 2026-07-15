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

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractGmailBody(payload?: GmailMessage["payload"]): string {
  if (!payload) return "";

  function readPart(part: { mimeType?: string; body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string } }> }): {
    plain: string;
    html: string;
  } {
    let plain = "";
    let html = "";
    const mime = String(part.mimeType || "").toLowerCase();
    const decoded = decodeBase64Url(part.body?.data);
    if (mime.startsWith("text/plain") && decoded.trim()) plain = decoded;
    if (mime.startsWith("text/html") && decoded.trim()) html = decoded;
    for (const nested of part.parts ?? []) {
      const child = readPart(nested);
      if (!plain && child.plain) plain = child.plain;
      if (!html && child.html) html = child.html;
    }
    return { plain, html };
  }

  const direct = decodeBase64Url(payload.body?.data);
  if (direct.trim()) return direct;

  let plain = "";
  let html = "";
  for (const part of payload.parts ?? []) {
    const chunk = readPart(part);
    if (!plain && chunk.plain) plain = chunk.plain;
    if (!html && chunk.html) html = chunk.html;
  }
  if (html.trim()) return html;
  if (plain.trim()) return plain;
  return "";
}

function getGmailHeader(headers: GmailHeader[] | undefined, name: string): string {
  return (headers || []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseGmailSender(from: string) {
  const match = from.match(/^(.+?)\s*<(.+)>$/);
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
  return { name: from, email: from };
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
  labelId = "INBOX",
}: GmailFetchArgs & { labelId?: string }) {
  async function fetchMessagesList(token: string) {
    const label = encodeURIComponent(labelId || "INBOX");
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&labelIds=${label}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
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

  const getHeader = getGmailHeader;
  const parseSender = parseGmailSender;

  const formatted = (messages as Array<GmailMessage | null>)
    .filter((msg): msg is GmailMessage => Boolean(msg))
    .map((msg) => {
      const headers = msg.payload?.headers ?? [];
      const dateRaw = getHeader(headers, "Date");
      const subject = getHeader(headers, "Subject");
      const body = extractGmailBody(msg.payload);
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: subject || "(No subject)",
        from: parseSender(getHeader(headers, "From")),
        date: dateRaw || (msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : ""),
        snippet: msg.snippet || "",
        body: body || msg.snippet || "",
        isUnread: (msg.labelIds || []).includes("UNREAD"),
        isStarred: (msg.labelIds || []).includes("STARRED"),
      };
    });

  return { messages: formatted };
}

export type GmailThreadMessage = {
  id: string;
  threadId?: string;
  subject: string;
  from: { name: string; email: string };
  date: string;
  snippet: string;
  body: string;
  isOutgoing: boolean;
};

export async function fetchGmailThread({
  accessToken,
  refreshToken,
  accountId,
  tokenStore,
  stored,
  googleClientId,
  googleClientSecret,
  threadId,
}: GmailFetchArgs & { threadId: string }) {
  async function fetchThread(token: string) {
    return fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }
    );
  }

  let token = accessToken;
  let threadRes = await fetchThread(token);
  if (threadRes.status === 401 && refreshToken) {
    const refreshed = await refreshGmailToken({ refreshToken, googleClientId, googleClientSecret });
    if (refreshed.accessToken) {
      token = refreshed.accessToken;
      await tokenStore.set(accountId, { ...stored, accessToken: refreshed.accessToken });
      threadRes = await fetchThread(token);
    }
  }

  if (!threadRes.ok) {
    if (threadRes.status === 401) {
      return { error: "Gmail token invalid. Reconnect the account.", status: 401 };
    }
    const body = await threadRes.json().catch(() => ({}));
    return {
      error: String((body as { error?: { message?: string } })?.error?.message || "gmail_thread_failed"),
      status: threadRes.status,
    };
  }

  const threadData = (await threadRes.json().catch(() => ({}))) as {
    id?: string;
    messages?: GmailMessage[];
  };
  const rawMessages = Array.isArray(threadData.messages) ? threadData.messages : [];

  const messages: GmailThreadMessage[] = rawMessages
    .map((msg) => {
      const headers = msg.payload?.headers ?? [];
      const dateRaw = getGmailHeader(headers, "Date");
      const subject = getGmailHeader(headers, "Subject");
      const body = extractGmailBody(msg.payload);
      const labelIds = msg.labelIds || [];
      return {
        id: msg.id,
        threadId: msg.threadId || threadData.id,
        subject: subject || "(No subject)",
        from: parseGmailSender(getGmailHeader(headers, "From")),
        date: dateRaw || (msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : ""),
        snippet: msg.snippet || "",
        body: body || msg.snippet || "",
        isOutgoing: labelIds.includes("SENT"),
        _sort: Number(msg.internalDate || 0),
      };
    })
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...rest }) => rest);

  return { messages, threadId: threadData.id || threadId };
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

export type GmailLabel = {
  id: string;
  name: string;
  type: string;
  messagesTotal?: number;
  messagesUnread?: number;
};

async function withGmailToken<T>(
  args: GmailFetchArgs,
  run: (token: string) => Promise<Response>
): Promise<{ ok: true; token: string; res: Response } | { ok: false; status: number; error: string }> {
  let token = args.accessToken;
  let res = await run(token);
  if (res.status === 401 && args.refreshToken) {
    const refreshed = await refreshGmailToken({
      refreshToken: args.refreshToken,
      googleClientId: args.googleClientId,
      googleClientSecret: args.googleClientSecret,
    });
    if (refreshed.accessToken) {
      token = refreshed.accessToken;
      await args.tokenStore.set(args.accountId, { ...args.stored, accessToken: refreshed.accessToken });
      res = await run(token);
    } else {
      return { ok: false as const, status: 401, error: "gmail_reconnect_required" };
    }
  }
  if (!res.ok) {
    return { ok: false as const, status: res.status, error: await providerError(res) };
  }
  return { ok: true as const, token, res };
}

export async function listGmailUserLabels(args: GmailFetchArgs) {
  const result = await withGmailToken(args, (token) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { error: result.error, status: result.status };
  const data = (await result.res.json().catch(() => ({}))) as {
    labels?: Array<{ id?: string; name?: string; type?: string; messagesTotal?: number; messagesUnread?: number }>;
  };
  const folders: GmailLabel[] = (data.labels || [])
    .filter((label) => String(label.type || "").toLowerCase() === "user")
    .map((label) => ({
      id: String(label.id || ""),
      name: String(label.name || ""),
      type: String(label.type || "user"),
      messagesTotal: typeof label.messagesTotal === "number" ? label.messagesTotal : undefined,
      messagesUnread: typeof label.messagesUnread === "number" ? label.messagesUnread : undefined,
    }))
    .filter((label) => label.id && label.name)
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  return { folders };
}

export async function createGmailUserLabel(args: GmailFetchArgs & { name: string }) {
  const cleanName = String(args.name || "").trim();
  if (!cleanName) return { ok: false as const, status: 400, error: "folder_name_required" };
  const result = await withGmailToken(args, (token) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: cleanName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  const data = (await result.res.json().catch(() => ({}))) as { id?: string; name?: string; type?: string };
  return {
    ok: true as const,
    folder: {
      id: String(data.id || ""),
      name: String(data.name || cleanName),
      type: String(data.type || "user"),
    },
  };
}

export async function moveGmailMessageToLabel(
  args: GmailFetchArgs & { messageId: string; labelId: string; removeFromInbox?: boolean }
) {
  const messageId = String(args.messageId || "").trim();
  const labelId = String(args.labelId || "").trim();
  if (!messageId || !labelId) return { ok: false as const, status: 400, error: "message_and_folder_required" };
  const removeFromInbox = args.removeFromInbox !== false;
  const result = await withGmailToken(args, (token) =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        addLabelIds: [labelId],
        ...(removeFromInbox ? { removeLabelIds: ["INBOX"] } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const };
}

export async function deleteGmailMessage(args: GmailFetchArgs & { messageId: string }) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) return { ok: false as const, status: 400, error: "message_id_required" };
  const result = await withGmailToken(args, (token) =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/trash`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const };
}

export async function archiveGmailMessage(args: GmailFetchArgs & { messageId: string }) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) return { ok: false as const, status: 400, error: "message_id_required" };
  const result = await withGmailToken(args, (token) =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const };
}

export async function setGmailMessageStarred(
  args: GmailFetchArgs & { messageId: string; starred: boolean }
) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) return { ok: false as const, status: 400, error: "message_id_required" };
  const result = await withGmailToken(args, (token) =>
    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        args.starred ? { addLabelIds: ["STARRED"] } : { removeLabelIds: ["STARRED"] }
      ),
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const };
}
