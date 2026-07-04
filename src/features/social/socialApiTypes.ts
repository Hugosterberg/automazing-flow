/** Shapes returned by /api/accounts/:id/data for social platforms. */

export type SocialMediaApiPost = {
  id: string;
  caption: string;
  picture: string;
  permalink: string;
  mediaType: string;
  likeCount: number;
  commentCount: number;
  viewCount?: number;
  createdTime: string;
};

export type GoogleBusinessPanelData = {
  source: "zernio" | "official";
  title?: string;
  phone?: string;
  website?: string;
  addressLines: string[];
  primaryCategory?: string;
  averageRating?: number;
  reviewCount?: number;
  reviews: Array<{
    id: string;
    author: string;
    rating?: number;
    text: string;
    createdAt: string;
    url?: string;
  }>;
};

export type SocialMediaApiResponse = {
  source?: string;
  stats?: {
    followersCount?: number;
    followingCount?: number;
    mediaCount?: number;
    accountType?: string;
    totalLikes?: number;
    totalComments?: number;
    totalViews?: number;
    avgLikes?: number;
    avgComments?: number;
    avgViews?: number;
    engagementRate?: number;
    updatedAt?: string;
    zernioNote?: string;
    averageRating?: number;
    reviewCount?: number;
  };
  profile?: {
    displayName?: string;
    username?: string;
    media_count?: number;
    followers_count?: number;
    follows_count?: number;
    account_type?: string;
    stats?: SocialMediaApiResponse["stats"];
  };
  media?: SocialMediaApiPost[];
  googleBusiness?: GoogleBusinessPanelData;
  reviews?: GoogleBusinessPanelData["reviews"];
  zernioExtra?: Record<string, unknown>;
};
