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
  flag?: {
    flagStatus?: string;
  };
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
  const rawBody = typeof m.body?.content === "string" ? m.body.content : "";
  const isHtml = String(m.body?.contentType || "").toLowerCase() === "html";
  const bodyText = isHtml && rawBody.trim() ? rawBody : stripHtmlBody(rawBody);
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

export type OutlookMailFolder = {
  id: string;
  name: string;
  parentFolderId?: string;
  totalItemCount?: number;
  unreadItemCount?: number;
};

const OUTLOOK_SYSTEM_FOLDER_NAMES = new Set([
  "archive",
  "clutter",
  "conflicts",
  "conversation history",
  "deleted items",
  "drafts",
  "inbox",
  "junk email",
  "local failures",
  "outbox",
  "recoverable items deletions",
  "scheduled",
  "search folders",
  "sent items",
  "sync issues",
]);

async function withOutlookToken<T>(
  args: OutlookMailFetchArgs,
  run: (token: string) => Promise<Response>
): Promise<{ ok: true; token: string; res: Response } | { ok: false; status: number; error: string }> {
  let token = args.accessToken;
  let res = await run(token);
  if (res.status === 401 && args.refreshToken) {
    const refreshed = await refreshMicrosoftToken({
      refreshToken: args.refreshToken,
      microsoftClientId: args.microsoftClientId,
      microsoftClientSecret: args.microsoftClientSecret,
    });
    if (!refreshed) {
      return { ok: false as const, status: 401, error: "outlook_reconnect_required" };
    }
    token = refreshed.accessToken;
    await args.tokenStore.set(args.accountId, {
      ...args.stored,
      accessToken: refreshed.accessToken,
      ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
    });
    res = await run(token);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = String((body as { error?: { message?: string } })?.error?.message || "outlook_request_failed");
    return { ok: false as const, status: res.status, error };
  }
  return { ok: true as const, token, res };
}

