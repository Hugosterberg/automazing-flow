export type SocialPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  /** Connected via [Zernio](https://zernio.com) (Facebook Page, etc.) */
  | "facebook"
  /** Google Business Profile via Zernio */
  | "google_business"
  /** WhatsApp Business via Zernio ([docs](https://docs.zernio.com/platforms/whatsapp)) */
  | "whatsapp";
export type EcommercePlatform = "shopify" | "notion";
export type MailPlatform = "gmail" | "outlook";
export type CalendarPlatform = "google_calendar" | "outlook_calendar";
export type ReviewsPlatform = "google_reviews" | "tripadvisor";
export type ContentPlatform = "google_drive" | "canva";
export type MarketingPlatform = "google_ads" | "meta_business";

export type AccountPlatform =
  | SocialPlatform
  | EcommercePlatform
  | MailPlatform
  | CalendarPlatform
  | ReviewsPlatform
  | ContentPlatform
  | MarketingPlatform;

export interface Profile {
  id: string;
  name: string;
  /** "company" | "personal" — mirrors BusinessProfile.kind via the bridge. */
  kind?: string;
  createdAt: string;
  website?: string;
  email?: string;
  phone?: string;
  company?: string;
  location?: string;
  notes?: string;
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
  /** Total views on recent posts */
  totalViews?: number;
  /** Average likes per post */
  avgLikes?: number;
  /** Average comments per post */
  avgComments?: number;
  /** Average views per post */
  avgViews?: number;
  /** Engagement rate in percent: (likes + comments) / posts / followers * 100 */
  engagementRate?: number;
  /** Last updated (ISO string) */
  updatedAt?: string;
  /** Provider hint (e.g. Zernio analytics add-on or API limits) */
  zernioNote?: string;
  /** Google Business Profile (official or Zernio enrichment) */
  averageRating?: number;
  reviewCount?: number;
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
  /** Zernio account id when connected via Zernio (e.g. Instagram OAuth through Zernio) */
  zernioAccountId?: string;
  /** Linked via Zernio API (same company, multiple channels) */
  isZernio?: boolean;
  /** ISO time when user disconnected; kept in DB for reconnect hints */
  disconnectedAt?: string | null;
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
