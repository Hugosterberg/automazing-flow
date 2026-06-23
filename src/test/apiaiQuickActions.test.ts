import { describe, expect, it } from "vitest";
import { APIAI_DOCUMENTED_IMAGE_ACTIONS, findToolForAction } from "@/features/content/apiaiQuickActions";
import type { ApiaiTool } from "@/features/content/apiaiClient";

function tool(overrides: Partial<ApiaiTool>): ApiaiTool {
  return {
    slug: "demo",
    name: "Demo",
    endpoint: "/api/process/demo",
    type: "workflow",
    acceptedInputs: ["image"],
    requiredInputs: ["image"],
    outputTypes: ["image"],
    params: [],
    ...overrides,
  };
}

describe("apiai quick actions", () => {
  it("matches the documented remove-bg workflow by slug", () => {
    const action = APIAI_DOCUMENTED_IMAGE_ACTIONS.find((item) => item.id === "remove-background");
    expect(action).toBeTruthy();
    expect(findToolForAction(action!, [tool({ slug: "remove-bg", name: "Remove BG" })])?.slug).toBe("remove-bg");
  });

  it("matches background tools by name even if the account slug differs", () => {
    const action = APIAI_DOCUMENTED_IMAGE_ACTIONS.find((item) => item.id === "remove-background");
    expect(findToolForAction(action!, [tool({ slug: "custom-42", name: "Background Remover Pro" })])?.slug).toBe(
      "custom-42"
    );
  });

  it("keeps pipeline quick actions on pipeline/flow tools", () => {
    const action = APIAI_DOCUMENTED_IMAGE_ACTIONS.find((item) => item.id === "product-pipeline");
    const workflow = tool({ slug: "product-image", name: "Product image", type: "workflow" });
    const pipeline = tool({ slug: "logo-digitalize", name: "Logo Digitalize", type: "pipeline" });
    expect(findToolForAction(action!, [workflow, pipeline])?.slug).toBe("logo-digitalize");
  });
});
