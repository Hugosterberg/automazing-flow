import crypto from "crypto";

type TokenStore = {
  set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
};

type CalendarFetchArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: TokenStore;
  stored: Record<string, unknown>;
  googleClientId?: string;
  googleClientSecret?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
};

function toIsoDate(input?: string | null) {
  if (!input || !/^\d{4}-\d{2}-\d{2}/.test(input)) {
    return new Date().toISOString().slice(0, 10);
  }
  return input.slice(0, 10);
}

function toTime(input?: string) {
  if (!input) return undefined;
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString().slice(11, 16);
}

async function refreshGoogleToken({
  refreshToken,
  googleClientId,
  googleClientSecret,
}: {
  refreshToken?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}) {
  if (!refreshToken || !googleClientId || !googleClientSecret) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
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
  const data = await res.json().catch(() => ({}));
  return data?.access_token || null;
}

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

export async function fetchGoogleCalendarData(args: CalendarFetchArgs) {
  const {
    accessToken,
    refreshToken,
    accountId,
    tokenStore,
    stored,
    googleClientId,
    googleClientSecret,
  } = args;
  let token = accessToken;
  const timeMin = new Date().toISOString();
  const baseHeaders = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function fetchPrimaryEvents(t: string) {
    return fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
        timeMin
      )}&singleEvents=true&orderBy=startTime&maxResults=50`,
      { headers: baseHeaders(t), signal: AbortSignal.timeout(15_000) }
    );
  }

  let eventsRes = await fetchPrimaryEvents(token);
  if (eventsRes.status === 401) {
    const refreshed = await refreshGoogleToken({ refreshToken, googleClientId, googleClientSecret });
    if (!refreshed) return { error: "Google Calendar token invalid. Reconnect the account.", status: 401 };
    token = refreshed;
    await tokenStore.set(accountId, { ...stored, accessToken: refreshed });
    eventsRes = await fetchPrimaryEvents(token);
  }
  if (!eventsRes.ok) {
    return { error: "Could not fetch Google Calendar events", status: 502 };
  }

  const eventsData = await eventsRes.json().catch(() => ({}));
  const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=20", {
    headers: baseHeaders(token),
  });
  const listData = listRes.ok ? await listRes.json().catch(() => ({})) : {};

  const events = Array.isArray(eventsData.items)
    ? eventsData.items.map((e: Record<string, unknown>) => {
        const start = (e.start as Record<string, string>) || {};
        const date = start.date || toIsoDate(String(start.dateTime || new Date().toISOString()));
        return {
          id: String(e.id || crypto.randomUUID()),
          title: String(e.summary || "(Untitled event)"),
          date,
          time: start.dateTime ? toTime(String(start.dateTime)) : undefined,
          isAutomated: false,
          description: String(e.description || ""),
          createdAt: String(e.created || new Date().toISOString()),
          source: "external",
          readOnly: true,
        };
      })
    : [];

  const calendars = Array.isArray(listData.items)
    ? listData.items.map((c: Record<string, unknown>) => ({
        id: String(c.id || ""),
        name: String(c.summary || ""),
        primary: Boolean(c.primary),
      }))
    : [];

  return { source: "google_calendar", calendars, events };
}

export async function fetchOutlookCalendarData(args: CalendarFetchArgs) {
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
  const startDateTime = new Date().toISOString();
  const endDateTime = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const headers = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function fetchCalendarView(t: string) {
    return fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(
        startDateTime
      )}&endDateTime=${encodeURIComponent(endDateTime)}&$top=50&$orderby=start/dateTime`,
      { headers: headers(t), signal: AbortSignal.timeout(15_000) }
    );
  }

  let eventsRes = await fetchCalendarView(token);
  if (eventsRes.status === 401) {
    const refreshed = await refreshMicrosoftToken({
      refreshToken,
      microsoftClientId,
      microsoftClientSecret,
    });
    if (!refreshed) return { error: "Outlook Calendar token invalid. Reconnect the account.", status: 401 };
    token = refreshed.accessToken;
    await tokenStore.set(accountId, {
      ...stored,
      accessToken: refreshed.accessToken,
      ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
    });
    eventsRes = await fetchCalendarView(token);
  }
  if (!eventsRes.ok) {
    return { error: "Could not fetch Outlook Calendar events", status: 502 };
  }

  const eventsData = await eventsRes.json().catch(() => ({}));
  const listRes = await fetch("https://graph.microsoft.com/v1.0/me/calendars?$top=20", {
    headers: headers(token),
  });
  const listData = listRes.ok ? await listRes.json().catch(() => ({})) : {};

  const events = Array.isArray(eventsData.value)
    ? eventsData.value.map((e: Record<string, unknown>) => {
        const start = (e.start as Record<string, string>) || {};
        const startDateTimeRaw = String(start.dateTime || "");
        const date = startDateTimeRaw ? toIsoDate(startDateTimeRaw) : toIsoDate(new Date().toISOString());
        return {
          id: String(e.id || crypto.randomUUID()),
          title: String(e.subject || "(Untitled event)"),
          date,
          time: startDateTimeRaw ? toTime(startDateTimeRaw) : undefined,
          isAutomated: false,
          description: String(e.bodyPreview || ""),
          createdAt: String(e.createdDateTime || new Date().toISOString()),
          source: "external",
          readOnly: true,
        };
      })
    : [];

  const calendars = Array.isArray(listData.value)
    ? listData.value.map((c: Record<string, unknown>) => ({
        id: String(c.id || ""),
        name: String(c.name || ""),
        primary: Boolean(c.isDefaultCalendar),
      }))
    : [];

  return { source: "outlook_calendar", calendars, events };
}
