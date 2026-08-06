/**
 * Meta ad-post comments (Facebook Page posts + Instagram ad media).
 *
 * Flow: Marketing API ads → creative story/media ids → Graph `/comments`.
 * Page tokens from connect (`metaPages`) are preferred for Facebook replies.
 */

type MetaPage = {
  id?: string;
  name?: string;
  accessToken?: string;
  tasks?: string[];
};

type MetaStored = Record<string, unknown> & {
  accessToken?: string;
  username?: string;
  scopes?: string;
  metaAdAccountId?: string | null;
  metaAdAccounts?: Array<{ id?: string; name?: string }>;
  metaPages?: MetaPage[];
};

export type MetaAdCommentPlatform = "facebook" | "instagram";

export type MetaAdComment = {
  id: string;
  message: string;
  createdAt: string | null;
  authorName: string;
  authorId: string | null;
  platform: MetaAdCommentPlatform;
  adId: string;
  adName: string;
  postId: string;
  pageId: string | null;
  canReply: boolean;
};

export type MetaAdCommentsResult = {
  connected: boolean;
  accountName: string;
  comments: MetaAdComment[];
  adsScanned: number;
  needsReconnect: boolean;
  needsPages: boolean;
  note?: string;
};

const MAX_ADS = 12;
const MAX_COMMENTS_PER_POST = 8;
const MAX_COMMENTS_TOTAL = 40;

function scopesInclude(scopes: string | undefined, needle: string): boolean {
  return String(scopes || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(needle);
}

function pageIdFromStoryId(storyId: string): string | null {
  const parts = storyId.split("_");
  return parts.length >= 2 && parts[0] ? parts[0] : null;
}

function pickPageToken(stored: MetaStored, pageId: string | null): string | null {
  const pages = Array.isArray(stored.metaPages) ? stored.metaPages : [];
  if (pageId) {
    const match = pages.find((p) => String(p?.id || "") === pageId && p?.accessToken);
    if (match?.accessToken) return String(match.accessToken);
  }
  const first = pages.find((p) => p?.accessToken);
  return first?.accessToken ? String(first.accessToken) : null;
}

async function graphGet(
  url: string
): Promise<{ ok: boolean; body: Record<string, unknown>; status: number }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && !body.error, body, status: res.status };
  } catch {
    return { ok: false, body: {}, status: 0 };
  }
}

async function graphPost(
  url: string,
  params: Record<string, string>
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  try {
    const body = new URLSearchParams(params);
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && !json.error, body: json };
  } catch {
    return { ok: false, body: {} };
  }
}

