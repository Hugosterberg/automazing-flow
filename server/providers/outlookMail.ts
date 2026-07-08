import crypto from "node:crypto";

type OutlookMailFetchArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: {
    set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
  };
  stored: Record<string, unknown>;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
};

type OutlookReplyArgs = OutlookMailFetchArgs & {
  messageId: string;
  replyText: string;
};

type GraphMessage = {
  id?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  body?: {
    contentType?: string;
    content?: string;
  };
};

export type OutlookThreadMessage = {
  id: string;
  conversationId?: string;
  subject: string;
  from: { name: string; email: string };
  date: string;
  snippet: string;
  body: string;
  isOutgoing: boolean;
};

function stripHtmlBody(content: string | undefined): string {
  return typeof content === "string"
    ? content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function formatOutlookGraphMessage(m: GraphMessage, mailboxEmail: string): OutlookThreadMessage {
  const addr = m.from?.emailAddress;
  const name = String(addr?.name || addr?.address || "Unknown");
  const email = String(addr?.address || "");
  const bodyText = stripHtmlBody(m.body?.content);
  const mailbox = mailboxEmail.trim().toLowerCase();
  return {
    id: String(m.id || crypto.randomUUID()),
    conversationId: m.conversationId ? String(m.conversationId) : undefined,
    subject: String(m.subject || "(No subject)"),
    from: { name, email },
    date: String(m.receivedDateTime || ""),
    snippet: String(m.bodyPreview || ""),
    body: bodyText || String(m.bodyPreview || ""),
    isOutgoing: Boolean(mailbox && email.toLowerCase() === mailbox),
  };
}

export async function refreshMicrosoftToken({
  refreshToken,
  microsoftClientId,
  microsoftClientSecret,
}: {
  refreshToken?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
}) {
  if (!refreshToken || !microsoftClientId || !microsoftClientSecret) return null;
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: microsoftClientId,
      client_secret: microsoftClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.access_token) return null;
  // Microsoft rotates refresh tokens — the new one must be persisted or the
  // sliding 90-day window never renews and the connection eventually dies.
  return {
    accessToken: String(data.access_token),
    refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
  };
}

export async function fetchOutlookMailData(args: OutlookMailFetchArgs) {
  const {
    accessToken,
    refreshToken,
    accountId,
    tokenStore,
    stored,
    microsoftClientId,
    microsoftClientSecret,
  } = args;
  let token = accessToken;
  const headers = (t: string) => ({ Authorization: `Bearer ${t}` });

  const listUrl =
    "https://graph.microsoft.com/v1.0/me/messages?" +
    "$top=10&$orderby=receivedDateTime%20desc&$select=id,conversationId,subject,bodyPreview,receivedDateTime,from,isRead,body";

  async function fetchList(t: string) {
    return fetch(listUrl, { headers: headers(t), signal: AbortSignal.timeout(15_000) });
  }

  let listRes = await fetchList(token);
  if (listRes.status === 401) {
    const refreshed = await refreshMicrosoftToken({
      refreshToken,
      microsoftClientId,
      microsoftClientSecret,
    });
    if (!refreshed) {
      return { error: "Outlook token invalid. Reconnect the account.", status: 401 };
    }
    token = refreshed.accessToken;
    await tokenStore.set(accountId, {
      ...stored,
      accessToken: refreshed.accessToken,
      ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
    });
    listRes = await fetchList(token);
  }

  if (!listRes.ok) {
    const errBody = await listRes.json().catch(() => ({}));
    const msg = String((errBody as { error?: { message?: string } })?.error?.message || "");
    if (msg.toLowerCase().includes("mailbox") || listRes.status === 404) {
      return { error: "Outlook Mail is not available for this account.", status: 400 };
    }
    return { error: "Could not fetch Outlook mail.", status: 502 };
  }

  const listData = await listRes.json().catch(() => ({}));
  const rows = Array.isArray((listData as { value?: GraphMessage[] }).value)
    ? (listData as { value: GraphMessage[] }).value
    : [];

  const mailboxEmail = String(stored.username || "");
  const messages = rows.map((m) => {
    const formatted = formatOutlookGraphMessage(m, mailboxEmail);
    return {
      id: formatted.id,
      conversationId: formatted.conversationId,
      subject: formatted.subject,
      from: formatted.from,
      date: formatted.date,
      snippet: formatted.snippet,
      body: formatted.body,
      isUnread: m.isRead === false,
    };
  });

  return { messages };
}

