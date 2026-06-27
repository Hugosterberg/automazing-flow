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
