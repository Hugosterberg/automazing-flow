type NotionSearchResult = {
  id?: string;
  url?: string;
  last_edited_time?: string;
  parent?: { type?: string };
  properties?: Record<string, unknown>;
  title?: Array<{ plain_text?: string }>;
};

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
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  const [meRes, pagesRes, dbRes] = await Promise.all([
    fetch("https://api.notion.com/v1/users/me", { headers }),
    fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 10,
      }),
    }),
    fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        filter: { property: "object", value: "database" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 10,
      }),
    }),
  ]);

  if (!meRes.ok) {
    const err = await meRes.text().catch(() => "");
    return { error: `Could not read Notion profile (${meRes.status})`, details: err.slice(0, 200), status: 502 };
  }

  const meData = await meRes.json().catch(() => ({}));
  const pagesData = pagesRes.ok ? await pagesRes.json().catch(() => ({})) : {};
  const dbData = dbRes.ok ? await dbRes.json().catch(() => ({})) : {};

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
    "Notion-Version": "2022-06-28",
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
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      error: data?.message || "Could not create Notion page",
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
