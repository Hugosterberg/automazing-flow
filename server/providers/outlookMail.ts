import crypto from "node:crypto";

type OutlookMailFetchArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: {
    set: (accountId: string, value: Record<string, unknown>) => unknown;
  };
  stored: Record<string, unknown>;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
};

type GraphMessage = {
  id?: string;
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

async function refreshMicrosoftToken({
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
  });
  const data = await res.json().catch(() => ({}));
  return data?.access_token || null;
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
    "$top=10&$orderby=receivedDateTime%20desc&$select=id,subject,bodyPreview,receivedDateTime,from,isRead,body";

  async function fetchList(t: string) {
    return fetch(listUrl, { headers: headers(t) });
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
    token = refreshed;
    tokenStore.set(accountId, { ...stored, accessToken: refreshed });
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

  const messages = rows.map((m) => {
    const addr = m.from?.emailAddress;
    const name = String(addr?.name || addr?.address || "Unknown");
    const email = String(addr?.address || "");
    const bodyText =
      typeof m.body?.content === "string"
        ? m.body.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "";
    return {
      id: String(m.id || crypto.randomUUID()),
      subject: String(m.subject || "(No subject)"),
      from: { name, email },
      date: String(m.receivedDateTime || ""),
      snippet: String(m.bodyPreview || ""),
      body: bodyText || String(m.bodyPreview || ""),
      isUnread: m.isRead === false,
    };
  });

  return { messages };
}
