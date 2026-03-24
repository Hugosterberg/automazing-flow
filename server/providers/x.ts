import { calculateXMetrics } from "../analytics/xMetrics.ts";

const X_TOKEN = "https://api.x.com/2/oauth2/token";
const X_TOKEN_LEGACY = "https://api.twitter.com/2/oauth2/token";

type XFetchArgs = {
  accessToken: string;
  stored: Record<string, unknown>;
  accountId: string;
  tokenStore: {
    set: (accountId: string, value: Record<string, unknown>) => unknown;
  };
  xClientId?: string;
  xClientSecret?: string;
};

export async function fetchXAccountData({
  accessToken,
  stored,
  accountId,
  tokenStore,
  xClientId,
  xClientSecret,
}: XFetchArgs) {
  const xUserId = stored.xUserId as string | undefined;
  const refreshToken = stored.refreshToken as string | undefined;

  async function fetchWithXTokenFallback(token: string) {
    const endpoints = [
      "https://api.x.com/2/users/me?user.fields=public_metrics,profile_image_url,description,username,name,created_at",
      "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description,username,name,created_at",
    ];
    for (const endpoint of endpoints) {
      const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok || r.status === 401) return r;
    }
    return fetch(endpoints[0], { headers: { Authorization: `Bearer ${token}` } });
  }

  async function refreshXToken(rt: string) {
    if (!xClientId || !rt) return null;
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (xClientSecret) {
      headers["Authorization"] = `Basic ${Buffer.from(`${xClientId}:${xClientSecret}`).toString("base64")}`;
    } else {
      body.set("client_id", xClientId);
    }
    let r = await fetch(X_TOKEN, { method: "POST", headers, body: body.toString() });
    if (!r.ok) {
      r = await fetch(X_TOKEN_LEGACY, { method: "POST", headers, body: body.toString() });
    }
    const d = await r.json();
    if (d.access_token) {
      tokenStore.set(accountId, { ...stored, accessToken: d.access_token, refreshToken: d.refresh_token || rt });
      return d.access_token as string;
    }
    return null;
  }

  let token = accessToken;

  // Fetch user info
  let userRes = await fetchWithXTokenFallback(token);
  if (userRes.status === 401 && refreshToken) {
    token = await refreshXToken(refreshToken);
    if (!token) {
      return { error: "X token invalid. Reconnect the account.", status: 401 };
    }
    userRes = await fetchWithXTokenFallback(token);
  }
  const userData = await userRes.json();
  const user = userData.data || {};
  const metrics = user.public_metrics || {};

  // Fetch recent tweets (up to 10)
  const userId = xUserId || user.id;
  let tweets: Array<Record<string, unknown>> = [];
  if (userId) {
    const tweetsEndpoints = [
      `https://api.x.com/2/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at,text`,
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=public_metrics,created_at,text`,
    ];
    let tweetsRes = await fetch(tweetsEndpoints[0], { headers: { Authorization: `Bearer ${token}` } });
    if (!tweetsRes.ok) {
      tweetsRes = await fetch(tweetsEndpoints[1], { headers: { Authorization: `Bearer ${token}` } });
    }
    if (tweetsRes.ok) {
      const tweetsData = await tweetsRes.json();
      tweets = tweetsData.data || [];
    }
  }

  const stats = calculateXMetrics(
    tweets,
    metrics.followers_count,
    metrics.following_count,
    metrics.tweet_count
  );

  const media = tweets.map((t) => ({
    id: t.id,
    caption: (t.text as string) || "",
    picture: "",
    permalink: `https://twitter.com/${user.username}/status/${t.id}`,
    mediaType: "tweet",
    likeCount: ((t.public_metrics as { like_count?: number })?.like_count) || 0,
    commentCount: ((t.public_metrics as { reply_count?: number })?.reply_count) || 0,
    createdTime: t.created_at as string,
  }));

  return {
    profile: {
      username: user.username,
      displayName: user.name,
      profilePicture: user.profile_image_url,
      description: user.description,
    },
    stats,
    media,
  };
}
