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
    if (!nextToken) throw error;
    await tokenStore.set(accountId, { ...stored, accessToken: nextToken });
    return request(nextToken);
  }
}

export async function fetchGoogleDriveAccountData(args: GoogleDriveArgs) {
  const folderId = args.folderId && args.folderId !== "root" ? args.folderId : "root";

  const [items, currentFolder, usedFallback] = await runWithFreshToken({
    ...args,
    request: async (token) => {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.searchParams.set("pageSize", "200");
      url.searchParams.set("orderBy", "folder,name_natural");
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      url.searchParams.set(
        "fields",
        "files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,size,parents,owners(displayName),shortcutDetails(targetId,targetMimeType))"
      );
      url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new Error("unauthorized");
      if (!res.ok) throw new Error("google_drive_fetch_failed");
      const body = await res.json().catch(() => ({}));
      let files = Array.isArray(body.files) ? body.files : [];

      let usedFallback = false;
      if (folderId === "root" && files.length === 0) {
        const fallbackUrl = new URL("https://www.googleapis.com/drive/v3/files");
        fallbackUrl.searchParams.set("pageSize", "200");
        fallbackUrl.searchParams.set("orderBy", "modifiedTime desc,name_natural");
        fallbackUrl.searchParams.set("supportsAllDrives", "true");
        fallbackUrl.searchParams.set("includeItemsFromAllDrives", "true");
        fallbackUrl.searchParams.set(
          "fields",
          "files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,size,parents,owners(displayName),shortcutDetails(targetId,targetMimeType))"
        );
        fallbackUrl.searchParams.set(
          "q",
          "trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'image/' or mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.shortcut')"
        );
        const fallbackRes = await fetch(fallbackUrl.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (fallbackRes.status === 401) throw new Error("unauthorized");
        if (fallbackRes.ok) {
          const fallbackBody = await fallbackRes.json().catch(() => ({}));
          files = Array.isArray(fallbackBody.files) ? fallbackBody.files : [];
          usedFallback = true;
        }
      }

      let currentFolderMeta: { id: string; name: string; parentId: string | null } | null = null;
      if (folderId !== "root") {
        const folderMetaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,parents`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (folderMetaRes.status === 401) throw new Error("unauthorized");
        if (folderMetaRes.ok) {
          const folderMeta = await folderMetaRes.json().catch(() => ({}));
          currentFolderMeta = {
            id: String(folderMeta.id || folderId),
            name: String(folderMeta.name || "Folder"),
            parentId: Array.isArray(folderMeta.parents) ? String(folderMeta.parents[0] || "") || null : null,
          };
        }
      }

      const mappedItems = files.map((file: Record<string, unknown>) => {
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
            ? `/api/accounts/${encodeURIComponent(args.accountId)}/drive/files/${encodeURIComponent(effectiveId)}/content`
            : `/api/accounts/${encodeURIComponent(args.accountId)}/drive/files/${encodeURIComponent(effectiveId)}/thumbnail`;

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
              ? `/api/accounts/${encodeURIComponent(args.accountId)}/drive/files/${encodeURIComponent(effectiveId)}/content`
              : undefined,
          webViewLink: String(file.webViewLink || ""),
          modifiedTime: String(file.modifiedTime || ""),
          ownerName: String((Array.isArray(file.owners) ? file.owners[0]?.displayName : "") || ""),
          size: typeof file.size === "string" ? Number(file.size) : undefined,
        };
      });

      return [mappedItems, currentFolderMeta, usedFallback] as const;
    },
  });

  return {
    source: "google_drive",
    items,
    currentFolderId: folderId === "root" ? null : folderId,
    currentFolderName: currentFolder?.name || null,
    parentFolderId: currentFolder?.parentId || null,
    usedFallback,
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
          }
        );
        if (res.status === 401) throw new Error("unauthorized");
        return res;
      }

      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}?fields=thumbnailLink`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (metaRes.status === 401) throw new Error("unauthorized");
      if (!metaRes.ok) return metaRes;
      const meta = await metaRes.json().catch(() => ({}));
      const thumbnailLink = String(meta?.thumbnailLink || "").trim();
      if (!thumbnailLink) {
        return new Response(null, { status: 404 });
      }
      return fetch(thumbnailLink, { headers: { Authorization: `Bearer ${token}` } });
    },
  });
}
