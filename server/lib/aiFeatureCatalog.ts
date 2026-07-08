/**
 * One authoritative catalog of every AI feature in Automazing and what it
 * needs to run. The Preferences → AI tab renders this so "which AI features
 * are on, and how do I turn the rest on?" has a single, accurate answer
 * instead of being scattered across module UIs.
 *
 * Pure: takes resolved capability flags, returns statuses. Unit-tested.
 * When adding an AI feature elsewhere, add its entry here too.
 */

export interface AiFeatureFlags {
  /** This business profile has its own OPENAI_API_KEY secret. */
  openaiTenant: boolean;
  /** The platform has a global OPENAI_API_KEY env var. */
  openaiPlatform: boolean;
  /** apiai.me key available (tenant secret or platform env). */
  apiai: boolean;
  /** Zernio (social/inbox provider) configured at platform level. */
  zernio: boolean;
  /** Scheduled jobs are enabled (CRON_SECRET set). */
  cron: boolean;
}

export type AiFeatureState = "active" | "limited" | "inactive";

export interface AiFeatureStatus {
  id: string;
  /** Which part of the app the feature lives in. */
  area: string;
  name: string;
  description: string;
  state: AiFeatureState;
  /** Why the feature is in this state, in one sentence. */
  detail: string;
  /** What to do to (fully) activate it; null when already fully active. */
  activation: string | null;
}

const OPENAI_ACTIVATION =
  "Add an OpenAI API key: per profile under Preferences → Integrations → Profile secrets, or as the platform OPENAI_API_KEY env var.";

function openAiSourceDetail(flags: AiFeatureFlags): string {
  return flags.openaiTenant
    ? "Fully active with this profile's own OpenAI key."
    : "Fully active via the platform OpenAI key.";
}

/** Feature that works without a key but gets real AI with one. */
function openAiBacked(
  flags: AiFeatureFlags,
  base: Pick<AiFeatureStatus, "id" | "area" | "name" | "description">,
  limitedDetail: string
): AiFeatureStatus {
  const openai = flags.openaiTenant || flags.openaiPlatform;
  return openai
    ? { ...base, state: "active", detail: openAiSourceDetail(flags), activation: null }
    : { ...base, state: "limited", detail: limitedDetail, activation: OPENAI_ACTIVATION };
}

export function buildAiFeatureStatus(flags: AiFeatureFlags): AiFeatureStatus[] {
  const openai = flags.openaiTenant || flags.openaiPlatform;

  const features: AiFeatureStatus[] = [
    openAiBacked(
      flags,
      {
        id: "task-assist",
        area: "Tasks",
        name: "AI task preparation",
        description:
          "The sparkle button on a task: step plan, research notes, ready-to-use drafts and blocking questions.",
      },
      "Basic mode: adds a generic step plan without task-specific analysis, research or drafts."
    ),
    openAiBacked(
      flags,
      {
        id: "content-ideas",
        area: "Content",
        name: "AI content ideas",
        description: "Post concepts and captions tailored to your business and audience.",
      },
      "Basic mode: generic idea templates instead of business-specific suggestions."
    ),
    {
      id: "image-generation",
      area: "Content",
      name: "AI image generation",
      description: "Generate social-ready images from a prompt in Content → Create.",
      ...(openai
        ? { state: "active" as const, detail: openAiSourceDetail(flags), activation: null }
        : {
            state: "inactive" as const,
            detail: "No OpenAI key configured — image generation has no fallback.",
            activation: OPENAI_ACTIVATION,
          }),
    },
    {
      id: "apiai-tools",
      area: "Content",
      name: "Create tools & pipelines (apiai.me)",
      description: "External AI tools, workflows and batch pipelines in Content → Create.",
      ...(flags.apiai
        ? { state: "active" as const, detail: "apiai.me key is configured.", activation: null }
        : {
            state: "inactive" as const,
            detail: "No apiai.me key configured.",
            activation:
              "Add APIAI_API_KEY under Preferences → Integrations → Profile secrets (or as a platform env var).",
          }),
    },
    openAiBacked(
      flags,
      {
        id: "review-reply-drafts",
        area: "Reviews",
        name: "AI review reply drafts",
        description: "Suggested replies to customer reviews, tone-matched to the review.",
      },
      "Basic mode: simple template replies instead of AI-written drafts."
    ),
    {
      id: "dm-auto-reply",
      area: "Inbox",
      name: "AI DM auto-reply",
      description: "Automatic AI-drafted replies to incoming direct messages.",
      ...(!flags.zernio
        ? {
            state: "inactive" as const,
            detail: "Zernio is not configured — the shared inbox that auto-reply reads from is unavailable.",
            activation:
              "Set ZERNIO_API_KEY as a platform env var (with the Inbox add-on enabled), then add an OpenAI key for AI-written replies.",
          }
        : openai
          ? {
              state: "active" as const,
              detail: "Zernio Inbox and an OpenAI key are both configured.",
              activation: null,
            }
          : {
              state: "limited" as const,
              detail: "Inbox is connected, but replies fall back to simple templates without an OpenAI key.",
              activation: OPENAI_ACTIVATION,
            }),
    },
    openAiBacked(
      flags,
      {
        id: "sales-ai",
        area: "Sales",
        name: "Sales & outreach AI",
        description:
          "Lead suggestions, outreach discovery, the sales playbook and outreach message drafts.",
      },
      "Basic mode: generic suggestions and templates instead of business-specific ones."
    ),
    {
      id: "ai-recommendations",
      area: "Insights",
      name: "AI recommendations",
      description: "The AI Recommendations feed that analyzes your accounts, tasks and content.",
      ...(flags.openaiPlatform
        ? {
            state: "active" as const,
            detail: "Platform OpenAI key is configured.",
            activation: null,
          }
        : {
            state: "inactive" as const,
            detail:
              "Runs on the platform OpenAI key only — a per-profile key does not apply here.",
            activation: "Set OPENAI_API_KEY as a platform environment variable.",
          }),
    },
    {
      id: "scheduled-ai-jobs",
      area: "Automations",
      name: "Scheduled AI jobs",
      description:
        "Cron-driven AI work: content seeding, review reply drafting, outreach for stale leads, marketing alerts.",
      ...(!flags.cron
        ? {
            state: "inactive" as const,
            detail: "Scheduled jobs are disabled — CRON_SECRET is not set.",
            activation:
              "Set CRON_SECRET (platform env) and configure the cron schedule; add an OpenAI key for the AI steps.",
          }
        : openai
          ? {
              state: "active" as const,
              detail: "Cron is enabled and an OpenAI key is available.",
              activation: null,
            }
          : {
              state: "limited" as const,
              detail: "Cron runs, but AI steps are skipped or fall back to templates without an OpenAI key.",
              activation: OPENAI_ACTIVATION,
            }),
    },
  ];

  return features;
}
