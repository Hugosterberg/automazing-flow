const CANVA_API_BASE = "https://api.canva.com/rest/v1";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";

export type CanvaExportFormat = "png" | "jpg";

export type CanvaExportResult =
  | { ok: true; url: string; jobId: string; urls: string[] }
  | { ok: false; status: number; message: string; details?: unknown };

export type CanvaTokenResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      scope?: string;
      tokenType?: string;
    }
  | { ok: false; status: number; message: string; details?: unknown };

function canvaHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json().catch(() => ({}))) || {}) as Record<string, unknown>;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

async function requestCanvaToken(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string
): Promise<CanvaTokenResult> {
  const response = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.access_token) {
    return {
      ok: false,
      status: response.status,
      message: String(payload.error_description || payload.message || payload.error || "Canva token request failed."),
      details: payload,
    };
  }
  return {
    ok: true,
    accessToken: String(payload.access_token),
    refreshToken: payload.refresh_token ? String(payload.refresh_token) : undefined,
    expiresIn: Number.isFinite(Number(payload.expires_in)) ? Number(payload.expires_in) : undefined,
    scope: payload.scope ? String(payload.scope) : undefined,
    tokenType: payload.token_type ? String(payload.token_type) : undefined,
  };
}

export async function exchangeCanvaOAuthCode(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<CanvaTokenResult> {
  return requestCanvaToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: options.code,
      code_verifier: options.codeVerifier,
      redirect_uri: options.redirectUri,
    }),
    options.clientId,
    options.clientSecret
  );
}

export async function refreshCanvaAccessToken(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<CanvaTokenResult> {
  return requestCanvaToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: options.refreshToken,
    }),
    options.clientId,
    options.clientSecret
  );
}

