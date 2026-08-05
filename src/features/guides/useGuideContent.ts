import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getGuide, type GuideDefinition, type GuideId } from "./guideCatalog";

export type GuideStepContent = {
  title: string;
  detail?: string;
  /** Route this step happens on, when it is somewhere else in the portal. */
  to?: string;
};

export type GuideContent = {
  id: GuideId;
  definition: GuideDefinition;
  title: string;
  why: string;
  result?: string;
  steps: GuideStepContent[];
};

type RawStep = { title?: unknown; detail?: unknown };

/** i18next returns `unknown` for object lookups — narrow before rendering. */
function toSteps(raw: unknown): RawStep[] {
  return Array.isArray(raw) ? (raw as RawStep[]) : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/**
 * Resolve one guide's copy for the active language and merge in the routes
 * from the catalog. Returns null for an unknown id so callers can simply not
 * render a trigger.
 */
export function useGuideContent(id: string | null | undefined): GuideContent | null {
  const { t } = useTranslation("guides");

  return useMemo(() => {
    const definition = getGuide(id);
    if (!definition) return null;

    const title = text(t(`${definition.id}.title`));
    if (!title) return null;

    const steps: GuideStepContent[] = [];
    toSteps(t(`${definition.id}.steps`, { returnObjects: true })).forEach((step, index) => {
      const stepTitle = text(step?.title);
      if (!stepTitle) return;
      steps.push({
        title: stepTitle,
        detail: text(step?.detail),
        to: definition.stepLinks?.[index],
      });
    });

    if (steps.length === 0) return null;

    return {
      id: definition.id,
      definition,
      title,
      why: text(t(`${definition.id}.why`)) ?? "",
      result: text(t(`${definition.id}.result`)),
      steps,
    };
    // `t` changes identity on language switch, so the guide re-resolves.
  }, [id, t]);
}
