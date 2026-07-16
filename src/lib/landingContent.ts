import type { LucideIcon } from "lucide-react";
import { Bot, Inbox, LineChart, Sparkles } from "lucide-react";

/** Integration names are brand names — not translated. */
export const LANDING_INTEGRATIONS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Facebook",
  "Google Ads",
  "Meta Business",
  "Shopify",
  "Gmail",
  "Outlook",
  "Google Calendar",
  "Google Reviews",
  "Tripadvisor",
  "WhatsApp",
  "Canva",
  "Google Drive",
  "Notion",
] as const;

export const LANDING_TRUST_KEYS = ["trust.free", "trust.noCard", "trust.minutes"] as const;

export type LandingPillarDef = {
  icon: LucideIcon;
  key: "collect" | "grow" | "understand";
};

export const LANDING_PILLAR_DEFS: LandingPillarDef[] = [
  { icon: Inbox, key: "collect" },
  { icon: LineChart, key: "grow" },
  { icon: Sparkles, key: "understand" },
];

export const LANDING_STEPS = [
  { step: "1", titleKey: "steps.s1Title", descriptionKey: "steps.s1Desc" },
  { step: "2", titleKey: "steps.s2Title", descriptionKey: "steps.s2Desc" },
  { step: "3", titleKey: "steps.s3Title", descriptionKey: "steps.s3Desc" },
] as const;

export type DemoSceneId = "home" | "messages" | "reviews" | "sales" | "intelligence";

export type DemoSceneDef = {
  id: DemoSceneId;
  labelKey: string;
  captionKey: string;
};

export const DEMO_SCENE_DEFS: DemoSceneDef[] = [
  { id: "home", labelKey: "demo.home", captionKey: "demo.homeCaption" },
  { id: "messages", labelKey: "demo.messages", captionKey: "demo.messagesCaption" },
  { id: "reviews", labelKey: "demo.reviews", captionKey: "demo.reviewsCaption" },
  { id: "sales", labelKey: "demo.sales", captionKey: "demo.salesCaption" },
  { id: "intelligence", labelKey: "demo.intelligence", captionKey: "demo.intelligenceCaption" },
];

export const DEMO_SIDEBAR_ACTIVE_KEYS: Record<DemoSceneId, string> = {
  home: "demo.home",
  messages: "demo.messages",
  reviews: "demo.reviews",
  sales: "demo.sales",
  intelligence: "demo.intelligence",
};

export { Bot };
