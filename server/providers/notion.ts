/** Official Notion API version — see https://developers.notion.com/reference/versioning */
const NOTION_API_VERSION = "2025-09-03";

type NotionSearchResult = {
  id?: string;
  url?: string;
  last_edited_time?: string;
  parent?: { type?: string };
  properties?: Record<string, unknown>;
  title?: Array<{ plain_text?: string }>;
};

type NotionApiErrorBody = {
  object?: string;
  message?: string;
  code?: string;
  status?: number;
};

function parseNotionErrorBody(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const o = data as NotionApiErrorBody;
  if (o.object === "error" && typeof o.message === "string" && o.message.trim()) {
    const code = typeof o.code === "string" ? ` (${o.code})` : "";
    return `${o.message.trim()}${code}`;
  }
  return "";
}

async function formatNotionFailure(label: string, response: Response): Promise<string> {
  const raw = await response.json().catch(() => ({}));
  const parsed = parseNotionErrorBody(raw);
  return parsed || `${label} failed (${response.status})`;
}

function getPlainTitleFromProperty(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const maybeTitle = (value as { title?: Array<{ plain_text?: string }> }).title;
  if (!Array.isArray(maybeTitle)) return "";
  return maybeTitle.map((t) => t?.plain_text || "").join("").trim();
}

function getNotionTitle(item: NotionSearchResult) {
  if (Array.isArray(item.title)) {
    const direct = item.title.map((t) => t?.plain_text || "").join("").trim();
    if (direct) return direct;
  }
  const props = item.properties && typeof item.properties === "object" ? item.properties : {};
  for (const value of Object.values(props)) {
    const title = getPlainTitleFromProperty(value);
    if (title) return title;
  }
  return "Untitled";
}

export async function fetchNotionAccountData(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };

  const [meRes, pagesRes, dbRes] = await Promise.all([
    fetch("https://api.notion.com/v1/users/me", { headers, signal: AbortSignal.timeout(15_000) }),
    fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 10,
      }),
      signal: AbortSignal.timeout(15_000),
    }),
    fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filter: { property: "object", value: "database" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 10,
      }),
      signal: AbortSignal.timeout(15_000),
    }),
  ]);

  if (!meRes.ok) {
    const raw = await meRes.json().catch(() => ({}));
    const parsed = parseNotionErrorBody(raw) || (await meRes.text().catch(() => "")).slice(0, 200);
    if (meRes.status === 401) {
      return {
        error: "Notion access token is invalid or expired. Disconnect and reconnect the integration in Accounts.",
        details: parsed,
        status: 401,
      };
    }
    if (meRes.status === 403) {
      return {
        error: "Notion returned forbidden for this token. Reconnect the integration or check workspace sharing for the integration.",
        details: parsed,
        status: 403,
      };
    }
    return {
      error: `Could not read Notion integration profile (${meRes.status})`,
      details: parsed,
      status: meRes.status >= 400 && meRes.status < 600 ? meRes.status : 502,
    };
  }

  if (!pagesRes.ok || !dbRes.ok) {
    const failures = await Promise.all([
      ...(!pagesRes.ok ? [formatNotionFailure("Page search", pagesRes)] : []),
      ...(!dbRes.ok ? [formatNotionFailure("Database search", dbRes)] : []),
    ]);
    const status = !pagesRes.ok ? pagesRes.status : dbRes.status;
    if (status === 401) {
      return {
        error: "Notion search failed: token invalid or expired. Reconnect Notion.",
        details: failures.join(" | "),
        status: 401,
      };
    }
    return {
      error: failures.join(" | ") || `Notion search failed (${status})`,
      details: failures.join(" | "),
      status: status >= 400 && status < 600 ? status : 502,
    };
  }

  const meData = await meRes.json().catch(() => ({}));
  const pagesData = await pagesRes.json().catch(() => ({}));
  const dbData = await dbRes.json().catch(() => ({}));

  const pagesRaw = Array.isArray(pagesData.results) ? pagesData.results : [];
  const dbRaw = Array.isArray(dbData.results) ? dbData.results : [];

  const pages = (pagesRaw as NotionSearchResult[]).map((page) => ({
    id: String(page.id || ""),
    title: getNotionTitle(page),
    url: page.url || "",
    lastEditedTime: page.last_edited_time || "",
    parentType: page.parent?.type || "",
  }));

  const databases = (dbRaw as NotionSearchResult[]).map((db) => ({
    id: String(db.id || ""),
    title: getNotionTitle(db),
    url: db.url || "",
    lastEditedTime: db.last_edited_time || "",
  }));

  return {
    workspace: {
      name: meData?.name || "",
      type: meData?.type || "",
      botId: meData?.bot?.owner?.workspace || "",
    },
    stats: {
      pagesCount: pages.length,
      databasesCount: databases.length,
    },
    pages,
    databases,
    canWrite: true,
  };
}

export async function createNotionPage(
  accessToken: string,
  {
    parentId,
    parentType,
    title,
    content,
  }: { parentId: string; parentType: "page_id" | "database_id"; title: string; content?: string }
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": NOTION_API_VERSION,
    "Content-Type": "application/json",
  };

  const body: Record<string, unknown> = {
    parent: { [parentType]: parentId, type: parentType },
    properties: {
      title: {
        title: [
          {
            text: { content: title },
          },
        ],
      },
    },
  };

  if (content?.trim()) {
    body.children = [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: content.trim() } }],
        },
      },
    ];
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = parseNotionErrorBody(data) || (typeof (data as { message?: string })?.message === "string" ? (data as { message: string }).message : null);
    return {
      error: msg || "Could not create Notion page",
      status: res.status || 502,
      details: data,
    };
  }

  return {
    id: data?.id || "",
    url: data?.url || "",
    createdTime: data?.created_time || "",
  };
}
