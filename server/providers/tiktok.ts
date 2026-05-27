type TikTokVideo = {
  id?: string;
  title?: string;
  video_description?: string;
  create_time?: number | string;
  cover_image_url?: string;
  share_url?: string;
  like_count?: number | string;
  comment_count?: number | string;
};

export async function fetchTikTokAccountData(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=username,display_name,avatar_url", {
    headers,
  });
  const userData = await userRes.json().catch(() => ({}));

  const videosRes = await fetch(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,like_count,comment_count",
    { method: "POST", headers, body: JSON.stringify({ max_count: 10 }) }
  ).catch(() => null);
  const videosData = videosRes?.ok ? await videosRes.json().catch(() => ({})) : {};
  const videos = Array.isArray((videosData as { data?: { videos?: unknown[] } }).data?.videos)
    ? ((videosData as { data?: { videos?: TikTokVideo[] } }).data?.videos ?? [])
    : [];

  const media = videos.map((v) => ({
    id: v.id,
    caption: v.video_description || v.title || "",
    picture: v.cover_image_url || "",
    permalink: v.share_url || "",
    mediaType: "video",
    likeCount: Number(v.like_count || 0),
    commentCount: Number(v.comment_count || 0),
    createdTime: v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : "",
  }));
  const totalLikes = media.reduce((sum, m) => sum + m.likeCount, 0);
  const avgLikes = media.length > 0 ? Math.round(totalLikes / media.length) : undefined;

  return {
    profile: (userData as { data?: { user?: Record<string, unknown> } }).data?.user || {},
    stats: {
      mediaCount: media.length || undefined,
      totalLikes: media.length > 0 ? totalLikes : undefined,
      avgLikes,
      updatedAt: new Date().toISOString(),
    },
    media,
  };
}
