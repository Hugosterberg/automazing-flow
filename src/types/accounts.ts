export type SocialPlatform = "instagram" | "tiktok" | "youtube";
export type EcommercePlatform = "shopify";
export type MailPlatform = "gmail" | "outlook";

export type AccountPlatform = SocialPlatform | EcommercePlatform | MailPlatform;

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

/** Statistik för sociala konton (t.ex. Instagram: följare, antal inlägg) */
export interface AccountStats {
  followersCount?: number;
  followingCount?: number;
  mediaCount?: number;
  /** Kontotyp från plattformen, t.ex. "MEDIA_CREATOR", "BUSINESS" */
  accountType?: string;
  /** Totalt antal likes på senaste inläggen */
  totalLikes?: number;
  /** Totalt antal kommentarer på senaste inläggen */
  totalComments?: number;
  /** Snitt-likes per inlägg */
  avgLikes?: number;
  /** Snitt-kommentarer per inlägg */
  avgComments?: number;
  /** Engagement rate i procent: (likes + kommentarer) / inlägg / följare * 100 */
  engagementRate?: number;
  /** Senast uppdaterad (ISO-sträng) */
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
  /** Anslutet via OAuth (har token på backend) */
  isOAuth?: boolean;
  /** Late API-konto-id (t.ex. acc_xxx) när anslutet via Late */
  lateAccountId?: string;
  /** Följare, antal inlägg m.m. (hämtas från plattformens API) */
  stats?: AccountStats;
  // AI-analysad data
  analysis?: AccountAnalysis;
}

export interface AccountAnalysis {
  /** Vad kontot handlar om – nisch och syfte */
  about?: string;
  /** Vilka konkreta ämnen och innehållstyper som förekommer */
  writes?: string;
  /** Hur en utomstående person uppfattar kontot */
  perception?: string;
  /** Legacy fields */
  story?: string;
  purpose?: string;
  targetAudience?: string;
  contentThemes?: string[];
  analyzedAt: string;
}
