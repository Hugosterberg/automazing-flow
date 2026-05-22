/* eslint-disable @typescript-eslint/no-explicit-any --
 * Accounts returned by `zernio.listAccounts()` are shaped by the upstream
 * provider (IG Graph, Meta Business, etc.) and normalized best-effort. Casts
 * to `any` are kept local to this handler.
 */

/**
 * Instagram account-data handler for accounts connected via Zernio.
 *
 * Triggers when `platform === "instagram"` and `instagramViaZernio` is true.
 * Uses `zernio.listAccounts()` to find the matching IG account, then
 * `zernio.listAccountPosts()` to compute engagement over the last 100 posts.
 */

import { calculateEngagementFromPosts } from "../analytics/socialMetrics.ts";
import type { ZernioModule } from "../providers/zernioModule.ts";
import type { PlatformHandlerResult } from "./types.ts";

interface InstagramZernioHandlerArgs {
  zernio: ZernioModule;
  zernioInstagramAccountId: string | null | undefined;
  accountId: string;
}

export async function handleInstagramZernioAccountData({
  zernio,
  zernioInstagramAccountId,
  accountId,
}: InstagramZernioHandlerArgs): Promise<PlatformHandlerResult> {
  const lookupId = String(zernioInstagramAccountId || accountId);

  const accountsResult = await zernio.listAccounts();
  if (!accountsResult.ok) {
    console.error(`[Zernio] GET /accounts failed: ${accountsResult.status}`);
    return {
      kind: "error",
      status: 502,
      body: { error: "Could not fetch data from Zernio" },
    };
  }
  const list = Array.isArray(accountsResult.accounts) ? accountsResult.accounts : [];
  console.log(`[Zernio] GET /accounts: ${list.length} accounts found`);

  if (list.length === 0) {
    return {
      kind: "error",
      status: 502,
      body: { error: "No Instagram accounts found in Zernio" },
    };
  }

  // Match account: profileId._id matches lookupId (Zernio workspace profile)
  // Fallback: search by account _id, then first instagram account, then single account
  const acc: any =
    list.find((a: any) => String(a.profileId?._id || a.profileId || "") === lookupId) ??
    list.find((a: any) => String(a._id || a.id || "") === lookupId) ??
    list.find((a: any) => (a.platform || "").toLowerCase() === "instagram") ??
    (list.length === 1 ? list[0] : null);

  if (acc) console.log(`[Zernio] Matched account: _id=${acc._id} username=${acc.username}`);
  else
    console.warn(
      `[Zernio] No account matches lookupId=${lookupId}. Available: ${list.map((a: any) => a._id).join(", ")}`
    );

  // Instagram stats from connected account metadata
  const profileData: any = acc?.metadata?.profileData ?? {};
  const profile = {
    username: profileData.username ?? acc?.username ?? acc?.name,
    id: acc?._id ?? acc?.id,
    displayName: profileData.displayName ?? acc?.displayName,
    profilePicture: profileData.profilePicture ?? acc?.profilePicture,
  };

  const followers = profileData.followersCount ?? acc?.followers_count ?? acc?.followersCount;
  const following =
    profileData.followingCount ?? acc?.follows_count ?? acc?.followingCount ?? undefined;
  const mediaCount =
    profileData.mediaCount ?? acc?.media_count ?? acc?.mediaCount ?? acc?.externalPostCount;
  const accountType = profileData.accountType ?? acc?.accountType ?? undefined;

  // Fetch posts for likes/comment stats in parallel
  let posts: any[] = [];
  if (acc?._id) {
    const postsResult = await zernio.listAccountPosts(String(acc._id), {
      limit: 100,
    });
    if (postsResult.ok) {
      const postsData: any = postsResult.data;
      posts = Array.isArray(postsData.posts) ? postsData.posts : [];
    }
  }

  const normalizedPosts = posts.map((p: any) => ({
    ...p,
    viewCount:
      Number(
        p.viewCount ??
          p.views ??
          p.view_count ??
          p.playCount ??
          p.plays ??
          p.videoViews ??
          p.video_views ??
          p.impressions ??
          p.reach ??
          0
      ) || 0,
  }));
  const engagement = calculateEngagementFromPosts(normalizedPosts, followers);

  console.log(
    `[Zernio] Instagram stats: followers=${followers}, media=${mediaCount}, avgLikes=${engagement.avgLikes}, avgComments=${engagement.avgComments}, engagement=${engagement.engagementRate}%`
  );

  const stats = [followers, following, mediaCount].some((n) => n != null && !Number.isNaN(Number(n)))
    ? {
        followersCount: followers != null ? Number(followers) : undefined,
        followingCount: following != null ? Number(following) : undefined,
        mediaCount: mediaCount != null ? Number(mediaCount) : undefined,
        accountType: accountType ?? undefined,
        totalLikes: engagement.totalLikes,
        totalComments: engagement.totalComments,
        totalViews: engagement.totalViews,
        avgLikes: engagement.avgLikes,
        avgComments: engagement.avgComments,
        avgViews: engagement.avgViews,
        engagementRate: engagement.engagementRate,
        updatedAt: new Date().toISOString(),
      }
    : undefined;

  // Return the 12 most recent posts with image, likes and comments
  const recentPosts = normalizedPosts.slice(0, 12).map((p: any) => ({
    id: p.id,
    caption: p.message || "",
    picture: p.picture || "",
    permalink: p.permalink || "",
    mediaType: p.mediaType || "image",
    likeCount: p.likeCount || 0,
    commentCount: p.commentCount || 0,
    viewCount: p.viewCount || 0,
    createdTime: p.createdTime,
  }));

  return {
    kind: "json",
    body: {
      profile: { ...profile, ...(stats && { stats }) },
      media: recentPosts,
      stats,
    },
  };
}
