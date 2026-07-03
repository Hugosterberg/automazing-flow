import type { ComponentType } from "react";
import { BarChart3, Bot, ClipboardList, Mail, MessageSquare, Sparkles, TrendingUp, Users } from "lucide-react";

/**
 * Catalog of everything the app runs automatically, grouped by topic.
 *
 * Single source of truth for the Automations page: each entry mirrors a
 * server-side job (see `server/routes/cronRoutes.js` and the schedules in
 * `vercel.json`) or an on-demand automation, so users can see WHAT runs,
 * WHEN it runs and WHERE the result lands — even for jobs that have no
 * settings of their own (e.g. the marketing snapshot).
 *
 * Keep cadence labels in sync with `vercel.json` when schedules change.
 */

export type AutomationTopic = "messages" | "reports" | "insights";

export interface AutomationTopicInfo {
  id: AutomationTopic;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export const AUTOMATION_TOPIC_ORDER: AutomationTopic[] = [
  "messages",
  "reports",
  "insights",
];

export const AUTOMATION_TOPICS: Record<AutomationTopic, AutomationTopicInfo> = {
  messages: {
    id: "messages",
    title: "Meddelanden & inbox",
    description:
      "Automatik som hanterar inkommande konversationer så du slipper svara på allt manuellt.",
    icon: MessageSquare,
  },
  reports: {
    id: "reports",
    title: "Rapporter & utskick",
    description:
      "Sammanställningar och larm som mejlas automatiskt istället för att du ska komma ihåg att kolla.",
    icon: Mail,
  },
  insights: {
    id: "insights",
    title: "AI & insikter",
    description:
      "Bakgrundsjobb som håller rekommendationer och nyckeltal färska utan manuell uppdatering.",
    icon: Sparkles,
  },
};

export interface AutomationCatalogEntry {
  id: string;
  topic: AutomationTopic;
  title: string;
  description: string;
  /** Human-readable schedule, mirroring the cron in vercel.json. */
  cadence: string;
  icon: ComponentType<{ className?: string }>;
  /** In-app route where the automation's output shows up. */
  outputHref?: string;
  /** Hidden in the private workspace (company-oriented automations). */
  businessOnly?: boolean;
  /**
   * Cron identifier this entry maps to (the `/api/cron/<key>` path segment and
   * `automation_runs.automation_key`). Present only for scheduled jobs, so the
   * Automations page can show their last/next run. Omit for on-demand-only
   * automations.
   */
  cronKey?: string;
}

export const automationCatalog: AutomationCatalogEntry[] = [
  {
    id: "dm-auto-reply",
    topic: "messages",
    title: "Auto-svar på DM:s",
    description:
      "Läser olästa konversationer och skriver svar — som utkast eller skickar direkt.",
    cadence: "Konfigurerbart schema",
    icon: Bot,
    outputHref: "/messages",
    cronKey: "auto-reply",
  },
  {
    id: "daily-digest",
    topic: "reports",
    title: "Daglig översikt",
    description: "Morgonmejl varje vardag med det som behöver göras.",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    cronKey: "daily-digest",
  },
  {
    id: "weekly-report",
    topic: "reports",
    title: "Veckorapport",
    description: "Måndagsmejl som summerar förra veckan.",
    cadence: "Konfigurerbart schema",
    icon: Mail,
    cronKey: "weekly-report",
  },
  {
    id: "lead-reminder",
    topic: "reports",
    title: "Lead-påminnelse",
    description: "Mejl när leads behöver uppföljning idag eller är försenade.",
    cadence: "Konfigurerbart schema",
    icon: Users,
    outputHref: "/sales",
    cronKey: "lead-reminder",
  },
  {
    id: "task-reminder",
    topic: "reports",
    title: "Uppgiftspåminnelse",
    description: "Mejl med försenade och dagens uppgifter.",
    cadence: "Konfigurerbart schema",
    icon: ClipboardList,
    outputHref: "/tasks",
    cronKey: "task-reminder",
  },
  {
    id: "marketing-alerts",
    topic: "reports",
    title: "Marknadsförings-larm",
    description:
      "Mejl när ROAS går under 1× eller annonser körs mot tomma hyllor.",
    cadence: "Konfigurerbart schema",
    icon: BarChart3,
    outputHref: "/marketing",
    businessOnly: true,
    cronKey: "marketing-alerts",
  },
  {
    id: "ai-recommendations-refresh",
    topic: "insights",
    title: "AI-rekommendationer",
    description:
      "Uppdaterar rekommendationerna utifrån connections, tasks och innehåll.",
    cadence: "Konfigurerbart schema",
    icon: Sparkles,
    outputHref: "/ai-recommendations",
    cronKey: "refresh-ai-recommendations",
  },
  {
    id: "marketing-snapshot",
    topic: "insights",
    title: "Marknadsförings-snapshot",
    description:
      "Sparar dagens annons-KPI:er så veckotrenden på Marketing-sidan alltid är komplett.",
    cadence: "Konfigurerbart schema",
    icon: BarChart3,
    outputHref: "/marketing",
    businessOnly: true,
    cronKey: "marketing-snapshot",
  },
  {
    id: "market-pulse-snapshot",
    topic: "insights",
    title: "Market pulse-snapshot",
    description:
      "Hämtar LunarCrush-sentiment varje natt så startsidan laddar direkt utan live MCP-anrop.",
    cadence: "Konfigurerbart schema",
    icon: TrendingUp,
    businessOnly: true,
    cronKey: "market-pulse-snapshot",
  },
];

export function catalogEntriesForTopic(
  topic: AutomationTopic,
  options: { includeBusinessOnly?: boolean } = {}
): AutomationCatalogEntry[] {
  const includeBusinessOnly = options.includeBusinessOnly ?? true;
  return automationCatalog.filter(
    (entry) =>
      entry.topic === topic && (includeBusinessOnly || !entry.businessOnly)
  );
}
