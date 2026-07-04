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

export type ApiaiCostEstimate = {
  slug?: string;
  kind?: string;
  estimate?: number;
  min?: number;
  max?: number;
  reconciled?: boolean;
  note?: string;
};

export async function estimateApiaiTool(input: {
  businessProfileId: string;
  tool: ApiaiTool;
  params?: Record<string, string>;
}): Promise<ApiaiCostEstimate> {
  const res = await fetchWithTimeout(apiUrl("/api/apiai/estimate"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_profile_id: input.businessProfileId,
      toolSlug: input.tool.slug,
      toolEndpoint: input.tool.endpoint,
      params: input.params ?? {},
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ApiaiCostEstimate;
}

export async function fetchApiaiBalance(businessProfileId: string): Promise<number | null> {
  const params = new URLSearchParams({ business_profile_id: businessProfileId });
  const res = await fetchWithTimeout(apiUrl(`/api/apiai/balance?${params.toString()}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = await res.json().catch(() => ({}));
  return typeof body?.balance === "number" ? body.balance : null;
}

export type ApiaiBatchSummary = {
  id: number;
  status?: string;
  workflow?: string;
  total_items?: number;
  completed_items?: number;
  created_at?: string;
};

export type ApiaiBatchJob = ApiaiBatchSummary & {
  items?: Array<Record<string, unknown>>;
  estimated_cost?: number;
};

export async function createApiaiBatch(input: {
  businessProfileId: string;
  workflow: string;
  assets: SelectedContentAsset[];
  params?: Record<string, string>;
}): Promise<ApiaiBatchJob> {
  const res = await fetchWithTimeout(apiUrl("/api/apiai/batch"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_profile_id: input.businessProfileId,
      workflow: input.workflow,
      params: input.params ?? {},
      assets: input.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        mimeType: asset.mimeType,
        kind: asset.kind,
        sourceAccountId: asset.sourceAccountId,
      })),
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ApiaiBatchJob;
}

export async function listApiaiBatches(businessProfileId: string): Promise<ApiaiBatchSummary[]> {
  const params = new URLSearchParams({ business_profile_id: businessProfileId });
  const res = await fetchWithTimeout(apiUrl(`/api/apiai/batch?${params.toString()}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.jobs) ? body.jobs : [];
}

export async function getApiaiBatch(businessProfileId: string, batchId: number): Promise<ApiaiBatchJob> {
  const params = new URLSearchParams({ business_profile_id: businessProfileId });
  const res = await fetchWithTimeout(apiUrl(`/api/apiai/batch/${batchId}?${params.toString()}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ApiaiBatchJob;
}
