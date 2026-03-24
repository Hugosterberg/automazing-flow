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

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessage = {
  id: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: GmailHeader[];
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
    if (listRes.status === 401) return { unauthorized: true as const };
    if (!listRes.ok) return { error: listRes.status };
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
    return { error: "Gmail token invalid. Reconnect the account.", status: 401 };
  }

  const messageIds = (((listData as { messages?: Array<{ id: string }> }).messages || []) as Array<{ id: string }>).map(
    (m) => m.id
  );
  const messages = await Promise.all(
    messageIds.map((id) =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject,From,Date,To`, {
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
      return {
        id: msg.id,
        subject: getHeader(headers, "Subject") || "(No subject)",
        from: parseSender(getHeader(headers, "From")),
        date: dateRaw,
        snippet: msg.snippet || "",
        isUnread: (msg.labelIds || []).includes("UNREAD"),
      };
    });

  return { messages: formatted };
}
