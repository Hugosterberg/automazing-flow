export type SocialPlatform = "instagram" | "tiktok" | "youtube";

export interface ConnectedAccount {
  id: string;
  platform: SocialPlatform;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  connectedAt: string;
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
