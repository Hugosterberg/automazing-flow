/**
 * apiai.me provider: pure helpers for talking to https://apiai.me/api.
 *
 * Kept free of Express/Drive/auth concerns so the request-shaping and
 * response-normalization logic can be unit-tested without a network or a
 * server. The route layer (apiaiRoutes) wires these into HTTP handlers.
 */

export const APIAI_BASE_URL = "https://apiai.me/api";
export const APIAI_TIMEOUT_MS = 50_000;

export type ApiaiParam = {
  name?: string;
  expose_name?: string;
  description?: string;
  default_value?: unknown;
  allowed_values?: unknown[];
  required?: boolean;
  is_image?: boolean;
};

export type ApiaiTool = {
  id?: number | string;
  slug: string;
  name: string;
  description?: string;
  endpoint: string;
  type: "workflow" | "pipeline" | "flow";
  acceptedInputs: string[];
  requiredInputs: string[];
  responseType?: string;
  outputTypes: string[];
  params: ApiaiParam[];
  supportsPrompt?: boolean;
  maxImages?: number;
  pricePerRequest?: number | null;
};

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeParams(value: unknown): ApiaiParam[] {
  return Array.isArray(value) ? (value as ApiaiParam[]) : [];
}

export function normalizeWorkflow(raw: Record<string, unknown>): ApiaiTool | null {
  const slug = String(raw.slug || "").trim();
  const endpoint = String(raw.endpoint || "").trim();
  if (!slug || !endpoint) return null;
  const type = raw.type === "pipeline" ? "pipeline" : "workflow";
  const params = normalizeParams(raw.params);
  return {
    id: typeof raw.id === "number" || typeof raw.id === "string" ? raw.id : undefined,
    slug,
    name: String(raw.name || slug),
    description: String(raw.description || ""),
    endpoint,
    type,
    acceptedInputs: normalizeStringArray(raw.accepted_inputs),
    requiredInputs: normalizeStringArray(raw.required_inputs),
    responseType: String(raw.response_type || ""),
    outputTypes: normalizeStringArray(raw.output_types),
    params,
    supportsPrompt: raw.supports_prompt == null ? undefined : Boolean(raw.supports_prompt),
    maxImages: typeof raw.max_images === "number" ? raw.max_images : undefined,
    pricePerRequest: typeof raw.price_per_request === "number" ? raw.price_per_request : null,
  };
}

export function normalizeFlow(raw: Record<string, unknown>): ApiaiTool | null {
  const slug = String(raw.slug || "").trim();
  if (!slug) return null;
  const params = normalizeParams(raw.params);
  const firstStepRequiresImage = Boolean(raw.first_step_requires_image);
  return {
    id: typeof raw.id === "number" || typeof raw.id === "string" ? raw.id : undefined,
    slug,
    name: String(raw.name || slug),
    description: String(raw.description || ""),
    endpoint: `/api/flow/${encodeURIComponent(slug)}`,
    type: "flow",
    acceptedInputs: firstStepRequiresImage ? ["image", "prompt"] : ["prompt", "image"],
    requiredInputs: firstStepRequiresImage ? ["image"] : [],
    responseType: String(raw.response_type || ""),
    outputTypes: normalizeStringArray(raw.output_types),
    params,
    supportsPrompt: raw.supports_prompt == null ? true : Boolean(raw.supports_prompt),
    pricePerRequest: typeof raw.price_per_request === "number" ? raw.price_per_request : null,
  };
}

