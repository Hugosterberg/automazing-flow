import type { ApiaiTool } from "./apiaiClient";

export type ApiaiDocumentedImageAction = {
  id: string;
  title: string;
  description: string;
  docsEndpoint: string;
  defaultOutputFilename: string;
  promptPlaceholder?: string;
  matchSlugs: string[];
  matchNames: string[];
  toolTypes?: ApiaiTool["type"][];
};

export const APIAI_DOCUMENTED_IMAGE_ACTIONS: ApiaiDocumentedImageAction[] = [
  {
    id: "remove-background",
    title: "Remove background",
    description: "Uses the documented image-editing pattern: POST image to an apiai.me processing endpoint.",
    docsEndpoint: "/api/process/remove-bg",
    defaultOutputFilename: "background-removed",
    matchSlugs: ["remove-bg", "remove-background", "background-removal", "background-remover", "bg-remove"],
    matchNames: ["remove background", "background remover", "background removal", "remove bg", "bg remove"],
  },
  {
    id: "enhance-image",
    title: "Enhance / upscale image",
    description: "Runs an image enhancement workflow when your apiai.me account exposes one.",
    docsEndpoint: "/api/process/your-tool-slug",
    defaultOutputFilename: "enhanced-image",
    promptPlaceholder: "Improve quality, lighting, and product clarity while preserving the original subject.",
    matchSlugs: ["enhance", "image-enhance", "enhance-image", "upscale", "image-upscale", "upscaler"],
    matchNames: ["enhance", "image enhance", "upscale", "upscaler", "improve quality"],
  },
  {
    id: "product-pipeline",
    title: "Run image pipeline",
    description: "Uses apiai.me's documented pipeline pattern for multi-step image transformations.",
    docsEndpoint: "/api/pipeline/{slug} or /api/flow/{slug}",
    defaultOutputFilename: "pipeline-result",
    promptPlaceholder: "Create a clean, ready-to-publish marketing asset from this image.",
    matchSlugs: ["product", "product-image", "logo-digitalize", "image-pipeline", "campaign-asset"],
    matchNames: ["product", "logo digitalize", "pipeline", "campaign asset", "marketing asset"],
    toolTypes: ["pipeline", "flow"],
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}

export function findToolForAction(
  action: ApiaiDocumentedImageAction,
  tools: ApiaiTool[]
): ApiaiTool | null {
  const allowedTypes = action.toolTypes ? new Set(action.toolTypes) : null;
  const normalizedSlugs = new Set(action.matchSlugs.map(normalize));
  const normalizedNames = action.matchNames.map(normalize);

  return (
    tools.find((tool) => {
      if (allowedTypes && !allowedTypes.has(tool.type)) return false;
      const slug = normalize(tool.slug);
      const name = normalize(tool.name);
      if (normalizedSlugs.has(slug)) return true;
      return normalizedNames.some((needle) => name.includes(needle) || slug.includes(needle));
    }) ?? null
  );
}
