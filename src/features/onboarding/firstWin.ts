import type { ProfileKind } from "@/types/businessProfile";
import type { AccountPlatform } from "@/types/accounts";

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
        why: "Få mail i Meddelanden och AI-utkast du godkänner innan sändning.",
        query: "gmail",
      },
      {
        platform: "google_calendar",
        title: "Google Calendar",
        why: "Se dagens möten på Hem och i Kalender.",
        query: "calendar",
      },
      {
        platform: "instagram",
        title: "Instagram",
        why: "DM:s och social inkorg på ett ställe.",
        query: "instagram",
      },
    ];
  }
  return [
    {
      platform: "gmail",
      title: "Gmail",
      why: "Triagera kundmail (Idag/Vecka) och svara med AI-utkast.",
      query: "gmail",
    },
    {
      platform: "instagram",
      title: "Instagram",
      why: "DM-automationer och social inkorg för kundkontakt.",
      query: "instagram",
    },
    {
      platform: "shopify",
      title: "Shopify",
      why: "Ordrar, lager och kundvagnsåtervinning under E-handel.",
      query: "shopify",
    },
  ];
}

export function buildFirstWinSteps(args: {
  kind: ProfileKind | null | undefined;
  connectedPlatforms: Iterable<string>;
  profileStrong: boolean;
}): FirstWinStep[] {
  const platforms = new Set(
    [...args.connectedPlatforms].map((p) => String(p || "").toLowerCase())
  );
  const hasMail = platforms.has("gmail") || platforms.has("outlook");
  const hasChannel =
    platforms.has("instagram") ||
    platforms.has("facebook") ||
    platforms.has("whatsapp") ||
    platforms.has("tiktok") ||
    platforms.has("shopify") ||
    platforms.has("google_calendar") ||
    platforms.has("outlook_calendar");

  const steps: FirstWinStep[] = [
    {
      id: "connect_mail",
      title: hasMail ? "Mail är kopplat" : "Koppla mail",
      detail: hasMail
        ? "Du kan triagera och svara under Meddelanden."
        : "Gmail eller Outlook — första steget till en inkorg som faktiskt hjälper dig.",
      to: "/connections?wizard=1&q=gmail",
      cta: hasMail ? "Öppna Kopplingar" : "Koppla mail",
      done: hasMail,
    },
    {
      id: "connect_channel",
      title: hasChannel ? "Kanal kopplad" : "Koppla en kanal till",
      detail: hasChannel
        ? "Socialt, kalender eller butik synkas in i appen."
        : args.kind === "personal"
          ? "Kalender eller Instagram ger dig mer än bara mail."
          : "Instagram eller Shopify ger dig DM:s och ordrar i samma arbetsyta.",
      to: "/connections?wizard=1",
      cta: hasChannel ? "Hantera kopplingar" : "Välj kanal",
      done: hasChannel,
    },
    {
      id: "open_inbox",
      title: "Öppna Meddelanden",
      detail: "Se Idag-bucketen, AI-utkast och godkänn innan något skickas.",
      to: "/messages?bucket=today",
      cta: "Öppna Meddelanden",
      done: hasMail || platforms.has("instagram") || platforms.has("facebook"),
    },
    {
      id: "enable_automation",
      title: "Slå på en automation",
      detail: "T.ex. AI-utkast för DM eller mail — utkast före sändning där det är känsligt.",
      to: "/automations?tab=messages",
      cta: "Öppna Automationer",
      done: false, // user action; checked via completedStepIds in UI layer if needed
    },
  ];

  if (args.kind !== "personal") {
    steps.push({
      id: "fill_company",
      title: args.profileStrong ? "Bolagsprofilen är redo" : "Fyll i Företag",
      detail: args.profileStrong
        ? "AI och leads blir mer relevanta."
        : "Beskrivning och webb gör utkast och leads mycket bättre.",
      to: "/company",
      cta: args.profileStrong ? "Öppna Företag" : "Fyll i Företag",
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
