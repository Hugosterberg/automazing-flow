type XPublicMetrics = {
  like_count?: number | string | null;
  reply_count?: number | string | null;
  retweet_count?: number | string | null;
};

type XTweet = {
  public_metrics?: XPublicMetrics | null;
};

export function calculateXMetrics(
  tweets: unknown,
  followersCount: number | string | null | undefined,
  followingCount: number | string | null | undefined,
  tweetCount: number | string | null | undefined
) {
  const list = Array.isArray(tweets) ? (tweets as XTweet[]) : [];
  const tweetsWithMetrics = list.filter((t) => t?.public_metrics);

  const totalLikes = tweetsWithMetrics.reduce((sum, t) => sum + (Number(t.public_metrics?.like_count) || 0), 0);
  const totalReplies = tweetsWithMetrics.reduce((sum, t) => sum + (Number(t.public_metrics?.reply_count) || 0), 0);
  const totalRetweets = tweetsWithMetrics.reduce(
    (sum, t) => sum + (Number(t.public_metrics?.retweet_count) || 0),
    0
  );

  const postCount = tweetsWithMetrics.length;
  const avgLikes = postCount > 0 ? Math.round(totalLikes / postCount) : undefined;

  const engagementRate =
    followersCount && Number(followersCount) > 0 && postCount > 0
      ? Math.round(((totalLikes + totalReplies + totalRetweets) / postCount / Number(followersCount)) * 10000) /
        100
      : undefined;

  return {
    followersCount: followersCount != null ? Number(followersCount) : undefined,
    followingCount: followingCount != null ? Number(followingCount) : undefined,
    mediaCount: tweetCount != null ? Number(tweetCount) : undefined,
    totalLikes,
    avgLikes,
    engagementRate,
    updatedAt: new Date().toISOString(),
  };
}