export async function fetchOutlookMailThread(
  args: OutlookMailFetchArgs & { messageId?: string; conversationId?: string }
) {
  const {
    accessToken,
    refreshToken,
    accountId,
    tokenStore,
    stored,
    microsoftClientId,
    microsoftClientSecret,
    messageId,
    conversationId,
  } = args;
  let token = accessToken;
  const mailboxEmail = String(stored.username || "");
  const headers = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function graphFetch(url: string, t: string) {
    return fetch(url, { headers: headers(t), signal: AbortSignal.timeout(15_000) });
  }

  async function refreshStoredToken() {
    const refreshed = await refreshMicrosoftToken({
      refreshToken,
      microsoftClientId,
      microsoftClientSecret,
    });
    if (!refreshed) return null;
    token = refreshed.accessToken;
    await tokenStore.set(accountId, {
      ...stored,
      accessToken: refreshed.accessToken,
      ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
    });
    return refreshed.accessToken;
  }

  async function authedFetch(url: string) {
    let res = await graphFetch(url, token);
    if (res.status === 401) {
      const nextToken = await refreshStoredToken();
      if (!nextToken) return { ok: false as const, status: 401, error: "outlook_reconnect_required" };
      res = await graphFetch(url, nextToken);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = String((body as { error?: { message?: string } })?.error?.message || "outlook_thread_failed");
      return { ok: false as const, status: res.status, error };
    }
    return { ok: true as const, data: await res.json().catch(() => ({})) };
  }

  let resolvedConversationId = conversationId?.trim() || "";
  if (!resolvedConversationId && messageId?.trim()) {
    const msgRes = await authedFetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId.trim())}?$select=conversationId`
    );
    if (!msgRes.ok) return { error: msgRes.error, status: msgRes.status };
    resolvedConversationId = String((msgRes.data as { conversationId?: string }).conversationId || "");
  }
  if (!resolvedConversationId) {
    return { error: "conversationId or messageId is required", status: 400 };
  }

  const filter = encodeURIComponent(`conversationId eq '${resolvedConversationId.replace(/'/g, "''")}'`);
  const threadUrl =
    "https://graph.microsoft.com/v1.0/me/messages?" +
    `$filter=${filter}&$orderby=receivedDateTime%20asc&$top=50&$select=id,conversationId,subject,bodyPreview,receivedDateTime,from,body`;

  const threadRes = await authedFetch(threadUrl);
  if (!threadRes.ok) return { error: threadRes.error, status: threadRes.status };

  const rows = Array.isArray((threadRes.data as { value?: GraphMessage[] }).value)
    ? (threadRes.data as { value: GraphMessage[] }).value
    : [];

  const messages = rows.map((m) => formatOutlookGraphMessage(m, mailboxEmail));
  return { messages, conversationId: resolvedConversationId };
}

export async function sendOutlookMailReply({
  accessToken,
  refreshToken,
  accountId,
  tokenStore,
  stored,
  microsoftClientId,
  microsoftClientSecret,
  messageId,
  replyText,
}: OutlookReplyArgs) {
  async function sendWithToken(token: string) {
    return fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/reply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: replyText.trim() }),
      signal: AbortSignal.timeout(15_000),
    });
  }

  async function refreshStoredToken() {
    const refreshed = await refreshMicrosoftToken({
      refreshToken,
      microsoftClientId,
      microsoftClientSecret,
    });
    if (!refreshed) return null;
    await tokenStore.set(accountId, {
      ...stored,
      accessToken: refreshed.accessToken,
      ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
    });
    return refreshed.accessToken;
  }

  let res = await sendWithToken(accessToken);
  if (res.status === 401) {
    const nextToken = await refreshStoredToken();
    if (!nextToken) return { ok: false, status: 401, error: "outlook_reconnect_required" };
    res = await sendWithToken(nextToken);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = String(body?.error?.message || body?.error || "outlook_reply_failed");
    return { ok: false, status: res.status, error };
  }
  return { ok: true, status: res.status, data: {} };
}
