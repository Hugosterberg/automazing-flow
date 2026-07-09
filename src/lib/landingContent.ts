import type { LucideIcon } from "lucide-react";
import { Bot, Inbox, LineChart, Sparkles } from "lucide-react";

export const LANDING_TRUST_POINTS = [
  "Gratis att skapa konto",
  "Inget kreditkort krävs",
  "Koppla kanaler på minuter",
] as const;

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

export type LandingPillar = {
  icon: LucideIcon;
  title: string;
  tagline: string;
  items: string[];
};

/** Three clear product pillars — easier to scan than six separate cards. */
export const LANDING_PILLARS: LandingPillar[] = [
  {
    icon: Inbox,
    title: "Samla",
    tagline: "Sluta hoppa mellan flikar",
    items: [
      "Mail, DM och WhatsApp i en inbox",
      "Google & Tripadvisor-recensioner",
      "Kalender och innehåll på samma ställe",
    ],
  },
  {
    icon: LineChart,
    title: "Väx",
    tagline: "Sälj och marknadsför smartare",
    items: [
      "Leads, pipeline och uppföljningar",
      "Google Ads & Meta i samma vy",
      "Automationer som kör sig själva",
    ],
  },
  {
    icon: Sparkles,
    title: "Förstå",
    tagline: "AI som känner er verklighet",
    items: [
      "Daglig överblick — vad behöver göras idag",
      "AI-utkast till svar och rekommendationer",
      "MCP Intelligence mot era kopplade data",
    ],
  },
];

export const LANDING_COMPARISON = {
  before: {
    title: "Utan automazing",
    items: [
      "8+ verktyg och inloggningar",
      "Recensioner som hinner bli gamla",
      "Ingen koll på vad som är viktigast idag",
      "AI-tips som inte känner er business",
    ],
  },
  after: {
    title: "Med automazing",
    items: [
      "En app för kommunikation, sälj & content",
      "Prioriterad inbox med AI-utkast",
      "Home visar exakt vad som behöver göras",
      "Insikter från era riktiga kopplingar",
    ],
  },
} as const;

export const LANDING_STEPS = [
  {
    step: "1",
    title: "Skapa konto",
    description: "Google eller e-post — under en minut.",
  },
  {
    step: "2",
    title: "Koppla kanaler",
    description: "Instagram, mail, recensioner m.m.",
  },
  {
    step: "3",
    title: "Se resultat",
    description: "Överblick, AI och automationer direkt.",
  },
] as const;

export type DemoSceneId = "home" | "messages" | "reviews" | "sales" | "intelligence";

export type DemoScene = {
  id: DemoSceneId;
  label: string;
  caption: string;
};

export const DEMO_SCENES: DemoScene[] = [
  {
    id: "home",
    label: "Överblick",
    caption: "Din dag i ett ögonkast — prioriterat innan kunder hinner bli otåliga.",
  },
  {
    id: "messages",
    label: "Meddelanden",
    caption: "En inbox för mail och DM. AI sammanfattar och föreslår svar.",
  },
  {
    id: "reviews",
    label: "Recensioner",
    caption: "Nya omdömen → AI-utkast → publicera med ett klick.",
  },
  {
    id: "sales",
    label: "Försäljning",
    caption: "Leads blir affärer. Pipeline och uppföljningar hänger ihop.",
  },
  {
    id: "intelligence",
    label: "MCP & AI",
    caption: "Fråga er data — rätt verktyg väljs automatiskt.",
  },
];

/** Sidebar labels shown in the demo chrome per scene. */
export const DEMO_SIDEBAR_ACTIVE: Record<DemoSceneId, string> = {
  home: "Home",
  messages: "Meddelanden",
  reviews: "Recensioner",
  sales: "Försäljning",
  intelligence: "MCP Intelligence",
};

// Keep Bot exported for demo scene icon map
export { Bot };
