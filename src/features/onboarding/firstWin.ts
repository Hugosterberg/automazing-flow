import type { ProfileKind } from "@/types/businessProfile";
import type { AccountPlatform } from "@/types/accounts";
import { connectionsSessionHref } from "@/features/connections/connectSessionState";

export const FIRST_WIN_DOC_KEY = "first-win-checklist";

export type FirstWinDoc = {
  /** User dismissed the checklist strip on Home. */
  dismissedAt?: string | null;
  /** Optional notes for future steps. */
  completedStepIds?: string[];
};

export type FirstWinStepId =
  | "connect_mail"
  | "connect_channel"
  | "open_inbox"
  | "open_ecommerce"
  | "enable_automation"
  | "fill_company";

export type FirstWinStep = {
  id: FirstWinStepId;
  title: string;
  detail: string;
  to: string;
  cta: string;
  done: boolean;
};

export type PriorityConnect = {
  platform: AccountPlatform;
  title: string;
  why: string;
  query: string;
};

/** Curated first connections — keep short so onboarding feels doable. */
export function priorityConnectsForKind(kind: ProfileKind | null | undefined): PriorityConnect[] {
  if (kind === "personal") {
    return [
      {
        platform: "gmail",
        title: "Gmail",
        why: "Get mail in Messages and AI drafts you approve before send.",
        query: "gmail",
      },
      {
        platform: "google_calendar",
        title: "Google Calendar",
        why: "See today’s meetings on Home and in Calendar.",
        query: "calendar",
      },
      {
        platform: "instagram",
        title: "Instagram",
        why: "DMs and social inbox in one place.",
        query: "instagram",
      },
    ];
  }
  return [
    {
      platform: "gmail",
      title: "Gmail",
      why: "Triage customer mail (Today/Week) and reply with AI drafts.",
      query: "gmail",
    },
    {
      platform: "instagram",
      title: "Instagram",
      why: "DM automations and social inbox for customer contact.",
      query: "instagram",
    },
    {
      platform: "shopify",
      title: "Shopify",
      why: "Orders, stock and cart recovery under E-commerce.",
      query: "shopify",
    },
  ];
}

/**
 * Build first-win steps. Connect steps are done only when the platform is
 * *verified healthy* (passed via healthyPlatforms), not merely present.
 */
export function buildFirstWinSteps(args: {
  kind: ProfileKind | null | undefined;
  /** Platforms with at least one healthy connection (verified). */
  healthyPlatforms: Iterable<string>;
  /** Platforms present but not necessarily healthy — for inbox unlock. */
  connectedPlatforms?: Iterable<string>;
  profileStrong: boolean;
}): FirstWinStep[] {
  const healthy = new Set(
    [...args.healthyPlatforms].map((p) => String(p || "").toLowerCase())
  );
  const connected = new Set(
    [...(args.connectedPlatforms ?? args.healthyPlatforms)].map((p) =>
      String(p || "").toLowerCase()
    )
  );
  const hasMail = healthy.has("gmail") || healthy.has("outlook");
  const hasChannel =
    healthy.has("instagram") ||
    healthy.has("facebook") ||
    healthy.has("whatsapp") ||
    healthy.has("tiktok") ||
    healthy.has("shopify") ||
    healthy.has("google_calendar") ||
    healthy.has("outlook_calendar");
  const hasShopify = healthy.has("shopify");
  const canOpenInbox =
    connected.has("gmail") ||
    connected.has("outlook") ||
    connected.has("instagram") ||
    connected.has("facebook");

  const steps: FirstWinStep[] = [
    {
      id: "connect_mail",
      title: hasMail ? "Mail is connected" : "Connect mail",
      detail: hasMail
        ? "You can triage and reply under Messages."
        : "Gmail or Outlook — the first step to an inbox that actually helps.",
      to: connectionsSessionHref("gmail", { wizard: true }),
      cta: hasMail ? "Open Connections" : "Connect mail",
      done: hasMail,
    },
    {
      id: "connect_channel",
      title: hasChannel ? "Channel connected" : "Connect another channel",
      detail: hasChannel
        ? "Social, calendar or store syncs into the app."
        : args.kind === "personal"
          ? "Calendar or Instagram gives you more than mail alone."
          : "Instagram or Shopify brings DMs and orders into one workspace.",
      to: "/connections?wizard=1",
      cta: hasChannel ? "Manage connections" : "Choose channel",
      done: hasChannel,
    },
    {
      id: "open_inbox",
      title: "Open Messages",
      detail: "See the Today bucket, AI drafts, and approve before anything is sent.",
      to: "/messages?bucket=today",
      cta: "Open Messages",
      done: canOpenInbox,
    },
  ];

  if (args.kind !== "personal") {
    steps.push({
      id: "open_ecommerce",
      title: hasShopify ? "Open E-commerce" : "Connect Shopify for orders",
      detail: hasShopify
        ? "Check orders, stock and cart recovery in one place."
        : "Shopify unlocks orders, stock alerts and recovery under E-commerce.",
      to: hasShopify ? "/ecommerce?tab=orders" : connectionsSessionHref("shopify", { wizard: true }),
      cta: hasShopify ? "Open Orders" : "Connect Shopify",
      done: hasShopify,
    });
  }

  steps.push({
    id: "enable_automation",
    title: "Turn on an automation",
    detail: "E.g. AI drafts for DM or mail — draft-before-send where it matters.",
    to: "/automations?tab=messages",
    cta: "Open Automations",
    done: false,
  });

  if (args.kind !== "personal") {
    steps.push({
      id: "fill_company",
      title: args.profileStrong ? "Company profile is ready" : "Fill in Company",
      detail: args.profileStrong
        ? "AI and leads become more relevant."
        : "Description and website make drafts and leads much better.",
      to: "/company",
      cta: args.profileStrong ? "Open Company" : "Fill in Company",
      done: args.profileStrong,
    });
  }

  return steps;
}

export function firstWinProgress(steps: FirstWinStep[]): {
  done: number;
  total: number;
  percent: number;
  allDone: boolean;
} {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  return {
    done,
    total,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    allDone: total > 0 && done >= total,
  };
}
