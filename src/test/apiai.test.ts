// @vitest-environment node
// Server-provider tests: use the Node environment so global fetch and
// AbortSignal.timeout match the runtime the server actually executes in.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkApiaiHealth,
  imageFieldNamesForTool,
  makeApiaiUrl,
  normalizeFlow,
  normalizeWorkflow,
  parseApiaiError,
  requiresImage,
  type ApiaiTool,
} from "../../server/providers/apiai.ts";

function tool(overrides: Partial<ApiaiTool> = {}): ApiaiTool {
  return {
    slug: "demo",
    name: "Demo",
    endpoint: "/api/workflow/demo",
    type: "workflow",
    acceptedInputs: [],
    requiredInputs: [],
    outputTypes: [],
    params: [],
    ...overrides,
  };
}

describe("makeApiaiUrl", () => {
  it("normalizes /api-prefixed endpoints", () => {
    expect(makeApiaiUrl("/api/workflows")).toBe("https://apiai.me/api/workflows");
  });
  it("handles bare and slashless endpoints", () => {
    expect(makeApiaiUrl("workflows")).toBe("https://apiai.me/api/workflows");
    expect(makeApiaiUrl("/flow/x")).toBe("https://apiai.me/api/flow/x");
  });
});

describe("normalizeWorkflow", () => {
  it("requires slug and endpoint", () => {
    expect(normalizeWorkflow({ slug: "", endpoint: "/x" })).toBeNull();
    expect(normalizeWorkflow({ slug: "x", endpoint: "" })).toBeNull();
  });
  it("maps snake_case fields and defaults type to workflow", () => {
    const t = normalizeWorkflow({
      slug: "bg-remove",
      name: "Background remover",
      endpoint: "/api/workflow/bg-remove",
      type: "weird",
      accepted_inputs: ["image", "prompt"],
      required_inputs: ["image"],
      max_images: 3,
      price_per_request: 0.02,
    });
    expect(t).toMatchObject({
      slug: "bg-remove",
      name: "Background remover",
      type: "workflow",
      acceptedInputs: ["image", "prompt"],
      requiredInputs: ["image"],
      maxImages: 3,
      pricePerRequest: 0.02,
    });
  });
  it("keeps the pipeline type", () => {
    expect(normalizeWorkflow({ slug: "p", endpoint: "/e", type: "pipeline" })?.type).toBe("pipeline");
  });
});

describe("normalizeFlow", () => {
  it("derives the endpoint from the slug and marks image-first flows required", () => {
    const t = normalizeFlow({ slug: "ad maker", first_step_requires_image: true });
    expect(t?.endpoint).toBe("/api/flow/ad%20maker");
    expect(t?.requiredInputs).toEqual(["image"]);
    expect(t?.type).toBe("flow");
  });
  it("defaults to prompt-first when no image is required", () => {
    const t = normalizeFlow({ slug: "story" });
    expect(t?.requiredInputs).toEqual([]);
    expect(t?.acceptedInputs[0]).toBe("prompt");
  });
});

describe("imageFieldNamesForTool / requiresImage", () => {
  it("prefers explicit image params (expose_name wins)", () => {
    const t = tool({ params: [{ name: "img", expose_name: "photo", is_image: true }] });
    expect(imageFieldNamesForTool(t)).toEqual(["photo"]);
  });
  it("falls back to the accepted inputs", () => {
    expect(imageFieldNamesForTool(tool({ acceptedInputs: ["image"] }))).toEqual(["image"]);
    expect(imageFieldNamesForTool(tool({ acceptedInputs: ["video"] }))).toEqual(["video"]);
    expect(imageFieldNamesForTool(tool())).toEqual([]);
  });
  it("detects required media from inputs or required image params", () => {
    expect(requiresImage(tool({ requiredInputs: ["image"] }))).toBe(true);
    expect(requiresImage(tool({ requiredInputs: ["video"] }))).toBe(true);
    expect(requiresImage(tool({ params: [{ is_image: true, required: true }] }))).toBe(true);
    expect(requiresImage(tool({ acceptedInputs: ["image"] }))).toBe(false);
  });
});

describe("parseApiaiError", () => {
  it("pulls a message out of common JSON error shapes", async () => {
    expect(await parseApiaiError(new Response(JSON.stringify({ error: "bad key" }), { status: 401 }))).toBe("bad key");
    expect(
      await parseApiaiError(new Response(JSON.stringify({ error: { message: "nested" } }), { status: 400 }))
    ).toBe("nested");
    expect(await parseApiaiError(new Response(JSON.stringify({ message: "top" }), { status: 400 }))).toBe("top");
  });
  it("falls back to raw text", async () => {
    expect(await parseApiaiError(new Response("plain failure", { status: 500 }))).toBe("plain failure");
  });
});

describe("checkApiaiHealth", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports a missing key without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const health = await checkApiaiHealth(null);
    expect(health.ok).toBe(false);
    expect(health.keyConfigured).toBe(false);
    expect(health.error).toMatch(/not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("flags a rejected key (401) as reachable but unauthorized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid api key" }), { status: 401 })
    );
    const health = await checkApiaiHealth("bad-key");
    expect(health.reachable).toBe(true);
    expect(health.authorized).toBe(false);
    expect(health.status).toBe(401);
    expect(health.error).toMatch(/rejected the API key/i);
  });

  it("reports network failures clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const health = await checkApiaiHealth("k");
    expect(health.reachable).toBe(false);
    expect(health.error).toMatch(/Could not reach apiai\.me/);
  });

  it("counts workflows and flows on success", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/workflows")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ slug: "a", endpoint: "/api/workflow/a", name: "A" }]), { status: 200 })
        );
      }
      if (url.endsWith("/flows")) {
        return Promise.resolve(new Response(JSON.stringify([{ slug: "f", name: "F" }]), { status: 200 }));
      }
      return Promise.resolve(new Response("[]", { status: 200 }));
    });
    const health = await checkApiaiHealth("good-key");
    expect(health.ok).toBe(true);
    expect(health.authorized).toBe(true);
    expect(health.workflowCount).toBe(1);
    expect(health.flowCount).toBe(1);
    expect(health.toolCount).toBe(2);
    expect(health.sampleTools.length).toBe(2);
  });
});
