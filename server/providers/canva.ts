const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export type CanvaExportFormat = "png" | "jpg";

export type CanvaExportResult =
  | { ok: true; url: string; jobId: string; urls: string[] }
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
