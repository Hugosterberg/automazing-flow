import { apiUrl } from "@/lib/apiBase";
import type { SelectedContentAsset } from "@/lib/contentSelection";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

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

export type ApiaiRunHeaders = {
  requestId?: string | null;
  processingTime?: string | null;
  cost?: string | null;
  balanceRemaining?: string | null;
  workflow?: string | null;
};

export type ApiaiRunResult =
  | {
      resultType: "json";
      data: unknown;
      headers?: ApiaiRunHeaders;
    }
  | {
      resultType: "binary";
      contentType: string;
      filename: string;
      mediaUrl?: string;
      dataUrl?: string;
      size: number;
      headers?: ApiaiRunHeaders;
    };

async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string") return body.error;
  return res.statusText || "Request failed";
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
 * Probe apiai.me connectivity + auth for a profile. The endpoint always
 * returns 200 with a structured verdict, so this only throws on transport
 * errors (server unreachable), not on a bad/missing apiai key.
 */
export async function checkApiaiHealth(businessProfileId: string): Promise<ApiaiHealth> {
  const params = new URLSearchParams({ business_profile_id: businessProfileId });
  const res = await fetchWithTimeout(apiUrl(`/api/apiai/health?${params.toString()}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ApiaiHealth;
}

export async function listApiaiTools(businessProfileId: string): Promise<ApiaiTool[]> {
  const params = new URLSearchParams({ business_profile_id: businessProfileId });
  const res = await fetchWithTimeout(apiUrl(`/api/apiai/tools?${params.toString()}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.tools) ? body.tools : [];
}

export async function runApiaiTool(input: {
  businessProfileId: string;
  tool: ApiaiTool;
  prompt: string;
  params: Record<string, string>;
  assets: SelectedContentAsset[];
  outputFilename?: string;
}): Promise<ApiaiRunResult> {
  const res = await fetchWithTimeout(apiUrl("/api/apiai/run"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_profile_id: input.businessProfileId,
      toolSlug: input.tool.slug,
      toolType: input.tool.type,
      toolEndpoint: input.tool.endpoint,
      prompt: input.prompt,
      params: input.params,
      assets: input.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        mimeType: asset.mimeType,
        kind: asset.kind,
        sourceAccountId: asset.sourceAccountId,
      })),
      outputFilename: input.outputFilename,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ApiaiRunResult;
}