export async function fetchMetaAdComments(
  stored: MetaStored,
  graphVersion: string
): Promise<MetaAdCommentsResult> {
  const graphBase = `https://graph.facebook.com/${graphVersion}`;
  const accessToken = String(stored.accessToken || "");
  const accounts = Array.isArray(stored.metaAdAccounts) ? stored.metaAdAccounts : [];
  const adAccountId = String(stored.metaAdAccountId || accounts[0]?.id || "").trim();
  const accountName = String(accounts[0]?.name || stored.username || "Meta Business");
  const pages = Array.isArray(stored.metaPages) ? stored.metaPages : [];
  const needsPages = pages.length === 0;
  const hasEngagementScope = scopesInclude(stored.scopes, "pages_read_engagement");

  const empty = (note?: string, needsReconnect = false): MetaAdCommentsResult => ({
    connected: Boolean(accessToken && adAccountId),
    accountName,
    comments: [],
    adsScanned: 0,
    needsReconnect,
    needsPages,
    note,
  });

  if (!accessToken) {
    return empty("Reconnect Meta Business (Official API) to load ad comments.", true);
  }
  if (!adAccountId) {
    return empty("No ad account is linked to this Meta connection.");
  }
  if (!hasEngagementScope || needsPages) {
    // Still attempt a best-effort read with the user token — many ads work —
    // but surface reconnect so Page tokens + engagement scopes land.
  }

  const adsUrl =
    `${graphBase}/${encodeURIComponent(adAccountId)}/ads` +
    `?fields=${encodeURIComponent(
      "id,name,status,creative{id,effective_object_story_id,effective_instagram_media_id,object_story_id}"
    )}` +
    `&effective_status=${encodeURIComponent('["ACTIVE","PAUSED"]')}` +
    `&limit=${MAX_ADS}` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  const adsRes = await graphGet(adsUrl);
  if (!adsRes.ok) {
    const err = adsRes.body.error as { message?: string; code?: number } | undefined;
    const code = err?.code;
    const reconnect = code === 190 || code === 102 || code === 463;
    return empty(
      reconnect
        ? "Meta access expired — reconnect Meta Business."
        : err?.message || "Couldn't load Meta ads for comments.",
      reconnect
    );
  }

  const ads = Array.isArray(adsRes.body.data) ? adsRes.body.data : [];
  const comments: MetaAdComment[] = [];
  let permissionGaps = 0;

  for (const raw of ads) {
    if (comments.length >= MAX_COMMENTS_TOTAL) break;
    if (!raw || typeof raw !== "object") continue;
    const ad = raw as Record<string, unknown>;
    const adId = String(ad.id || "");
    const adName = String(ad.name || "Untitled ad");
    if (!adId) continue;

    const creative =
      ad.creative && typeof ad.creative === "object"
        ? (ad.creative as Record<string, unknown>)
        : {};
    const storyId = String(
      creative.effective_object_story_id || creative.object_story_id || ""
    ).trim();
    const igMediaId = String(creative.effective_instagram_media_id || "").trim();

    if (storyId) {
      const pageId = pageIdFromStoryId(storyId);
      const pageToken = pickPageToken(stored, pageId) || accessToken;
      const commentsUrl =
        `${graphBase}/${encodeURIComponent(storyId)}/comments` +
        `?fields=id,message,created_time,from{id,name}` +
        `&filter=toplevel&limit=${MAX_COMMENTS_PER_POST}` +
        `&access_token=${encodeURIComponent(pageToken)}`;
      const cRes = await graphGet(commentsUrl);
      if (!cRes.ok) {
        permissionGaps += 1;
      } else {
        const rows = Array.isArray(cRes.body.data) ? cRes.body.data : [];
        for (const row of rows) {
          if (comments.length >= MAX_COMMENTS_TOTAL) break;
          if (!row || typeof row !== "object") continue;
          const c = row as Record<string, unknown>;
          const from =
            c.from && typeof c.from === "object" ? (c.from as Record<string, unknown>) : {};
          const id = String(c.id || "");
          if (!id) continue;
          comments.push({
            id,
            message: String(c.message || "").trim(),
            createdAt: c.created_time ? String(c.created_time) : null,
            authorName: String(from.name || "Facebook user"),
            authorId: from.id ? String(from.id) : null,
            platform: "facebook",
            adId,
            adName,
            postId: storyId,
            pageId,
            canReply: Boolean(pickPageToken(stored, pageId)),
          });
        }
      }
    }

    if (igMediaId && comments.length < MAX_COMMENTS_TOTAL) {
      const igUrl =
        `${graphBase}/${encodeURIComponent(igMediaId)}/comments` +
        `?fields=id,text,timestamp,username,from` +
        `&limit=${MAX_COMMENTS_PER_POST}` +
        `&access_token=${encodeURIComponent(accessToken)}`;
      const igRes = await graphGet(igUrl);
      if (igRes.ok) {
        const rows = Array.isArray(igRes.body.data) ? igRes.body.data : [];
        for (const row of rows) {
          if (comments.length >= MAX_COMMENTS_TOTAL) break;
          if (!row || typeof row !== "object") continue;
          const c = row as Record<string, unknown>;
          const id = String(c.id || "");
          if (!id) continue;
          comments.push({
            id,
            message: String(c.text || c.message || "").trim(),
            createdAt: c.timestamp ? String(c.timestamp) : null,
            authorName: String(c.username || "Instagram user"),
            authorId: null,
            platform: "instagram",
            adId,
            adName,
            postId: igMediaId,
            pageId: null,
            canReply: false,
          });
        }
      }
    }
  }

  comments.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  let note: string | undefined;
  if (comments.length === 0 && ads.length === 0) {
    note = "No active or paused ads found on this ad account.";
  } else if (comments.length === 0 && permissionGaps > 0) {
    note =
      "Ads were found but comments couldn't be read. Reconnect Meta Business (Official API) so Page tokens and pages_read_engagement are granted.";
  } else if (needsPages || !hasEngagementScope) {
    note =
      "Reconnect Meta Business to store Page tokens — required for reliable Facebook comment reads and replies.";
  }

  return {
    connected: true,
    accountName,
    comments,
    adsScanned: ads.length,
    needsReconnect: needsPages || !hasEngagementScope || permissionGaps > 0,
    needsPages,
    note,
  };
}

export async function replyMetaAdComment(
  stored: MetaStored,
  graphVersion: string,
  input: { commentId: string; message: string; platform: MetaAdCommentPlatform; pageId?: string | null }
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const graphBase = `https://graph.facebook.com/${graphVersion}`;
  const commentId = String(input.commentId || "").trim();
  const message = String(input.message || "").trim();
  if (!commentId || !message) return { ok: false, error: "Comment id and message are required." };
  if (message.length > 2000) return { ok: false, error: "Reply is too long." };

  if (input.platform === "instagram") {
    return {
      ok: false,
      error: "Instagram ad comment replies need extra Instagram comment scopes — not enabled yet.",
    };
  }

  const pageToken = pickPageToken(stored, input.pageId || null);
  if (!pageToken) {
    return {
      ok: false,
      error: "No Page access token stored. Reconnect Meta Business (Official API).",
    };
  }

  const url = `${graphBase}/${encodeURIComponent(commentId)}/comments`;
  const res = await graphPost(url, {
    message,
    access_token: pageToken,
  });
  if (!res.ok) {
    const err = res.body.error as { message?: string } | undefined;
    return { ok: false, error: err?.message || "Couldn't post reply." };
  }
  return { ok: true, id: res.body.id ? String(res.body.id) : undefined };
}