export async function fetchOutlookMailData(
  args: OutlookMailFetchArgs & { folderId?: string; includeAllMail?: boolean }
) {
  const {
    accessToken,
    refreshToken,
    accountId,
    tokenStore,
    stored,
    microsoftClientId,
    microsoftClientSecret,
    folderId,
    includeAllMail = false,
  } = args;
  let token = accessToken;
  const headers = (t: string) => ({ Authorization: `Bearer ${t}` });

  // List view skips full HTML body — bodyPreview is enough for inbox rows; thread fetch loads body on open.
  const listSelect =
    "id,conversationId,subject,bodyPreview,receivedDateTime,from,isRead,flag";
  // Folder wins over all-mail. All-mail uses mailbox-wide /me/messages (not Inbox-only).
  const listUrl = folderId
    ? `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(folderId)}/messages?$top=10&$orderby=receivedDateTime%20desc&$select=${listSelect}`
    : includeAllMail
      ? `https://graph.microsoft.com/v1.0/me/messages?$top=10&$orderby=receivedDateTime%20desc&$select=${listSelect}`
      : "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?" +
        `$top=10&$orderby=receivedDateTime%20desc&$select=${listSelect}`;

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
      isStarred: String(m.flag?.flagStatus || "").toLowerCase() === "flagged",
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

export async function listOutlookUserMailFolders(args: OutlookMailFetchArgs) {
  const result = await withOutlookToken(args, (token) =>
    fetch(
      "https://graph.microsoft.com/v1.0/me/mailFolders?$top=100&$select=id,displayName,parentFolderId,totalItemCount,unreadItemCount,wellKnownName",
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    )
  );
  if (result.ok === false) return { error: result.error, status: result.status };
  const data = (await result.res.json().catch(() => ({}))) as {
    value?: Array<{
      id?: string;
      displayName?: string;
      parentFolderId?: string;
      totalItemCount?: number;
      unreadItemCount?: number;
      wellKnownName?: string;
    }>;
  };
  const folders: OutlookMailFolder[] = (data.value || [])
    .filter((folder) => {
      const name = String(folder.displayName || "").trim().toLowerCase();
      if (!folder.id || !name) return false;
      if (folder.wellKnownName) return false;
      if (OUTLOOK_SYSTEM_FOLDER_NAMES.has(name)) return false;
      return true;
    })
    .map((folder) => ({
      id: String(folder.id || ""),
      name: String(folder.displayName || ""),
      parentFolderId: folder.parentFolderId ? String(folder.parentFolderId) : undefined,
      totalItemCount: typeof folder.totalItemCount === "number" ? folder.totalItemCount : undefined,
      unreadItemCount: typeof folder.unreadItemCount === "number" ? folder.unreadItemCount : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  return { folders };
}

export async function createOutlookMailFolder(args: OutlookMailFetchArgs & { name: string }) {
  const cleanName = String(args.name || "").trim();
  if (!cleanName) return { ok: false as const, status: 400, error: "folder_name_required" };

  const inboxResult = await withOutlookToken(args, (token) =>
    fetch("https://graph.microsoft.com/v1.0/me/mailFolders/inbox", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (inboxResult.ok === false) return { ok: false as const, status: inboxResult.status, error: inboxResult.error };
  const inbox = (await inboxResult.res.json().catch(() => ({}))) as { id?: string };
  const inboxId = String(inbox.id || "");
  if (!inboxId) return { ok: false as const, status: 502, error: "outlook_inbox_not_found" };

  const createResult = await withOutlookToken(args, (token) =>
    fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(inboxId)}/childFolders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: cleanName }),
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (createResult.ok === false) return { ok: false as const, status: createResult.status, error: createResult.error };
  const data = (await createResult.res.json().catch(() => ({}))) as { id?: string; displayName?: string };
  return {
    ok: true as const,
    folder: {
      id: String(data.id || ""),
      name: String(data.displayName || cleanName),
      parentFolderId: inboxId,
    },
  };
}

export async function moveOutlookMessageToFolder(
  args: OutlookMailFetchArgs & { messageId: string; folderId: string }
) {
  const messageId = String(args.messageId || "").trim();
  const folderId = String(args.folderId || "").trim();
  if (!messageId || !folderId) return { ok: false as const, status: 400, error: "message_and_folder_required" };
  const result = await withOutlookToken(args, (token) =>
    fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/move`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: folderId }),
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const };
}

export async function deleteOutlookMessage(args: OutlookMailFetchArgs & { messageId: string }) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) return { ok: false as const, status: 400, error: "message_id_required" };
  const result = await withOutlookToken(args, (token) =>
    fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const };
}

export async function archiveOutlookMessage(args: OutlookMailFetchArgs & { messageId: string }) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) return { ok: false as const, status: 400, error: "message_id_required" };
  const archiveResult = await withOutlookToken(args, (token) =>
    fetch("https://graph.microsoft.com/v1.0/me/mailFolders/archive", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (archiveResult.ok === false) {
    return { ok: false as const, status: archiveResult.status, error: archiveResult.error };
  }
  const archive = (await archiveResult.res.json().catch(() => ({}))) as { id?: string };
  const archiveId = String(archive.id || "");
  if (!archiveId) return { ok: false as const, status: 502, error: "outlook_archive_not_found" };
  return moveOutlookMessageToFolder({ ...args, messageId, folderId: archiveId });
}

export async function setOutlookMessageFlagged(
  args: OutlookMailFetchArgs & { messageId: string; flagged: boolean }
) {
  const messageId = String(args.messageId || "").trim();
  if (!messageId) return { ok: false as const, status: 400, error: "message_id_required" };
  const result = await withOutlookToken(args, (token) =>
    fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        flag: { flagStatus: args.flagged ? "flagged" : "notFlagged" },
      }),
      signal: AbortSignal.timeout(15_000),
    })
  );
  if (result.ok === false) return { ok: false as const, status: result.status, error: result.error };
  return { ok: true as const };
}
