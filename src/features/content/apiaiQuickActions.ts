import type { ApiaiTool } from "./apiaiClient";

export type ApiaiDocumentedImageAction = {
  id: string;
  docsEndpoint: string;
  defaultOutputFilename: string;
  promptPlaceholder?: string;
  matchSlugs: string[];
  matchNames: string[];
  toolTypes?: ApiaiTool["type"][];
  /** When true, allow running via the documented endpoint even if the tool is not listed. */
  directEndpoint?: string;
  requiresImage?: boolean;
  requiresPrompt?: boolean;
};

export const APIAI_DOCUMENTED_IMAGE_ACTIONS: ApiaiDocumentedImageAction[] = [
  {
    id: "remove-background",
    docsEndpoint: "/api/process/remove-bg",
    directEndpoint: "/api/process/remove-bg",
    defaultOutputFilename: "background-removed",
    matchSlugs: ["remove-bg", "remove-background", "background-removal", "background-remover", "bg-remove"],
    matchNames: ["remove background", "background remover", "background removal", "remove bg", "bg remove"],
    requiresImage: true,
  },
  {
    id: "enhance-image",
    docsEndpoint: "/api/process/your-tool-slug",
    defaultOutputFilename: "enhanced-image",
    promptPlaceholder: "Improve quality, lighting, and product clarity while preserving the original subject.",
    matchSlugs: ["enhance", "image-enhance", "enhance-image", "upscale", "image-upscale", "upscaler"],
    matchNames: ["enhance", "image enhance", "upscale", "upscaler", "improve quality"],
    requiresImage: true,
  },
  {
    id: "greyscale",
    docsEndpoint: "/api/process/greyscale",
    directEndpoint: "/api/process/greyscale",
    defaultOutputFilename: "greyscale",
    matchSlugs: ["greyscale", "grayscale", "black-and-white", "bw"],
    matchNames: ["greyscale", "grayscale", "black and white"],
    requiresImage: true,
  },
  {
    id: "product-pipeline",
    docsEndpoint: "/api/pipeline/{slug} or /api/flow/{slug}",
    defaultOutputFilename: "pipeline-result",
    promptPlaceholder: "Create a clean, ready-to-publish marketing asset from this image.",
    matchSlugs: ["product", "product-image", "logo-digitalize", "image-pipeline", "campaign-asset"],
    matchNames: ["product", "logo digitalize", "pipeline", "campaign asset", "marketing asset"],
    toolTypes: ["pipeline", "flow"],
    requiresImage: true,
  },
  {
    id: "quality-gate",
    docsEndpoint: "/api/quality-gate",
    directEndpoint: "/api/quality-gate",
    defaultOutputFilename: "quality-report",
    matchSlugs: ["quality-gate", "quality", "qa"],
    matchNames: ["quality gate", "quality check", "qa"],
    requiresImage: true,
  },
  {
    id: "moderation",
    docsEndpoint: "/api/moderation/check-image",
    directEndpoint: "/api/moderation/check-image",
    defaultOutputFilename: "moderation-result",
    matchSlugs: ["moderation", "check-image", "safe-content"],
    matchNames: ["moderation", "check image", "safe content"],
    requiresImage: true,
  },
  {
    id: "resize-crop",
    docsEndpoint: "/api/process/resize",
    directEndpoint: "/api/process/resize",
    defaultOutputFilename: "resized",
    matchSlugs: ["resize", "crop", "smart-crop", "fit", "aspect"],
    matchNames: ["resize", "crop", "smart crop", "aspect ratio"],
    requiresImage: true,
  },
  {
    id: "shadow-reflection",
    docsEndpoint: "/api/process/product-shadow",
    directEndpoint: "/api/process/product-shadow",
    defaultOutputFilename: "product-shadow",
    matchSlugs: ["shadow", "reflection", "product-shadow", "drop-shadow"],
    matchNames: ["shadow", "reflection", "product shadow"],
    requiresImage: true,
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}

export function resolveDocsEndpoint(action: ApiaiDocumentedImageAction, tool?: ApiaiTool | null): string {
  if (tool?.endpoint) return tool.endpoint;
  if (action.directEndpoint) return action.directEndpoint;
  const slug = action.matchSlugs[0] || "your-tool-slug";
  if (action.docsEndpoint.includes("{slug}")) {
    if (tool?.type === "flow") return `/api/flow/${encodeURIComponent(slug)}`;
    return `/api/pipeline/${encodeURIComponent(slug)}`;
  }
  if (action.docsEndpoint.includes("your-tool-slug")) {
    return `/api/process/${encodeURIComponent(slug)}`;
  }
  return action.docsEndpoint.split(" ")[0] || action.docsEndpoint;
}

export function syntheticToolFromAction(
  action: ApiaiDocumentedImageAction,
  endpoint: string,
  labels?: { name: string; description: string }
): ApiaiTool {
  const needsImage = action.requiresImage !== false;
  return {
    slug: action.id,
    name: labels?.name ?? action.id,
    description: labels?.description ?? "",
    endpoint,
    type: endpoint.includes("/flow/") ? "flow" : endpoint.includes("/pipeline/") ? "pipeline" : "workflow",
    acceptedInputs: needsImage ? ["image", "prompt"] : ["prompt"],
    requiredInputs: needsImage ? ["image"] : [],
    outputTypes: endpoint.includes("moderation") || endpoint.includes("quality-gate") ? ["json"] : ["image"],
    params: [],
    supportsPrompt: Boolean(action.promptPlaceholder) || !needsImage,
    maxImages: 1,
  };
}

export function findToolForAction(
  action: ApiaiDocumentedImageAction,
  tools: ApiaiTool[],
  labels?: { name: string; description: string }
): ApiaiTool | null {
  const allowedTypes = action.toolTypes ? new Set(action.toolTypes) : null;
  const normalizedSlugs = new Set(action.matchSlugs.map(normalize));
  const normalizedNames = action.matchNames.map(normalize);

  const matched =
    tools.find((tool) => {
      if (allowedTypes && !allowedTypes.has(tool.type)) return false;
      const slug = normalize(tool.slug);
      const name = normalize(tool.name);
      if (normalizedSlugs.has(slug)) return true;
      return normalizedNames.some((needle) => name.includes(needle) || slug.includes(needle));
    }) ?? null;

  if (matched) return matched;
  if (!action.directEndpoint && !action.docsEndpoint.includes("your-tool-slug")) return null;
  return syntheticToolFromAction(action, resolveDocsEndpoint(action), labels);
}

export function groupToolsByType(tools: ApiaiTool[]): Record<ApiaiTool["type"], ApiaiTool[]> {
  return {
    workflow: tools.filter((t) => t.type === "workflow"),
    pipeline: tools.filter((t) => t.type === "pipeline"),
    flow: tools.filter((t) => t.type === "flow"),
  };
}
