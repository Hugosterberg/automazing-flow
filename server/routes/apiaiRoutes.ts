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
import { accountInBusinessProfile } from "../lib/profileScope.ts";
import {
  checkApiaiHealth,
  estimateApiaiCost,
  fetchApiaiBalance,
  imageFieldNamesForTool,
  listTools,
  makeApiaiUrl,
  parseApiaiError,
  requiresImage,
  APIAI_TIMEOUT_MS,
  type ApiaiTool,
} from "../providers/apiai.ts";
import { publicMediaUrl, storeGeneratedMedia } from "../lib/generatedMediaStore.ts";
import { extractZipEntries } from "../lib/zipExtract.ts";

const APIAI_KEY = "APIAI_API_KEY";
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_INLINE_RESULT_BYTES = 3 * 1024 * 1024;

type TokenStore = {
  get: (id: string) => Promise<Record<string, unknown> | null | undefined>;
  set: (id: string, value: Record<string, unknown>) => Promise<unknown>;
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

async function appendDriveAsset({
  form,
  fieldName,
  asset,
  userId,
  businessProfileId,
  tokenStore,
  auth,
}: {
  form: FormData;
  fieldName: string;
  asset: SelectedAssetInput;
  userId: string;
  businessProfileId: string;
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
  if (!accountInBusinessProfile(stored, businessProfileId)) {
    throw new Error(`Drive account for ${asset.name || fileId} is not connected to this profile.`);
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

  // Connectivity + auth probe. Returns a structured diagnosis (key present?
  // host reachable? key accepted? how many tools?) so the UI / smoke script can
  // pinpoint exactly where the apiai.me integration breaks. Always 200 with a
  // body — the `ok` flag and `error` string carry the verdict.
  app.get("/api/apiai/health", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    const health = await checkApiaiHealth(apiKey);
    return res.json(health);
  });

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
      toolEndpoint?: string;
      prompt?: string;
      params?: Record<string, unknown>;
      assets?: SelectedAssetInput[];
      outputFilename?: string;
    };
    const toolSlug = String(body.toolSlug || "").trim();
    const toolType = String(body.toolType || "").trim();
    const toolEndpoint = String(body.toolEndpoint || "").trim();
    if (!toolSlug && !toolEndpoint) return res.status(400).json({ error: "toolSlug is required" });

    try {
      const tools = await listTools(apiKey);
      let tool =
        tools.find((candidate) => candidate.slug === toolSlug && (!toolType || candidate.type === toolType)) ??
        (toolEndpoint ? tools.find((candidate) => candidate.endpoint === toolEndpoint) : null);

      if (!tool && toolEndpoint) {
        tool = {
          slug: toolSlug || toolEndpoint.split("/").pop() || "custom",
          name: toolSlug || "Custom tool",
          endpoint: toolEndpoint,
          type: (toolType as ApiaiTool["type"]) || (toolEndpoint.includes("/flow/") ? "flow" : toolEndpoint.includes("/pipeline/") ? "pipeline" : "workflow"),
          acceptedInputs: ["image", "prompt"],
          requiredInputs: ["image"],
          outputTypes: [],
          params: [],
        };
      }

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
        await appendDriveAsset({ form, fieldName: targetImageField, asset, userId, businessProfileId, tokenStore, auth });
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
      const mediaId = storeGeneratedMedia(buffer, contentType);
      const mediaUrl = publicMediaUrl(req, mediaId);
      return res.json({
        resultType: "binary",
        contentType,
        filename,
        mediaUrl,
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

  app.get("/api/apiai/balance", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    if (!apiKey) {
      return res.status(400).json({
        error: "apiai_not_configured",
        message: "Add APIAI_API_KEY in Preferences -> API keys or as a server environment variable.",
      });
    }
    try {
      const balance = await fetchApiaiBalance(apiKey);
      return res.json({ balance });
    } catch (error) {
      return res.status(502).json({
        error: "apiai_balance_failed",
        message: error instanceof Error ? error.message : "Could not fetch apiai.me balance.",
      });
    }
  });

  app.post("/api/apiai/estimate", requireMembership, async (req, res) => {
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
      toolEndpoint?: string;
      params?: Record<string, unknown>;
    };
    const toolSlug = String(body.toolSlug || "").trim();
    const toolEndpoint = String(body.toolEndpoint || "").trim();
    if (!toolSlug && !toolEndpoint) return res.status(400).json({ error: "toolSlug is required" });

    try {
      const tools = await listTools(apiKey);
      const tool =
        tools.find((candidate) => candidate.slug === toolSlug) ??
        (toolEndpoint ? tools.find((candidate) => candidate.endpoint === toolEndpoint) : null) ??
        ({
          slug: toolSlug || toolEndpoint.split("/").pop() || "custom",
          endpoint: toolEndpoint || `/api/process/${toolSlug}`,
        } as ApiaiTool);

      const estimate = await estimateApiaiCost(apiKey, tool, body.params || {});
      return res.json(estimate);
    } catch (error) {
      return res.status(502).json({
        error: "apiai_estimate_failed",
        message: error instanceof Error ? error.message : "Could not estimate apiai.me cost.",
      });
    }
  });

  app.get("/api/apiai/batch", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    if (!apiKey) {
      return res.status(400).json({
        error: "apiai_not_configured",
        message: "Add APIAI_API_KEY in Preferences -> API keys or as a server environment variable.",
      });
    }
    try {
      const upstream = await fetch(makeApiaiUrl("/api/v1/batch"), {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: "apiai_batch_list_failed",
          message: await parseApiaiError(upstream),
        });
      }
      const body = await upstream.json().catch(() => []);
      const jobs = Array.isArray(body) ? body : Array.isArray(body?.jobs) ? body.jobs : [];
      return res.json({ jobs });
    } catch (error) {
      return res.status(502).json({
        error: "apiai_batch_list_failed",
        message: error instanceof Error ? error.message : "Could not list apiai.me batch jobs.",
      });
    }
  });

  app.get("/api/apiai/batch/:id", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    if (!apiKey) {
      return res.status(400).json({
        error: "apiai_not_configured",
        message: "Add APIAI_API_KEY in Preferences -> API keys or as a server environment variable.",
      });
    }
    const batchId = String(req.params.id || "").trim();
    if (!batchId) return res.status(400).json({ error: "batch_id_required" });
    try {
      const upstream = await fetch(makeApiaiUrl(`/api/v1/batch/${encodeURIComponent(batchId)}`), {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: "apiai_batch_get_failed",
          message: await parseApiaiError(upstream),
        });
      }
      return res.json(await upstream.json().catch(() => ({})));
    } catch (error) {
      return res.status(502).json({
        error: "apiai_batch_get_failed",
        message: error instanceof Error ? error.message : "Could not fetch apiai.me batch job.",
      });
    }
  });

  app.get("/api/apiai/batch/:id/download", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    if (!apiKey) {
      return res.status(400).json({
        error: "apiai_not_configured",
        message: "Add APIAI_API_KEY in Preferences -> API keys or as a server environment variable.",
      });
    }
    const batchId = String(req.params.id || "").trim();
    if (!batchId) return res.status(400).json({ error: "batch_id_required" });
    try {
      const upstream = await fetch(makeApiaiUrl(`/api/v1/batch/${encodeURIComponent(batchId)}/download`), {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
      });
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status).json({
          error: "apiai_batch_download_failed",
          message: await parseApiaiError(upstream),
        });
      }
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/zip");
      const disposition = upstream.headers.get("content-disposition");
      if (disposition) res.setHeader("Content-Disposition", disposition);
      return res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      return res.status(502).json({
        error: "apiai_batch_download_failed",
        message: error instanceof Error ? error.message : "Could not download apiai.me batch results.",
      });
    }
  });

  app.post("/api/apiai/batch/:id/ingest", requireMembership, async (req, res) => {
    const businessProfileId = String(req.businessProfileId || "").trim();
    const apiKey = await resolveApiaiKey(secretResolver, businessProfileId);
    if (!apiKey) {
      return res.status(400).json({
        error: "apiai_not_configured",
        message: "Add APIAI_API_KEY in Preferences -> API keys or as a server environment variable.",
      });
    }
    const batchId = String(req.params.id || "").trim();
    if (!batchId) return res.status(400).json({ error: "batch_id_required" });
    try {
      const upstream = await fetch(makeApiaiUrl(`/api/v1/batch/${encodeURIComponent(batchId)}/download`), {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: "apiai_batch_ingest_failed",
          message: await parseApiaiError(upstream),
        });
      }
      const zipBuffer = Buffer.from(await upstream.arrayBuffer());
      const { entries, skipped } = extractZipEntries(zipBuffer);
      if (entries.length === 0) {
        return res.status(422).json({
          error: "no_media_in_batch",
          message: "No image files found in the batch ZIP.",
          skipped,
        });
      }
      const items = entries.map((entry) => {
        const id = storeGeneratedMedia(entry.data, entry.contentType);
        return {
          filename: entry.name,
          contentType: entry.contentType,
          mediaUrl: publicMediaUrl(req, id),
          kind: entry.contentType.startsWith("video/") ? "video" : "image",
          size: entry.data.length,
        };
      });
      return res.json({
        batchId: Number(batchId),
        items,
        skipped,
      });
    } catch (error) {
      return res.status(502).json({
        error: "apiai_batch_ingest_failed",
        message: error instanceof Error ? error.message : "Could not ingest apiai.me batch results.",
      });
    }
  });

  app.post("/api/apiai/batch", requireMembership, async (req, res) => {
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
      workflow?: string;
      params?: Record<string, unknown>;
      assets?: SelectedAssetInput[];
    };
    const workflow = String(body.workflow || "").trim();
    if (!workflow) return res.status(400).json({ error: "workflow is required" });

    const assets = Array.isArray(body.assets) ? body.assets.filter((asset) => asset.kind === "image") : [];
    if (assets.length === 0) {
      return res.status(400).json({
        error: "apiai_batch_requires_images",
        message: "Select at least one image in Content before starting a batch job.",
      });
    }

    try {
      const form = new FormData();
      form.append("workflow", workflow);
      for (const [key, value] of Object.entries(body.params || {})) {
        const trimmedKey = String(key || "").trim();
        if (!trimmedKey || value == null || value === "") continue;
        form.append(trimmedKey, typeof value === "string" ? value : JSON.stringify(value));
      }
      for (const asset of assets) {
        await appendDriveAsset({
          form,
          fieldName: "images",
          asset,
          userId,
          businessProfileId,
          tokenStore,
          auth,
        });
      }

      const upstream = await fetch(makeApiaiUrl("/api/v1/batch"), {
        method: "POST",
        headers: { "X-API-Key": apiKey },
        body: form,
        signal: AbortSignal.timeout(APIAI_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          error: "apiai_batch_create_failed",
          message: await parseApiaiError(upstream),
        });
      }
      return res.status(upstream.status).json(await upstream.json().catch(() => ({})));
    } catch (error) {
      return res.status(502).json({
        error: "apiai_batch_create_failed",
        message: error instanceof Error ? error.message : "Could not create apiai.me batch job.",
      });
    }
  });
}