/** Turn an apiai endpoint (`/api/workflows`, `workflows`, …) into a full URL. */
export function makeApiaiUrl(endpoint: string): string {
  const clean = endpoint.startsWith("/api/") ? endpoint.slice(4) : endpoint;
  return `${APIAI_BASE_URL}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

/** Best-effort extraction of a human-readable error from an apiai response. */
export async function parseApiaiError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  if (!body) return res.statusText || "apiai_request_failed";
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed?.error?.message === "string") return parsed.error.message;
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // fall through to plain text
  }
  return body.slice(0, 500);
}

async function fetchApiaiJson(apiKey: string, endpoint: string): Promise<unknown[]> {
  const res = await fetch(makeApiaiUrl(endpoint), {
    headers: { "X-API-Key": apiKey },
    signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(await parseApiaiError(res));
  }
  const body = await res.json().catch(() => []);
  return Array.isArray(body) ? body : [];
}

export async function listTools(apiKey: string): Promise<ApiaiTool[]> {
  const [workflowRows, flowRows] = await Promise.all([
    fetchApiaiJson(apiKey, "/api/workflows"),
    fetchApiaiJson(apiKey, "/api/flows").catch(() => []),
  ]);
  const workflows = workflowRows
    .map((row) => normalizeWorkflow(row as Record<string, unknown>))
    .filter((tool): tool is ApiaiTool => Boolean(tool));
  const flows = flowRows
    .map((row) => normalizeFlow(row as Record<string, unknown>))
    .filter((tool): tool is ApiaiTool => Boolean(tool));
  return [...workflows, ...flows];
}

export function imageFieldNamesForTool(tool: ApiaiTool): string[] {
  const fromParams = tool.params
    .filter((param) => Boolean(param.is_image))
    .map((param) => String(param.expose_name || param.name || "").trim())
    .filter(Boolean);
  if (fromParams.length > 0) return fromParams;
  const inputs = [...tool.requiredInputs, ...tool.acceptedInputs].map((input) => input.toLowerCase());
  if (inputs.includes("image")) return ["image"];
  if (inputs.includes("video")) return ["video"];
  return [];
}

export function requiresImage(tool: ApiaiTool): boolean {
  return (
    tool.requiredInputs.some(
      (input) => input.toLowerCase() === "image" || input.toLowerCase() === "video"
    ) || tool.params.some((param) => Boolean(param.required && param.is_image))
  );
}

export type ApiaiHealth = {
  ok: boolean;
  keyConfigured: boolean;
  reachable: boolean;
  authorized: boolean;
  status: number | null;
  latencyMs: number | null;
  toolCount: number;
  workflowCount: number;
  flowCount: number;
  sampleTools: Array<{ slug: string; name: string; type: string }>;
  error: string | null;
};

/**
 * One-shot connectivity + auth probe against apiai.me. Never throws — it always
 * resolves to a structured {@link ApiaiHealth} so callers (the health endpoint
 * and the smoke script) can render a precise diagnosis: missing key vs.
 * unreachable host vs. rejected key vs. healthy.
 */
export async function checkApiaiHealth(apiKey: string | null | undefined): Promise<ApiaiHealth> {
  const base: ApiaiHealth = {
    ok: false,
    keyConfigured: Boolean(apiKey),
    reachable: false,
    authorized: false,
    status: null,
    latencyMs: null,
    toolCount: 0,
    workflowCount: 0,
    flowCount: 0,
    sampleTools: [],
    error: null,
  };

  if (!apiKey) {
    return { ...base, error: "APIAI_API_KEY is not configured." };
  }

  const startedAt = Date.now();
  let workflowsRes: Response;
  try {
    workflowsRes = await fetch(makeApiaiUrl("/api/workflows"), {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return {
      ...base,
      latencyMs: Date.now() - startedAt,
      error: isTimeout
        ? "apiai.me did not respond before the timeout (network or service issue)."
        : `Could not reach apiai.me: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const latencyMs = Date.now() - startedAt;
  const reachable = true;
  const status = workflowsRes.status;
  const authorized = workflowsRes.ok;

  if (!workflowsRes.ok) {
    const detail = await parseApiaiError(workflowsRes);
    return {
      ...base,
      reachable,
      authorized,
      status,
      latencyMs,
      error:
        status === 401 || status === 403
          ? `apiai.me rejected the API key (${status}): ${detail}`
          : `apiai.me returned ${status}: ${detail}`,
    };
  }

  // Authorized — enumerate tools so the caller sees what's actually available.
  let tools: ApiaiTool[];
  try {
    tools = await listTools(apiKey);
  } catch (error) {
    return {
      ...base,
      reachable,
      authorized,
      status,
      latencyMs,
      error: `Authorized, but listing tools failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const workflowCount = tools.filter((t) => t.type !== "flow").length;
  const flowCount = tools.filter((t) => t.type === "flow").length;
  return {
    ok: true,
    keyConfigured: true,
    reachable,
    authorized,
    status,
    latencyMs,
    toolCount: tools.length,
    workflowCount,
    flowCount,
    sampleTools: tools.slice(0, 8).map((t) => ({ slug: t.slug, name: t.name, type: t.type })),
    error: null,
  };
}