export async function fetchCanvaUserIdentity(accessToken: string): Promise<{
  id: string | null;
  username: string;
}> {
  const response = await fetch(`${CANVA_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readJson(response);
  const user = (payload.user || payload) as Record<string, unknown>;
  const id = String(user.id || user.team_user_id || "").trim() || null;
  const username =
    String(user.display_name || user.name || user.email || user.id || "").trim() ||
    "Canva";
  return { id, username };
}

export async function exportCanvaDesignImage(options: {
  accessToken: string;
  designId: string;
  format?: CanvaExportFormat;
  width?: number;
  height?: number;
  timeoutMs?: number;
}): Promise<CanvaExportResult> {
  const format = options.format ?? "png";
  const body: Record<string, unknown> = {
    design_id: options.designId,
    format:
      format === "jpg"
        ? { type: "jpg", quality: 90, width: options.width, height: options.height }
        : { type: "png", width: options.width, height: options.height },
  };

  const create = await fetch(`${CANVA_API_BASE}/exports`, {
    method: "POST",
    headers: canvaHeaders(options.accessToken),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const created = await readJson(create);
  if (!create.ok) {
    return {
      ok: false,
      status: create.status,
      message: String(created.message || created.error || "Canva export could not be started."),
      details: created,
    };
  }

  const job = (created.job || {}) as Record<string, unknown>;
  const jobId = String(job.id || "");
  if (!jobId) {
    return { ok: false, status: 502, message: "Canva did not return an export job id.", details: created };
  }

  const deadline = Date.now() + (options.timeoutMs ?? 45_000);
  let last: Record<string, unknown> = created;
  while (Date.now() < deadline) {
    const poll = await fetch(`${CANVA_API_BASE}/exports/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${options.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(poll);
    last = payload;
    if (!poll.ok) {
      return {
        ok: false,
        status: poll.status,
        message: String(payload.message || payload.error || "Canva export status could not be read."),
        details: payload,
      };
    }
    const pollJob = (payload.job || {}) as Record<string, unknown>;
    const status = String(pollJob.status || "");
    if (status === "success") {
      const urls = Array.isArray(pollJob.urls) ? pollJob.urls.map((url) => String(url)).filter(Boolean) : [];
      if (urls[0]) return { ok: true, url: urls[0], urls, jobId };
      return { ok: false, status: 502, message: "Canva export succeeded without a download URL.", details: payload };
    }
    if (status === "failed") {
      return { ok: false, status: 502, message: "Canva export failed.", details: payload };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return { ok: false, status: 504, message: "Canva export timed out.", details: last };
}

export interface CanvaBrandTemplateSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export type CanvaBrandTemplatesResult =
  | { ok: true; items: CanvaBrandTemplateSummary[]; continuation?: string }
  | { ok: false; status: number; message: string; details?: unknown };

/** List the caller's Canva Brand Templates — the picker for which style to autofill into. */
export async function listCanvaBrandTemplates(options: {
  accessToken: string;
  query?: string;
  limit?: number;
}): Promise<CanvaBrandTemplatesResult> {
  const url = new URL(`${CANVA_API_BASE}/brand-templates`);
  if (options.query) url.searchParams.set("query", options.query);
  url.searchParams.set("limit", String(Math.min(Math.max(options.limit ?? 25, 1), 100)));
  url.searchParams.set("dataset", "non_empty");
  url.searchParams.set("sort_by", "modified_descending");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${options.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: String(payload.message || payload.error || "Canva brand templates could not be listed."),
      details: payload,
    };
  }
  const items = (Array.isArray(payload.items) ? payload.items : []).map((raw) => {
    const item = raw as Record<string, unknown>;
    const thumbnail = (item.thumbnail || {}) as Record<string, unknown>;
    return {
      id: String(item.id || ""),
      title: String(item.title || "Untitled template"),
      thumbnailUrl: thumbnail.url ? String(thumbnail.url) : null,
    };
  }).filter((item) => item.id);
  return { ok: true, items, continuation: payload.continuation ? String(payload.continuation) : undefined };
}

export interface CanvaTemplateDatasetField {
  name: string;
  type: "text" | "image" | "chart" | "sheet" | "other";
}

export type CanvaTemplateDatasetResult =
  | { ok: true; fields: CanvaTemplateDatasetField[] }
  | { ok: false; status: number; message: string; details?: unknown };

/** The autofillable field names/types a Brand Template exposes (built by the user in Canva's editor). */
export async function fetchCanvaBrandTemplateDataset(options: {
  accessToken: string;
  brandTemplateId: string;
}): Promise<CanvaTemplateDatasetResult> {
  const response = await fetch(
    `${CANVA_API_BASE}/brand-templates/${encodeURIComponent(options.brandTemplateId)}/dataset`,
    {
      headers: { Authorization: `Bearer ${options.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    }
  );
  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: String(payload.message || payload.error || "Canva brand template dataset could not be read."),
      details: payload,
    };
  }
  const dataset = (payload.dataset || {}) as Record<string, unknown>;
  const fields: CanvaTemplateDatasetField[] = Object.entries(dataset).map(([name, def]) => {
    const type = String((def as Record<string, unknown>)?.type || "other");
    return {
      name,
      type: type === "text" || type === "image" || type === "chart" || type === "sheet" ? type : "other",
    };
  });
  return { ok: true, fields };
}

export type CanvaAutofillDataField =
  | { type: "text"; text: string }
  | { type: "image"; asset_id: string };

export type CanvaAutofillResult =
  | {
      ok: true;
      designId: string;
      editUrl: string | null;
      viewUrl: string | null;
      thumbnailUrl: string | null;
    }
  | { ok: false; status: number; message: string; details?: unknown };

/**
 * Create a design from a Brand Template, autofilled with generated text (and
 * optionally image asset ids). Async job, mirrors `exportCanvaDesignImage`'s
 * create-then-poll shape.
 */
export async function createCanvaAutofillDesign(options: {
  accessToken: string;
  brandTemplateId: string;
  title?: string;
  data: Record<string, CanvaAutofillDataField>;
  timeoutMs?: number;
}): Promise<CanvaAutofillResult> {
  const create = await fetch(`${CANVA_API_BASE}/autofills`, {
    method: "POST",
    headers: canvaHeaders(options.accessToken),
    body: JSON.stringify({
      type: "create_from_brand_template",
      brand_template_id: options.brandTemplateId,
      title: options.title?.slice(0, 255),
      data: options.data,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const created = await readJson(create);
  if (!create.ok) {
    return {
      ok: false,
      status: create.status,
      message: String(created.message || created.error || "Canva autofill could not be started."),
      details: created,
    };
  }

  const job = (created.job || {}) as Record<string, unknown>;
  const jobId = String(job.id || "");
  if (!jobId) {
    return { ok: false, status: 502, message: "Canva did not return an autofill job id.", details: created };
  }

  const deadline = Date.now() + (options.timeoutMs ?? 40_000);
  let last: Record<string, unknown> = created;
  while (Date.now() < deadline) {
    const poll = await fetch(`${CANVA_API_BASE}/autofills/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${options.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await readJson(poll);
    last = payload;
    if (!poll.ok) {
      return {
        ok: false,
        status: poll.status,
        message: String(payload.message || payload.error || "Canva autofill status could not be read."),
        details: payload,
      };
    }
    const pollJob = (payload.job || {}) as Record<string, unknown>;
    const status = String(pollJob.status || "");
    if (status === "success") {
      const result = (pollJob.result || {}) as Record<string, unknown>;
      const design = (result.design || {}) as Record<string, unknown>;
      const urls = (design.urls || {}) as Record<string, unknown>;
      const thumbnail = (design.thumbnail || {}) as Record<string, unknown>;
      const designId = String(design.id || "");
      if (!designId) {
        return { ok: false, status: 502, message: "Canva autofill succeeded without a design id.", details: payload };
      }
      return {
        ok: true,
        designId,
        editUrl: urls.edit_url ? String(urls.edit_url) : null,
        viewUrl: urls.view_url ? String(urls.view_url) : null,
        thumbnailUrl: thumbnail.url ? String(thumbnail.url) : null,
      };
    }
    if (status === "failed") {
      const error = (pollJob.error || {}) as Record<string, unknown>;
      return {
        ok: false,
        status: 502,
        message: String(error.message || "Canva autofill failed."),
        details: payload,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return { ok: false, status: 504, message: "Canva autofill timed out.", details: last };
}
