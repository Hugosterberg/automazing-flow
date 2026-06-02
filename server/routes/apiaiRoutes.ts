/**
 * apiai.me proxy routes.
 *
 * Keeps APIAI_API_KEY server-side and resolves it per business profile via
 * integration_secrets with env fallback. Selected Google Drive assets are read
 * through the existing Drive provider so ownership and token refresh stay in
 * one place.
 */

import { fetchGoogleDriveFileResponse } from "../providers/googleDrive.ts";
import type { AuthHelpers } from "../lib/authHelpers.ts";
import type { SecretResolver } from "../lib/secretResolver.ts";

const APIAI_BASE_URL = "https://apiai.me/api";
const APIAI_KEY = "APIAI_API_KEY";
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_INLINE_RESULT_BYTES = 3 * 1024 * 1024;
const APIAI_TIMEOUT_MS = 50_000;

type TokenStore = {
  get: (id: string) => Promise<Record<string, unknown> | null | undefined>;
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
};

type ApiaiParam = {
  name?: string;
  expose_name?: string;
  description?: string;
  default_value?: unknown;
  allowed_values?: unknown[];
  required?: boolean;
  is_image?: boolean;
};

type ApiaiTool = {
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

type SelectedAssetInput = {
  id?: string;
  name?: string;
  mimeType?: string;
  kind?: "image" | "video";
  sourceAccountId?: string;
};

interface ApiaiRoutesDeps {
  auth: AuthHelpers;
  tokenStore: TokenStore;
  secretResolver: SecretResolver;
  requireMembership: (req: unknown, res: unknown, next: () => void) => void;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizeParams(value: unknown): ApiaiParam[] {
  return Array.isArray(value) ? (value as ApiaiParam[]) : [];
}

function normalizeWorkflow(raw: Record<string, unknown>): ApiaiTool | null {
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

function normalizeFlow(raw: Record<string, unknown>): ApiaiTool | null {
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

async function parseApiaiError(res: Response): Promise<string> {
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

function makeApiaiUrl(endpoint: string): string {
  const clean = endpoint.startsWith("/api/") ? endpoint.slice(4) : endpoint;
  return `${APIAI_BASE_URL}${clean.startsWith("/") ? clean : `/${clean}`}`;
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

async function listTools(apiKey: string): Promise<ApiaiTool[]> {
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

function imageFieldNamesForTool(tool: ApiaiTool): string[] {
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

function requiresImage(tool: ApiaiTool): boolean {
  return tool.requiredInputs.some((input) => input.toLowerCase() === "image" || input.toLowerCase() === "video")
    || tool.params.some((param) => Boolean(param.required && param.is_image));
}

async function appendDriveAsset({
  form,
  fieldName,
  asset,
  userId,
  tokenStore,
  auth,
}: {
  form: FormData;
  fieldName: string;
  asset: SelectedAssetInput;
  userId: string;
  tokenStore: TokenStore;
  auth: AuthHelpers;
}) {
  const accountId = String(asset.sourceAccountId || "").trim();
  const fileId = String(asset.id || "").trim();
  if (!accountId || !fileId) {
    throw new Error("Selected asset is missing Drive account or file id.");
  }

  const stored = await tokenStore.get(accountId);
  if (!stored || stored.platform !== "google_drive") {
    throw new Error(`Drive account for ${asset.name || fileId} is not connected.`);
  }
  const access = auth.getStoredAccountAccess(stored, userId);
  if (!access.allowed) {
    throw new Error(`You do not have access to ${asset.name || fileId}.`);
  }
  if (access.migrate) {
    await tokenStore.set(accountId, { ...stored, ownerUserId: userId });
  }

  const upstream = await fetchGoogleDriveFileResponse({
    accessToken: stored.accessToken as string,
    refreshToken: stored.refreshToken as string | undefined,
    accountId,
    tokenStore,
    stored,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    fileId,
    mode: "content",
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`Could not download ${asset.name || fileId} from Google Drive.`);
  }

  const contentLength = Number(upstream.headers.get("content-length") || "0");
  if (contentLength > MAX_INPUT_BYTES) {
    throw new Error(`${asset.name || fileId} is too large for direct generation (${Math.ceil(contentLength / 1024 / 1024)} MB).`);
  }

  const contentType = upstream.headers.get("content-type") || asset.mimeType || "application/octet-stream";
  const buffer = Buffer.from(await upstream.arrayBuffer());
  if (buffer.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`${asset.name || fileId} is too large for direct generation (${Math.ceil(buffer.byteLength / 1024 / 1024)} MB).`);
  }

  const filename = String(asset.name || `${fileId}.${contentType.split("/")[1] || "bin"}`);
  form.append(fieldName, new Blob([buffer], { type: contentType }), filename);
}

async function resolveApiaiKey(secretResolver: SecretResolver, businessProfileId: string): Promise<string | null> {
  return secretResolver.resolve(businessProfileId, APIAI_KEY);
}

export function registerApiaiRoutes(app, deps: ApiaiRoutesDeps) {
  const { auth, tokenStore, secretResolver, requireMembership } = deps;

  app.get("/api/apiai/tools", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    if (!apiKey) {
      return res.status(400).json({
        error: "apiai_not_configured",
        message: "Add APIAI_API_KEY in Preferences -> API keys or as a server environment variable.",
      });
    }

    try {
      const tools = await listTools(apiKey);
      return res.json({ tools });
    } catch (error) {
      console.error("[apiai] list tools failed:", error);
      return res.status(502).json({
        error: "apiai_tools_failed",
        message: error instanceof Error ? error.message : "Could not load apiai.me tools.",
      });
    }
  });

  app.post("/api/apiai/run", requireMembership, async (req, res) => {
    const userId = auth.getSessionUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    if (!apiKey) {
      return res.status(400).json({
        error: "apiai_not_configured",
        message: "Add APIAI_API_KEY in Preferences -> API keys or as a server environment variable.",
      });
    }

    const body = (req.body ?? {}) as {
      toolSlug?: string;
      toolType?: string;
      prompt?: string;
      params?: Record<string, unknown>;
      assets?: SelectedAssetInput[];
      outputFilename?: string;
    };
    const toolSlug = String(body.toolSlug || "").trim();
    const toolType = String(body.toolType || "").trim();
    if (!toolSlug) return res.status(400).json({ error: "toolSlug is required" });

    try {
      const tools = await listTools(apiKey);
      const tool = tools.find((candidate) => candidate.slug === toolSlug && (!toolType || candidate.type === toolType));
      if (!tool) return res.status(404).json({ error: "apiai_tool_not_found" });

      const imageFieldNames = imageFieldNamesForTool(tool);
      const assets = Array.isArray(body.assets) ? body.assets : [];
      const mediaAssets = assets.filter((asset) =>
        imageFieldNames.includes("video")
          ? asset.kind === "video" || asset.kind === "image"
          : asset.kind === "image"
      );
      if (requiresImage(tool) && mediaAssets.length === 0) {
        return res.status(400).json({
          error: "apiai_requires_image",
          message: "This apiai.me tool requires an image. Select at least one image in Content first.",
        });
      }

      const maxImages = Math.max(1, Number(tool.maxImages || 1));
      const selectedAssets = mediaAssets.slice(0, maxImages);
      const form = new FormData();
      const prompt = String(body.prompt || "").trim();
      if (prompt) form.append("prompt", prompt);
      const outputFilename = String(body.outputFilename || "").trim();
      if (outputFilename) form.append("output_filename", outputFilename);

      for (const [key, value] of Object.entries(body.params || {})) {
        const trimmedKey = String(key || "").trim();
        if (!trimmedKey || value == null || value === "") continue;
        form.append(trimmedKey, typeof value === "string" ? value : JSON.stringify(value));
      }

      const targetImageField = imageFieldNames[0] || "image";
      for (const asset of selectedAssets) {
        await appendDriveAsset({ form, fieldName: targetImageField, asset, userId, tokenStore, auth });
      }

      const upstream = await fetch(makeApiaiUrl(tool.endpoint), {
        method: "POST",
        headers: { "X-API-Key": apiKey },
        body: form,
        signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
      });

      const headers = {
        requestId: upstream.headers.get("x-request-id"),
        processingTime: upstream.headers.get("x-processing-time"),
        cost: upstream.headers.get("x-cost"),
        balanceRemaining: upstream.headers.get("x-balance-remaining"),
        workflow: upstream.headers.get("x-workflow"),
      };

      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: "apiai_run_failed",
          message: await parseApiaiError(upstream),
          headers,
        });
      }

      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      if (contentType.includes("application/json")) {
        const data = await upstream.json().catch(() => ({}));
        return res.json({ resultType: "json", data, headers });
      }

      const contentLength = Number(upstream.headers.get("content-length") || "0");
      if (contentLength > MAX_INLINE_RESULT_BYTES) {
        return res.status(413).json({
          error: "apiai_result_too_large",
          message: "apiai.me returned a large binary result. Use a smaller output setting or run this pipeline from the apiai.me dashboard.",
          headers,
        });
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.byteLength > MAX_INLINE_RESULT_BYTES) {
        return res.status(413).json({
          error: "apiai_result_too_large",
          message: "apiai.me returned a large binary result. Use a smaller output setting or run this pipeline from the apiai.me dashboard.",
          headers,
        });
      }

      const disposition = upstream.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename = filenameMatch?.[1] || `${tool.slug}.${contentType.split("/")[1] || "bin"}`;
      return res.json({
        resultType: "binary",
        contentType,
        filename,
        dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
        size: buffer.byteLength,
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "apiai.me request failed.";
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      console.error("[apiai] run failed:", message);
      return res.status(isTimeout ? 504 : 502).json({
        error: isTimeout ? "apiai_timeout" : "apiai_proxy_failed",
        message: isTimeout
          ? "apiai.me did not finish before the server timeout. Try a lighter tool or run long video/pipeline jobs in apiai.me."
          : message,
      });
    }
  });
}
