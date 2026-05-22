/* eslint-disable @typescript-eslint/no-explicit-any --
 * Meta Graph API responses are loosely typed; casts to `any` are kept local.
 */

/**
 * Instagram account-data handler for accounts connected via the native
 * Instagram/Meta Graph API (non-Zernio flow).
 *
 * Pulls profile + media count + recent media via `graph.instagram.com`.
 */

import type { PlatformHandlerResult } from "./types.ts";

export async function handleInstagramOfficialAccountData({
  accessToken,
}: {
  accessToken: string;
}): Promise<PlatformHandlerResult> {
  // Begär alla tillgängliga statistikfält (Graph API: followers_count, follows_count, media_count)
  const fields = "id,username,account_type,media_count,followers_count,follows_count";
  const mediaRes = await fetch(
    `https://graph.instagram.com/me?fields=${fields}&access_token=${accessToken}`
  );
  const media: any = await mediaRes.json();

  if (media?.error) {
    return {
      kind: "error",
      status: 400,
      body: { error: media.error.message || "Failed to fetch Instagram profile" },
    };
  }
  const mediaListRes = await fetch(
    `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp&access_token=${accessToken}&limit=12`
  );
  const mediaList: any = await mediaListRes.json();
  let mediaCount = media.media_count != null && !media.error ? Number(media.media_count) : undefined;
  const mediaListData = Array.isArray(mediaList?.data) ? mediaList.data : [];
  if (mediaCount == null && mediaListData.length > 0) {
    mediaCount = mediaListData.length;
  }
  const followersCount =
    media.followers_count != null && !media.error ? Number(media.followers_count) : undefined;
  const followingCount =
    media.follows_count != null && !media.error ? Number(media.follows_count) : undefined;
  const hasAnyStat = followersCount != null || followingCount != null || mediaCount != null;
  const stats = hasAnyStat
    ? {
        followersCount: followersCount ?? undefined,
        followingCount: followingCount ?? undefined,
        mediaCount: mediaCount ?? undefined,
        updatedAt: new Date().toISOString(),
      }
    : undefined;
  return {
    kind: "json",
    body: {
      profile: { ...media, ...(stats && { stats }) },
      media: mediaListData,
      stats,
    },
  };
}
