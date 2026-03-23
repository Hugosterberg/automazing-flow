export type SocialPlatform = "instagram" | "tiktok" | "youtube" | "x";
export type EcommercePlatform = "shopify";
export type MailPlatform = "gmail" | "outlook";

export type AccountPlatform = SocialPlatform | EcommercePlatform | MailPlatform;

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

/** Stats for social accounts (e.g. Instagram: followers, post count) */
export interface AccountStats {
  followersCount?: number;
  followingCount?: number;
  mediaCount?: number;
  /** Account type from the platform, e.g. "MEDIA_CREATOR", "BUSINESS" */
  accountType?: string;
  /** Total likes on recent posts */
  totalLikes?: number;
  /** Total comments on recent posts */
  totalComments?: number;
  /** Average likes per post */
  avgLikes?: number;
  /** Average comments per post */
  avgComments?: number;
  /** Engagement rate in percent: (likes + comments) / posts / followers * 100 */
  engagementRate?: number;
  /** Last updated (ISO string) */
  updatedAt?: string;
}

export interface ConnectedAccount {
  id: string;
  profileId: string;
  platform: AccountPlatform;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  connectedAt: string;
  /** Connected via OAuth (token stored on backend) */
  isOAuth?: boolean;
  /** Late API account id (e.g. acc_xxx) when connected via Late */
  lateAccountId?: string;
  /** Followers, post count etc. (fetched from the platform API) */
  stats?: AccountStats;
  // AI-analysad data
  analysis?: AccountAnalysis;
}

export interface AccountAnalysis {
  /** What the account is about – niche and purpose */
  about?: string;
  /** Concrete topics and content types that appear */
  writes?: string;
  /** How an outside person perceives the account */
  perception?: string;
  /** Legacy fields */
  story?: string;
  purpose?: string;
  targetAudience?: string;
  contentThemes?: string[];
  analyzedAt: string;
}
