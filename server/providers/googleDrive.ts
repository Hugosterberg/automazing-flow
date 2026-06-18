type TokenStore = {
  set: (accountId: string, value: Record<string, unknown>) => Promise<unknown>;
};

type GoogleDriveArgs = {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  tokenStore: TokenStore;
  stored: Record<string, unknown>;
  googleClientId?: string;
  googleClientSecret?: string;
  folderId?: string | null;
  view?: "my-drive" | "shared-with-me";
};

type GoogleDriveItemKind = "folder" | "image" | "video" | "other";

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

async function runWithFreshToken<T>({
  accessToken,
  refreshToken,
  accountId,
  tokenStore,
  stored,
  googleClientId,
  googleClientSecret,
  request,
}: GoogleDriveArgs & {
  request: (token: string) => Promise<T>;
}) {
  try {
    return await request(accessToken);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "unauthorized") throw error;
    const nextToken = await refreshGoogleToken({ refreshToken, googleClientId, googleClientSecret });
    if (!nextToken) {
      throw new Error("Google Drive token invalid. Reconnect the account.", { cause: error });
    }
    await tokenStore.set(accountId, { ...stored, accessToken: nextToken });
    try {
      return await request(nextToken);
    } catch (refreshError) {
      if (refreshError instanceof Error && refreshError.message === "unauthorized") {
        throw new Error("Google Drive token refresh succeeded but the request is still unauthorized.", {
          cause: refreshError,
        });
      }
      throw refreshError;
    }
  }
}

const DRIVE_FIELDS =
  "files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,size,parents,owners(displayName),shortcutDetails(targetId,targetMimeType))";

function mapDriveFile(file: Record<string, unknown>, accountId: string): Record<string, unknown> {
  const id = String(file.id || "");
  const mimeType = String(file.mimeType || "");
  const shortcutDetails =
    file.shortcutDetails && typeof file.shortcutDetails === "object"
      ? (file.shortcutDetails as Record<string, unknown>)
      : null;
  const shortcutTargetMimeType = String(shortcutDetails?.targetMimeType || "");
  const effectiveMimeType =
    mimeType === "application/vnd.google-apps.shortcut" && shortcutTargetMimeType
      ? shortcutTargetMimeType
      : mimeType;
  const kind: GoogleDriveItemKind =
    effectiveMimeType === "application/vnd.google-apps.folder"
      ? "folder"
      : effectiveMimeType.startsWith("video/")
        ? "video"
        : effectiveMimeType.startsWith("image/")
          ? "image"
          : "other";
  const effectiveId =
    mimeType === "application/vnd.google-apps.shortcut" && shortcutDetails?.targetId
      ? String(shortcutDetails.targetId)
      : id;
  const thumbnailUrl =
    kind === "folder" || kind === "other"
      ? ""
      : kind === "image"
      ? `/api/accounts/${encodeURIComponent(accountId)}/drive/files/${encodeURIComponent(effectiveId)}/content`
      : `/api/accounts/${encodeURIComponent(accountId)}/drive/files/${encodeURIComponent(effectiveId)}/thumbnail`;

  return {
    id: effectiveId,
    name: String(file.name || "Untitled"),
    mimeType: effectiveMimeType,
    kind,
    thumbnailUrl,
    iconLink: String(file.iconLink || ""),
    isShortcut: mimeType === "application/vnd.google-apps.shortcut",
    previewUrl:
      kind === "image"
        ? `/api/accounts/${encodeURIComponent(accountId)}/drive/files/${encodeURIComponent(effectiveId)}/content`
        : undefined,
    webViewLink: String(file.webViewLink || ""),
    modifiedTime: String(file.modifiedTime || ""),
    ownerName: String((Array.isArray(file.owners) ? file.owners[0]?.displayName : "") || ""),
    size: typeof file.size === "string" ? Number(file.size) : undefined,
  };
}

async function driveList(token: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("fields", DRIVE_FIELDS);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body.files) ? body.files : [];
}

export async function fetchGoogleDriveAccountData(args: GoogleDriveArgs) {
  const folderId = args.folderId && args.folderId !== "root" ? args.folderId : "root";
  const view = args.view ?? "my-drive";

  const [items, sharedItems, currentFolder] = await runWithFreshToken({
    ...args,
    request: async (token) => {
      // Shared with me root — flat list of shared items
      if (view === "shared-with-me" && folderId === "root") {
        const files = await driveList(token, {
          orderBy: "folder,name_natural",
          q: "sharedWithMe = true and trashed = false",
        });
        return [files, [], null] as const;
      }

      // Folder navigation (works for both My Drive and Shared with me subfolders)
      let files = await driveList(token, {
        orderBy: "folder,name_natural",
        q: `'${folderId}' in parents and trashed = false`,
      });

      // Fallback 1: all owned files
      if (folderId === "root" && files.length === 0) {
        files = await driveList(token, {
          orderBy: "modifiedTime desc",
          q: "trashed = false and 'me' in owners",
        });
      }

      // Fallback 2: absolutely everything accessible
      if (folderId === "root" && files.length === 0) {
        files = await driveList(token, {
          orderBy: "modifiedTime desc",
          q: "trashed = false",
        });
      }

      let currentFolderMeta: { id: string; name: string; parentId: string | null } | null = null;
      if (folderId !== "root") {
        const r = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,parents`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
        );
        if (r.status === 401) throw new Error("unauthorized");
        if (r.ok) {
          const meta = await r.json().catch(() => ({}));
          currentFolderMeta = {
            id: String(meta.id || folderId),
            name: String(meta.name || "Folder"),
            parentId: Array.isArray(meta.parents) ? String(meta.parents[0] || "") || null : null,
          };
        }
      }

      return [files, [], currentFolderMeta] as const;
    },
  });

  return {
    source: "google_drive",
    items: items.map((f) => mapDriveFile(f, args.accountId)),
    sharedItems: sharedItems.map((f) => mapDriveFile(f, args.accountId)),
    currentFolderId: folderId === "root" ? null : folderId,
    currentFolderName: currentFolder?.name || null,
    parentFolderId: currentFolder?.parentId || null,
  };
}

export async function fetchGoogleDriveFileResponse(
  args: GoogleDriveArgs & {
    fileId: string;
    mode: "content" | "thumbnail";
    rangeHeader?: string;
  }
) {
  return runWithFreshToken({
    ...args,
    request: async (token) => {
      if (args.mode === "content") {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              ...(args.rangeHeader ? { Range: args.rangeHeader } : {}),
            },
            // Generous: file contents can be large, but still bounded so a
            // stalled download can't hold the request open indefinitely.
            signal: AbortSignal.timeout(60_000),
          }
        );
        if (res.status === 401) throw new Error("unauthorized");
        return res;
      }

      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}?fields=thumbnailLink`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
      );
      if (metaRes.status === 401) throw new Error("unauthorized");
      if (!metaRes.ok) return metaRes;
      const meta = await metaRes.json().catch(() => ({}));
      const thumbnailLink = String(meta?.thumbnailLink || "").trim();
      if (!thumbnailLink) {
        return new Response(null, { status: 404 });
      }
      return fetch(thumbnailLink, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    },
  });
}
