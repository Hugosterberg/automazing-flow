type SocialPost = {
  likeCount?: number | string | null;
  commentCount?: number | string | null;
  viewCount?: number | string | null;
};

export function calculateEngagementFromPosts(
  posts: unknown,
  followers: number | string | null | undefined
) {
  const safePosts = Array.isArray(posts) ? (posts as SocialPost[]) : [];
  const postsWithEngagement = safePosts.filter((p) => p?.likeCount != null || p?.commentCount != null);

  const totalLikes = postsWithEngagement.reduce((sum, p) => sum + (Number(p.likeCount) || 0), 0);
  const totalComments = postsWithEngagement.reduce((sum, p) => sum + (Number(p.commentCount) || 0), 0);
  const postsWithViews = safePosts.filter((p) => p?.viewCount != null);
  const totalViews = postsWithViews.reduce((sum, p) => sum + (Number(p.viewCount) || 0), 0);
  const postCount = postsWithEngagement.length;
  const avgLikes = postCount > 0 ? Math.round(totalLikes / postCount) : undefined;
  const avgComments = postCount > 0 ? Math.round(totalComments / postCount) : undefined;
  const avgViews = postsWithViews.length > 0 ? Math.round(totalViews / postsWithViews.length) : undefined;

  const engagementRate =
    followers != null && Number(followers) > 0 && postCount > 0
      ? Math.round(((totalLikes + totalComments) / postCount / Number(followers)) * 10000) / 100
      : undefined;

  return {
    totalLikes: postCount > 0 ? totalLikes : undefined,
    totalComments: postCount > 0 ? totalComments : undefined,
    totalViews: postsWithViews.length > 0 ? totalViews : undefined,
    avgLikes,
    avgComments,
    avgViews,
    engagementRate,
    postCount,
  };
}
