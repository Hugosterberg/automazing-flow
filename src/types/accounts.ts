export type SocialPlatform = "instagram" | "tiktok" | "youtube";

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

export interface ConnectedAccount {
  id: string;
  profileId: string;
  platform: SocialPlatform;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  connectedAt: string;
  /** Anslutet via OAuth (har token på backend) */
  isOAuth?: boolean;
  // AI-analysad data
  analysis?: AccountAnalysis;
}

export interface AccountAnalysis {
  story: string;
  purpose: string;
  targetAudience?: string;
  contentThemes?: string[];
  analyzedAt: string;
}
