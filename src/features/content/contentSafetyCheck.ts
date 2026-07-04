import type { SelectedContentAsset } from "@/lib/contentSelection";
import { APIAI_DOCUMENTED_IMAGE_ACTIONS, findToolForAction } from "./apiaiQuickActions";
import { insightFromApiaiResult, type PublishReadiness } from "./apiaiResultInsights";
import { listApiaiTools, runApiaiTool } from "./apiaiClient";

const MODERATION_ACTION = APIAI_DOCUMENTED_IMAGE_ACTIONS.find((action) => action.id === "moderation");
const QUALITY_ACTION = APIAI_DOCUMENTED_IMAGE_ACTIONS.find((action) => action.id === "quality-gate");

export async function runContentSafetyCheck(input: {
  businessProfileId: string;
  assets: SelectedContentAsset[];
  kind: "moderation" | "quality-gate";
}): Promise<{ readiness: PublishReadiness; toolName: string }> {
  const action = input.kind === "moderation" ? MODERATION_ACTION : QUALITY_ACTION;
  if (!action) throw new Error("Safety check action is not configured.");

  const tools = await listApiaiTools(input.businessProfileId);
  const tool = findToolForAction(action, tools);
  if (!tool) throw new Error("apiai.me moderation tools are not available for this account.");

  const imageAssets = input.assets.filter((asset) => asset.kind === "image");
  if (imageAssets.length === 0) {
    throw new Error("Select at least one image before running a safety check.");
  }

  const result = await runApiaiTool({
    businessProfileId: input.businessProfileId,
    tool,
    prompt: input.kind === "moderation" ? "" : "Is this image ready to publish on social media?",
    params: {},
    assets: imageAssets.slice(0, 1),
    outputFilename: action.defaultOutputFilename,
  });

  const readiness = insightFromApiaiResult(result, tool);
  if (!readiness) {
    throw new Error("Safety check finished but returned an unexpected format.");
  }

  return { readiness, toolName: tool.name };
}
